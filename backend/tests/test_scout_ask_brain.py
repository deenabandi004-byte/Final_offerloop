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
        out = _contract(_env(tool_results=[{
            'name': 'auto_apply_to_job',
            'result': {'ok': True, 'job_id': 'job-77', 'status': 'queued'},
        }]), 'ask-13')
        assert out['actions'][0] == {
            'type': 'auto_apply', 'params': {}, 'needsConfirm': False,
            'jobRef': {'kind': 'auto_apply', 'id': 'job-77'}, 'results': None,
        }


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
