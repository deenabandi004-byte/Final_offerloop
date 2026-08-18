"""Phase 1: the real brain behind POST /api/mobile/scout/ask action='ask'.

Two layers:
  - Unit: _scout_ask_contract translates the brain's web envelope into the
    SCOUT-ACTION-CONTRACT mobile envelope (typed actions, receipts, jobRefs,
    error codes). Pure function, no mocks.
  - Route: the 'ask' branch wires auth, throttle, askId idempotency, and the
    brain call. The brain itself is mocked (async) - its behavior is pinned
    by the scout suites; here we pin the translator boundary.

The test app is built from backend.wsgi, so the LIVE route module is the
backend.-prefixed copy - patch that one for route-level attributes; the
route's inner `from app.services...` imports resolve the app.* tree, so
service-level patches use the app.-prefixed path (see HANDOFF-session
"dual module tree" trap).
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.routes import mobile as mobile_route

pytestmark = pytest.mark.unit

_contract = mobile_route._scout_ask_contract


def _env(**over):
    base = {
        'tool': 'answer', 'message': 'Here you go.', 'navigate': None,
        'mode': 'chat', 'intent': None, 'cta': None, 'plan': None,
        'chat_id': 'chat-123', 'tool_results': [],
    }
    base.update(over)
    return base


# ===========================================================================
# Unit: the translator
# ===========================================================================

class TestContractTranslator:
    def test_plain_answer_has_say_and_no_actions(self):
        out = _contract(_env(message='MBB opens late August.'), 'ask-1')
        assert out == {
            'say': 'MBB opens late August.', 'actions': [],
            'askId': 'ask-1', 'conversationId': 'chat-123',
        }

    def test_cta_chip_becomes_navigate_action(self):
        out = _contract(_env(cta={
            'label': 'Find 5 MBB alumni', 'route': '/find',
            'prefill': {'company': 'McKinsey'},
        }), 'ask-2')
        assert out['actions'] == [{
            'type': 'navigate',
            'params': {'route': '/find', 'prefill': {'company': 'McKinsey'},
                       'label': 'Find 5 MBB alumni'},
            'needsConfirm': False, 'jobRef': None, 'results': None,
        }]

    def test_navigate_tool_becomes_navigate_action(self):
        out = _contract(_env(tool='navigate', navigate={
            'route': '/coffee-chat-prep', 'prefill': {'linkedin_url': 'https://x'},
            'reasoning': 'Prep for your chat with Sarah.',
        }), 'ask-3')
        assert out['actions'][0]['type'] == 'navigate'
        assert out['actions'][0]['params']['route'] == '/coffee-chat-prep'
        assert out['actions'][0]['params']['label'].startswith('Prep for your chat')

    def test_find_contacts_receipt_becomes_contact_cards(self):
        out = _contract(_env(tool_results=[{
            'name': 'find_contacts',
            'result': {'count': 2, 'company': 'Goldman Sachs', 'credits_charged': 10,
                       'saved_to_network': True,
                       'contacts': [
                           {'name': 'Sarah Kim', 'title': 'VP Recruiting',
                            'company': 'Goldman Sachs',
                            'linkedin_url': 'https://linkedin.com/in/sk',
                            'email': 'sk@gs.com', 'contact_id': 'c-9'},
                           {'name': '', 'title': 'dropped - no name'},
                       ]},
        }]), 'ask-4')
        assert len(out['actions']) == 1
        act = out['actions'][0]
        assert act['type'] == 'find_contacts'
        assert act['results']['kind'] == 'contacts'
        assert act['results']['items'] == [{
            'name': 'Sarah Kim', 'title': 'VP Recruiting',
            'company': 'Goldman Sachs',
            'linkedinUrl': 'https://linkedin.com/in/sk',
            'email': 'sk@gs.com', 'contactId': 'c-9',
        }]
        assert 'error' not in out

    def test_zero_result_search_maps_no_results(self):
        out = _contract(_env(tool_results=[{
            'name': 'find_contacts',
            'result': {'count': 0, 'contacts': [], 'company': 'Acme'},
        }]), 'ask-5')
        assert out['actions'] == []
        assert out['error'] == {'code': 'no_results', 'detail': ''}

    def test_hiring_managers_receipt(self):
        out = _contract(_env(tool_results=[{
            'name': 'find_hiring_managers',
            'result': {'count': 1, 'company': 'Bain',
                       'managers': [{'name': 'Ana Diaz', 'title': 'Recruiter',
                                     'company': 'Bain', 'linkedin_url': ''}]},
        }]), 'ask-6')
        assert out['actions'][0]['type'] == 'find_hiring_managers'
        assert out['actions'][0]['results']['items'][0]['name'] == 'Ana Diaz'

    def test_draft_receipt_becomes_draft_action(self):
        out = _contract(_env(tool_results=[{
            'name': 'draft_outreach_emails',
            'result': {'count': 2, 'drafted': [
                {'name': 'Sam Hill', 'company': 'Bain', 'contact_id': 'c-1',
                 'gmail_draft_url': 'https://mail.google.com/x'},
                {'name': 'Ana Diaz', 'company': 'Bain', 'contact_id': 'c-2',
                 'gmail_draft_url': 'https://mail.google.com/y'},
            ], 'skipped': []},
        }]), 'ask-7')
        act = out['actions'][0]
        assert act['type'] == 'draft_outreach'
        assert act['params'] == {'count': 2}
        assert [i['contactId'] for i in act['results']['items']] == ['c-1', 'c-2']

    def test_meeting_prep_receipt_carries_job_ref(self):
        out = _contract(_env(tool_results=[{
            'name': 'run_meeting_prep',
            'result': {'started': True, 'prep_id': 'prep-42',
                       'contact_name': 'Sarah Kim', 'credits_charged': 30},
        }]), 'ask-8')
        act = out['actions'][0]
        assert act['type'] == 'meeting_prep'
        assert act['jobRef'] == {'kind': 'meeting_prep', 'id': 'prep-42'}

    def test_insufficient_credits_code_maps(self):
        out = _contract(_env(tool_results=[{
            'name': 'run_meeting_prep',
            'result': {'started': False, 'error': 'not enough credits',
                       'code': 'INSUFFICIENT_CREDITS',
                       'credits_needed': 30, 'current_credits': 5},
        }]), 'ask-9')
        assert out['error'] == {'code': 'insufficient_credits',
                                'detail': 'not enough credits'}
        assert out['actions'] == []

    def test_gmail_and_tier_codes_map(self):
        out = _contract(_env(tool_results=[{
            'name': 'draft_outreach_emails',
            'result': {'error': 'gmail not connected',
                       'code': 'GMAIL_NOT_CONNECTED'},
        }]), 'ask-10')
        assert out['error']['code'] == 'gmail_disconnected'
        out = _contract(_env(tool_results=[{
            'name': 'auto_apply_to_job',
            'result': {'error': 'pro required', 'code': 'TIER_REQUIRED'},
        }]), 'ask-11')
        assert out['error']['code'] == 'cap_reached'
        assert out['actions'] == []  # errored auto-apply carries no jobRef

    def test_consent_and_count_codes_stay_conversational(self):
        # The brain speaks these in `say`; no error affordance needed.
        out = _contract(_env(
            message='How many should I pull?',
            tool_results=[{
                'name': 'find_contacts',
                'result': {'error': 'count required', 'code': 'COUNT_REQUIRED'},
            }],
        ), 'ask-12')
        assert 'error' not in out
        assert out['say'] == 'How many should I pull?'

    def test_auto_apply_receipt_carries_job_ref(self):
        # jobRef.id is the AUTO_APPLY_ID, not the job_id: the status route the
        # app polls is /auto-apply/<auto_apply_id>/status. This test used to
        # assert job_id, which is why a submission the backend really queued
        # showed the user nothing — every poll 404'd.
        out = _contract(_env(tool_results=[{
            'name': 'auto_apply_to_job',
            'result': {
                'auto_apply_id': 'aa-9', 'job_id': 'job-77',
                'job_title': 'Data Analyst', 'company': 'Snap',
                'status': 'queued',
            },
        }]), 'ask-13')
        assert out['actions'][0] == {
            'type': 'auto_apply',
            'params': {
                'jobId': 'job-77', 'title': 'Data Analyst',
                'company': 'Snap', 'status': 'queued',
            },
            'needsConfirm': False,
            'jobRef': {'kind': 'auto_apply', 'id': 'aa-9'}, 'results': None,
        }

    def test_find_jobs_receipt_carries_job_list(self):
        # Job results had no translation at all, so a find-then-apply turn
        # reached the app as prose about jobs it could not show or tap.
        out = _contract(_env(tool_results=[{
            'name': 'find_jobs',
            'result': {'count': 2, 'query': 'data analyst', 'jobs': [
                {'job_id': 'j1', 'title': 'Data Analyst', 'company': 'Snap',
                 'location': 'LA', 'auto_apply_eligible': True},
                {'job_id': 'j2', 'title': 'BI Analyst', 'company': 'Hulu',
                 'location': 'LA', 'auto_apply_eligible': False},
            ]},
        }]), 'ask-14')
        action = out['actions'][0]
        assert action['type'] == 'find_jobs'
        assert action['params'] == {'query': 'data analyst'}
        assert action['results']['kind'] == 'jobs'
        assert [j['jobId'] for j in action['results']['items']] == ['j1', 'j2']
        assert action['results']['items'][0]['autoApplyEligible'] is True

    def test_find_jobs_zero_results_surfaces_no_results(self):
        out = _contract(_env(tool_results=[{
            'name': 'find_jobs',
            'result': {'count': 0, 'jobs': [], 'query': 'underwater welder'},
        }]), 'ask-15')
        assert out['actions'] == []
        assert out['error']['code'] == 'no_results'

    def test_auto_apply_blockers_get_app_affordances(self):
        # Each of these has a real next move on the app, so each needs a code
        # the Feed can turn into a button instead of a dead sentence.
        for tool_code, contract_code in (
            ('PROFILE_REQUIRED', 'application_profile_required'),
            ('WORK_AUTH_REQUIRED', 'application_profile_required'),
            ('AUTOAPPLY_UNAVAILABLE', 'auto_apply_unavailable'),
            ('INELIGIBLE', 'job_not_auto_appliable'),
        ):
            out = _contract(_env(tool_results=[{
                'name': 'auto_apply_to_job',
                'result': {'error': 'nope', 'code': tool_code},
            }]), 'ask-16')
            assert out['error']['code'] == contract_code, tool_code
            assert out['actions'] == []  # errored auto-apply carries no jobRef


def test_mobile_tool_exclusions():
    """surface='mobile' turns never offer the tools the app can't render."""
    from app.services.scout.tools import to_openai_tools, TERMINAL_TOOL_NAMES
    from app.services.scout_assistant_service import ScoutAssistantService

    exclude = ScoutAssistantService.MOBILE_EXCLUDED_TOOLS
    names = {t['function']['name'] for t in to_openai_tools(exclude=exclude)}
    assert 'discover_companies' not in names
    assert 'generate_cover_letter' not in names
    # Everything the app CAN handle stays offered.
    for kept in ('find_contacts', 'draft_outreach_emails', 'run_meeting_prep',
                 'auto_apply_to_job', 'find_hiring_managers', 'find_jobs'):
        assert kept in names, f'{kept} must stay available on mobile'
    # Terminal tools are never excludable.
    assert TERMINAL_TOOL_NAMES <= names
    # And the final forced-terminal step ignores the exclusion entirely.
    terminal = {t['function']['name']
                for t in to_openai_tools(terminal_only=True, exclude=exclude)}
    assert terminal == TERMINAL_TOOL_NAMES


# ===========================================================================
# Route: wiring (auth, idempotency, brain call, legacy regression)
# ===========================================================================

HEADERS = {'Authorization': 'Bearer test-token'}


@pytest.fixture
def auth_patches(mock_firebase_user):
    with patch('firebase_admin._apps', {'[DEFAULT]': MagicMock()}), \
         patch('firebase_admin.auth.verify_id_token', return_value=mock_firebase_user), \
         patch.object(mobile_route, 'get_db', return_value=MagicMock()):
        mobile_route._ask_hits.clear()
        yield


def _post(client, body):
    return client.post('/api/mobile/scout/ask', json=body, headers=HEADERS)


def _brain_patches(env, claim=('run', None)):
    return (
        patch('app.services.scout_assistant_service.scout_assistant_service.handle_chat',
              new=AsyncMock(return_value=env)),
        patch('app.services.swipe_idempotency.claim', return_value=claim),
        patch('app.services.swipe_idempotency.complete'),
        patch('app.services.swipe_idempotency.fail'),
        patch('app.routes.scout_assistant._fetch_user_context', return_value={}),
    )


class TestAskRoute:
    def test_ask_happy_path(self, client, auth_patches):
        env = _env(message='Found them.', tool_results=[{
            'name': 'find_contacts',
            'result': {'count': 1, 'company': 'Bain', 'contacts': [
                {'name': 'Sam Hill', 'title': 'Consultant', 'company': 'Bain',
                 'linkedin_url': 'https://x'}]},
        }])
        p1, p2, p3, p4, p5 = _brain_patches(env)
        with p1 as brain, p2, p3 as complete, p4, p5:
            resp = _post(client, {'ask': 'find 1 consultant at Bain',
                                  'askId': 'ask-abc-123', 'action': 'ask'})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['say'] == 'Found them.'
        assert body['askId'] == 'ask-abc-123'
        assert body['conversationId'] == 'chat-123'
        assert body['actions'][0]['type'] == 'find_contacts'
        assert brain.await_count == 1
        kwargs = brain.await_args.kwargs
        assert kwargs['surface'] == 'mobile'
        assert kwargs['message'] == 'find 1 consultant at Bain'
        complete.assert_called_once()

    def test_conversation_id_threads_to_brain(self, client, auth_patches):
        p1, p2, p3, p4, p5 = _brain_patches(_env())
        with p1 as brain, p2, p3, p4, p5:
            _post(client, {'ask': 'and email them', 'askId': 'ask-abc-124',
                           'action': 'ask', 'conversationId': 'chat-123'})
        assert brain.await_args.kwargs['chat_id'] == 'chat-123'

    def test_ask_id_replay_returns_stored_response(self, client, auth_patches):
        stored = {'responseJson': '{"say": "Found them.", "actions": [], '
                                  '"askId": "ask-abc-125"}',
                  'statusCode': 200}
        p1, p2, p3, p4, p5 = _brain_patches(_env(), claim=('completed', stored))
        with p1 as brain, p2, p3, p4, p5:
            resp = _post(client, {'ask': 'find 1 consultant at Bain',
                                  'askId': 'ask-abc-125', 'action': 'ask'})
        body = resp.get_json()
        assert body['replayed'] is True
        assert body['say'] == 'Found them.'
        assert brain.await_count == 0  # no double-execution, no double-spend

    def test_brain_exception_degrades_to_contract_error(self, client, auth_patches):
        p1, p2, p3, p4, p5 = _brain_patches(_env())
        with p1 as brain, p2, p3, p4 as failed, p5:
            brain.side_effect = RuntimeError('boom')
            resp = _post(client, {'ask': 'find 1 consultant at Bain',
                                  'askId': 'ask-abc-126', 'action': 'ask'})
        assert resp.status_code == 200  # contract errors speak in say, not HTTP
        body = resp.get_json()
        assert body['error']['code'] == 'internal'
        assert body['actions'] == []
        assert body['say']
        failed.assert_called_once()

    def test_legacy_classify_untouched(self, client, auth_patches):
        with patch('app.services.scout_intent.classify_scout_ask',
                   return_value={'intent': 'draft', 'company': 'Bain'}):
            resp = _post(client, {'ask': 'draft two at Bain',
                                  'askId': 'ask-abc-127', 'action': 'classify'})
        assert resp.status_code == 200
        assert resp.get_json()['classification']['intent'] == 'draft'

    def test_unknown_action_still_400(self, client, auth_patches):
        resp = _post(client, {'ask': 'hi', 'askId': 'ask-abc-128',
                              'action': 'destroy'})
        assert resp.status_code == 400


# ===========================================================================
# The app's transcript: what the tool gates are allowed to see
# ===========================================================================


class TestTurnContextTexts:
    """The mobile route calls handle_chat with conversation_history=[] on
    purpose: the app never carries the transcript, the persisted chat is the
    record. Everything that gates an execute tool therefore has to read the
    RESOLVED history window, not the raw argument. Reading the argument is
    what made "yes", "do it" and "the second one" dead on the app while the
    same words worked on the website.
    """

    @staticmethod
    def _texts(history, message):
        from app.services.scout_assistant_service import ScoutAssistantService
        return ScoutAssistantService._turn_context_texts(history, message)

    def test_loaded_history_feeds_the_gates(self):
        history = [
            {'role': 'user', 'content': 'find me data analyst jobs in LA'},
            {'role': 'assistant', 'content': 'Found 3. Want me to apply to any?'},
        ]
        recent, last_assistant = self._texts(history, 'yes')
        assert 'data analyst jobs' in recent      # the ask survives the turn
        assert recent.endswith('yes')             # current message rides last
        assert 'apply' in last_assistant          # affirmation has an anchor

    def test_empty_history_is_just_this_message(self):
        recent, last_assistant = self._texts([], 'apply me to a data analyst role')
        assert recent == 'apply me to a data analyst role'
        assert last_assistant == ''

    def test_only_the_last_three_user_turns_ride_along(self):
        history = [{'role': 'user', 'content': f'ask {i}'} for i in range(6)]
        recent, _ = self._texts(history, 'now')
        assert 'ask 5' in recent and 'ask 3' in recent
        assert 'ask 2' not in recent

    def test_junk_entries_never_raise(self):
        recent, last_assistant = self._texts(
            [None, 'nope', {'role': 'assistant'}, {'role': 'user', 'content': None}],
            'hi',
        )
        assert recent.endswith('hi')
        assert last_assistant == ''

    def test_consent_gate_accepts_an_affirmation_with_this_history(self):
        # The end the user actually feels: Scout offered, the student said
        # "yes", and the apply tool is allowed to run.
        from app.services.scout.tools import _user_authorized, _APPLY_KEYWORDS
        recent, last_assistant = self._texts(
            [{'role': 'assistant', 'content': 'Want me to apply to the Snap role?'}],
            'yes',
        )
        context = {
            'recent_user_text': recent,
            'last_assistant_text': last_assistant,
            'user_message': 'yes',
        }
        assert _user_authorized(context, _APPLY_KEYWORDS) is True

    def test_consent_gate_still_refuses_an_unprompted_apply(self):
        from app.services.scout.tools import _user_authorized, _APPLY_KEYWORDS
        recent, last_assistant = self._texts(
            [{'role': 'assistant', 'content': 'Here are 3 jobs.'}],
            'what is investment banking',
        )
        context = {
            'recent_user_text': recent,
            'last_assistant_text': last_assistant,
            'user_message': 'what is investment banking',
        }
        assert _user_authorized(context, _APPLY_KEYWORDS) is False


# ===========================================================================
# The import that was missing
# ===========================================================================


class TestApplyToolIsReachable:
    """auto_apply_to_job imports submit_service lazily, inside a try/except
    that turns any failure into code INTERNAL. That swallowed an ImportError
    on this branch, where the module simply did not exist: every "apply me to
    that job" asked in the app died there and came back as a vague error, and
    no test noticed because nothing ever imported it.
    """

    def test_submit_service_import_resolves(self):
        from app.services.auto_apply.submit_service import submit_auto_apply_for_user
        assert callable(submit_auto_apply_for_user)

    def test_apply_tool_imports_what_it_calls(self):
        # Pin the exact import the tool executes at call time, so deleting or
        # renaming the module fails here instead of in a user's chat.
        import importlib
        import inspect
        from app.services.scout import tools
        src = inspect.getsource(tools._run_auto_apply)
        assert 'from app.services.auto_apply.submit_service import submit_auto_apply_for_user' in src
        mod = importlib.import_module('app.services.auto_apply.submit_service')
        assert hasattr(mod, 'submit_auto_apply_for_user')

    def test_submit_service_refuses_without_browserbase(self, monkeypatch):
        # First gate, before any Firestore read or credit spend.
        from app.services.auto_apply.submit_service import submit_auto_apply_for_user
        monkeypatch.delenv('BROWSERBASE_API_KEY', raising=False)
        monkeypatch.delenv('BROWSERBASE_PROJECT_ID', raising=False)
        payload, status = submit_auto_apply_for_user('u1', 'job-1', dry_run=False)
        assert status == 501
        assert payload['code'] == 'BROWSERBASE_NOT_CONFIGURED'


# ===========================================================================
# The call site: what handle_chat actually hands the tools
# ===========================================================================


class TestHandleChatFeedsTheGates:
    """Pins the WIRING, not just the helper.

    The bug was never in how the two strings are built, it was in which list
    handle_chat built them from. Unit-testing the helper alone cannot see
    that: swap the argument back to the raw conversation_history and the
    helper's own tests stay green. This asserts the thing that broke, from
    the mobile route's exact calling convention (conversation_history=[],
    a persisted chat carrying the transcript).
    """

    @staticmethod
    async def _capture_tool_context(monkeypatch, history):
        from app.services.scout_assistant_service import ScoutAssistantService

        svc = ScoutAssistantService()
        seen = {}

        async def fake_load_history_window(**kwargs):
            return list(history)

        async def fake_call_scout_tools(messages, tool_context, **kwargs):
            seen.update(tool_context)
            return ({'name': 'answer', 'input': {'text': 'ok'}}, {}, [], [])

        async def noop(*a, **k):
            return None

        monkeypatch.setattr(svc, '_load_history_window', fake_load_history_window)
        monkeypatch.setattr(svc, '_call_scout_tools', fake_call_scout_tools)
        monkeypatch.setattr(svc, '_fetch_active_strategy', noop)
        monkeypatch.setattr(svc, '_append_chat_message', noop)
        monkeypatch.setattr(svc, '_classify_intent_with_haiku', noop)
        monkeypatch.setattr(svc, '_lookup_caches', noop, raising=False)

        async def fake_ensure_chat(**kwargs):
            return ('chat-1', False)

        monkeypatch.setattr(svc, '_ensure_chat', fake_ensure_chat)

        await svc.handle_chat(
            message='yes',
            conversation_history=[],      # exactly what the mobile route sends
            uid='u1',
            chat_id='chat-1',
            surface='mobile',
        )
        return seen

    @pytest.mark.asyncio
    async def test_persisted_history_reaches_the_tool_context(self, monkeypatch):
        seen = await self._capture_tool_context(monkeypatch, [
            {'role': 'user', 'content': 'find me data analyst jobs at Snap'},
            {'role': 'assistant', 'content': 'Found 3. Want me to apply to any?'},
        ])
        # Without this, "yes" arrives naked and the apply gate refuses.
        assert 'data analyst jobs at Snap' in seen.get('recent_user_text', '')
        assert 'apply' in seen.get('last_assistant_text', '')
        assert seen.get('user_message') == 'yes'

    @pytest.mark.asyncio
    async def test_affirmation_is_authorized_end_to_end(self, monkeypatch):
        from app.services.scout.tools import _user_authorized, _APPLY_KEYWORDS
        seen = await self._capture_tool_context(monkeypatch, [
            {'role': 'assistant', 'content': 'Want me to apply to the Snap role?'},
        ])
        assert _user_authorized(seen, _APPLY_KEYWORDS) is True


class TestFollowupReceipt:
    """A follow-up offer has to reach the app as something tappable."""

    def test_followup_receipt_becomes_a_tappable_offer(self):
        out = _contract(_env(
            message='Sarah has been waiting nine days. Want me to send it?',
            tool_results=[{
                'name': 'get_followups',
                'result': {'count': 2, 'followups': [
                    {'id': 'n1', 'kind': 'follow_up', 'contact_name': 'Sarah Kim',
                     'contact_id': 'c-1', 'company': 'Bain', 'suggestion': 'Nudge her.',
                     'draft_ready': True, 'waiting_days': 9, 'created_at': None},
                    {'id': 'n2', 'kind': 'follow_up', 'contact_name': 'Dev Patel',
                     'contact_id': 'c-2', 'company': 'McKinsey', 'suggestion': '',
                     'draft_ready': False, 'waiting_days': 4, 'created_at': None},
                ]},
            }],
        ), 'ask-17')
        act = next(a for a in out['actions'] if a['type'] == 'followup')
        assert act['params'] == {
            'contactName': 'Sarah Kim', 'company': 'Bain',
            'draftReady': True, 'waitingDays': 9, 'more': 1,
        }

    def test_pipeline_prompt_has_nobody_to_offer(self):
        # stuck_student rows name no contact, so there is no person to act on.
        out = _contract(_env(tool_results=[{
            'name': 'get_followups',
            'result': {'count': 1, 'followups': [
                {'id': 'n1', 'kind': 'stuck_student', 'contact_name': '',
                 'company': '', 'suggestion': 'Nobody in flight yet.',
                 'draft_ready': False, 'waiting_days': 2},
            ]},
        }]), 'ask-18')
        assert [a for a in out['actions'] if a['type'] == 'followup'] == []

    def test_no_followups_no_action(self):
        out = _contract(_env(tool_results=[{
            'name': 'get_followups', 'result': {'count': 0, 'followups': []},
        }]), 'ask-19')
        assert out['actions'] == []
        assert 'error' not in out  # an empty inbox is not an error state


class TestReceiptHygiene:
    """Receipts the model can legitimately duplicate or contradict."""

    def test_two_apply_calls_on_one_job_render_once(self):
        # Observed live: "apply me to a data analyst job" fired the tool once
        # per candidate job; the server deduped both to one application. Two
        # cards would overstate what happened and start two pollers on one id.
        receipt = {
            'name': 'auto_apply_to_job',
            'result': {'auto_apply_id': 'aa-77', 'job_id': 'j1',
                       'job_title': 'Data Analyst', 'company': 'Snap',
                       'status': 'queued'},
        }
        out = _contract(_env(tool_results=[receipt, dict(receipt)]), 'ask-20')
        applies = [a for a in out['actions'] if a['type'] == 'auto_apply']
        assert len(applies) == 1
        assert applies[0]['jobRef']['id'] == 'aa-77'

    def test_two_apply_calls_on_different_jobs_both_render(self):
        out = _contract(_env(tool_results=[
            {'name': 'auto_apply_to_job',
             'result': {'auto_apply_id': 'aa-1', 'job_id': 'j1', 'status': 'queued'}},
            {'name': 'auto_apply_to_job',
             'result': {'auto_apply_id': 'aa-2', 'job_id': 'j2', 'status': 'queued'}},
        ]), 'ask-21')
        ids = [a['jobRef']['id'] for a in out['actions'] if a['type'] == 'auto_apply']
        assert ids == ['aa-1', 'aa-2']

    def test_no_followup_offer_when_the_draft_already_happened(self):
        # Scout reads the follow-up list, then drafts. Offering to draft it
        # again in the same turn contradicts the receipt next to it.
        out = _contract(_env(tool_results=[
            {'name': 'get_followups',
             'result': {'count': 1, 'followups': [
                 {'id': 'n1', 'kind': 'follow_up', 'contact_name': 'Sarah Kim',
                  'company': 'Bain', 'draft_ready': True, 'waiting_days': 9}]}},
            {'name': 'draft_outreach_emails',
             'result': {'count': 1, 'drafted': [
                 {'name': 'Sarah Kim', 'company': 'Bain', 'contact_id': 'c-1'}]}},
        ]), 'ask-22')
        types = [a['type'] for a in out['actions']]
        assert 'draft_outreach' in types
        assert 'followup' not in types
