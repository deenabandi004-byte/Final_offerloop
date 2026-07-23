"""
Regression test: Task 5 — Firebase token email may be missing entirely.

Apple sign-in tokens can omit "email" altogether (not just carry a relay
address), and some routes previously read `request.firebase_user.get("email")`
without a None-safe fallback. This test locks in that the main draft route
tolerates a decoded token with no "email" key at all — it must not raise or
500, and should still work off the uid + Firestore user doc.

Follows the auth-bypass fixture pattern in test_generate_and_draft_fallback.py
(patches must target backend.app.routes.emails.* module paths, not app.routes.*,
per the lesson documented in .superpowers/sdd/task-3-report.md).
"""
import pytest
from unittest.mock import patch, MagicMock

# No "email" key at all — the case a prior grep-only fix could miss, since
# `.get("email")` on this dict returns None (not empty string).
FAKE_USER_NO_EMAIL = {"uid": "test-user-id"}

CONTACT = {"FirstName": "J", "LastName": "Doe", "Email": "j@a.com",
           "emailSubject": "S", "emailBody": "B"}


@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """Bypass the real require_firebase_auth decorator for every test.

    Mirrors tests/test_generate_and_draft_fallback.py / test_nudges_routes.py:
    the decorator checks firebase_admin._apps and then calls
    firebase_admin.auth.verify_id_token, both module-level lookups at request
    time, so patching here works regardless of decorator binding order.
    """
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER_NO_EMAIL):
        yield


def _mock_db():
    db = MagicMock()
    user_doc = MagicMock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {"email": "user@icloud.com", "resumeText": "x" * 100}
    db.collection.return_value.document.return_value.get.return_value = user_doc
    db.collection.return_value.document.return_value.collection.return_value \
        .where.return_value.limit.return_value.stream.return_value = []
    return db


def test_generate_and_draft_tolerates_missing_token_email(client):
    """/api/emails/generate-and-draft must not 500 when the token has no email.

    generate-and-draft already resolves Gmail access via
    get_user_gmail_service_strict(uid) (task 3), which never touches the
    token email, so this exercises the rest of the route (resume backfill,
    user profile handling) with a token that has no "email" key.
    """
    with patch("backend.app.routes.emails.get_user_gmail_service_strict", return_value=None), \
         patch("backend.app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/generate-and-draft",
            json={"contacts": [CONTACT]},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True


def test_send_draft_tolerates_missing_token_email(client):
    """/api/emails/send-draft/<id> must not 500 when the token has no email.

    Exercises the legacy get_gmail_service_for_user(user_email, user_id=uid)
    path (send_draft has not been migrated to the strict uid-only helper).
    With no Gmail service available it must degrade to a clean 401, not raise.
    """
    with patch("backend.app.routes.emails.get_gmail_service_for_user", return_value=None):
        res = client.post(
            "/api/emails/send-draft/abc123",
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 401
    data = res.get_json()
    assert data["error"] == "gmail_not_connected"


# ---------------------------------------------------------------------------
# Chokepoint: get_gmail_service_for_user must not bail on a missing email when
# a user_id is provided. send-draft, batch send, LinkedIn/contact import,
# referral drafts, and queue approval all acquire Gmail through this function,
# and it never actually uses the email — only the uid — to load credentials.
# Service modules are imported by routes as app.services.*, so patch that
# module identity (not backend.app.services.*).
# ---------------------------------------------------------------------------

def test_gmail_service_resolves_by_uid_when_token_email_missing():
    from app.services.gmail_client import get_gmail_service_for_user

    svc = MagicMock()
    svc.users.return_value.getProfile.return_value.execute.return_value = \
        {"emailAddress": "u@gmail.com"}
    with patch("app.services.gmail_client._load_user_gmail_creds",
               return_value=MagicMock()), \
         patch("app.services.gmail_client._gmail_service", return_value=svc):
        out = get_gmail_service_for_user(None, user_id="test-user-id")
    assert out is svc


def test_gmail_service_still_none_without_email_and_uid():
    from app.services.gmail_client import get_gmail_service_for_user
    assert get_gmail_service_for_user(None, user_id=None) is None


# ---------------------------------------------------------------------------
# Stripe checkout: customer_email must be OMITTED (not passed as "") when no
# email is available. Stripe rejects an empty-string customer_email; its
# hosted page collects the address itself when the field is absent.
# ---------------------------------------------------------------------------

def _stripe_session():
    session = MagicMock()
    session.id = "cs_test_1"
    session.url = "https://checkout.stripe.test/cs_test_1"
    return session


def _db_user_without_email():
    db = MagicMock()
    snap = MagicMock()
    snap.exists = True
    snap.to_dict.return_value = {}  # user doc has no email either
    db.collection.return_value.document.return_value.get.return_value = snap
    return db


def test_topup_checkout_omits_customer_email_when_absent():
    import app.services.topup_service as topup

    with patch.object(topup, "STRIPE_SECRET_KEY", "sk_test_x"), \
         patch.object(topup, "STRIPE_PRICE_CATALOG", {"topup": {500: "price_x"}}), \
         patch.object(topup, "get_db", return_value=_db_user_without_email()), \
         patch.object(topup.stripe.checkout.Session, "create",
                      return_value=_stripe_session()) as mk_create:
        out = topup.create_topup_session("u1", "", "starter", "https://s", "https://c")

    assert out["ok"] is True
    assert "customer_email" not in mk_create.call_args.kwargs


def test_season_pass_checkout_omits_customer_email_when_absent():
    import app.services.season_pass_service as sps

    with patch.object(sps, "STRIPE_SECRET_KEY", "sk_test_x"), \
         patch.object(sps, "_resolve_price_id", return_value="price_sp"), \
         patch.object(sps, "get_db", return_value=_db_user_without_email()), \
         patch.object(sps.stripe.checkout.Session, "create",
                      return_value=_stripe_session()) as mk_create:
        out = sps.create_season_pass_session("u1", "", "list", "https://s", "https://c")

    assert out["ok"] is True
    assert "customer_email" not in mk_create.call_args.kwargs


def test_referral_trial_checkout_omits_customer_email_when_absent():
    import app.services.stripe_client as sc

    with patch.object(sc, "STRIPE_SECRET_KEY", "sk_test_x"), \
         patch.object(sc.stripe.checkout.Session, "create",
                      return_value=_stripe_session()) as mk_create:
        out = sc.create_referral_trial_checkout("u1", "")

    assert out.get("url")
    assert "customer_email" not in mk_create.call_args.kwargs
