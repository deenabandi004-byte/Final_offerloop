from unittest.mock import patch, MagicMock

from app.services import gmail_client


def test_strict_returns_service_when_user_creds_exist():
    fake_service = MagicMock()
    fake_service.users.return_value.getProfile.return_value.execute.return_value = {"emailAddress": "u@gmail.com"}
    with patch.object(gmail_client, "_load_user_gmail_creds", return_value=MagicMock()), \
         patch.object(gmail_client, "_gmail_service", return_value=fake_service):
        assert gmail_client.get_user_gmail_service_strict("uid123") is fake_service


def test_strict_returns_none_without_creds_never_touches_shared_account():
    with patch.object(gmail_client, "_load_user_gmail_creds", return_value=None), \
         patch.object(gmail_client, "get_gmail_service") as shared:
        assert gmail_client.get_user_gmail_service_strict("uid123") is None
        shared.assert_not_called()


def test_strict_returns_none_when_profile_check_fails():
    fake_service = MagicMock()
    fake_service.users.return_value.getProfile.return_value.execute.side_effect = Exception("invalid_grant")
    with patch.object(gmail_client, "_load_user_gmail_creds", return_value=MagicMock()), \
         patch.object(gmail_client, "_gmail_service", return_value=fake_service), \
         patch.object(gmail_client, "get_gmail_service") as shared:
        assert gmail_client.get_user_gmail_service_strict("uid123") is None
        shared.assert_not_called()
