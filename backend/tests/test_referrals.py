from app import config


def test_referral_config_constants():
    assert config.REFERRAL_TARGET_COUNT == 5
    assert config.REFERRAL_REWARD_TIER == 'elite'
    assert 'referral_reward' in config.STRIPE_COUPONS


from app.services import referral_service as rs


def test_generate_code_shape():
    code = rs.generate_code()
    assert len(code) == 8
    assert code.isupper() or code.isdigit() or code.isalnum()
    for bad in ('0', 'O', '1', 'I'):
        assert bad not in code


def test_generate_code_is_random():
    codes = {rs.generate_code() for _ in range(50)}
    assert len(codes) > 45  # overwhelmingly unique


def test_is_self_referral_uid_match():
    assert rs.is_self_referral('u1', 'a@x.com', 'u1', 'b@x.com') is True


def test_is_self_referral_email_match_case_insensitive():
    assert rs.is_self_referral('u1', 'A@X.com', 'u2', 'a@x.com') is True


def test_is_self_referral_distinct():
    assert rs.is_self_referral('u1', 'a@x.com', 'u2', 'b@x.com') is False


def test_is_eligible():
    assert rs.is_eligible(5, False) is True
    assert rs.is_eligible(6, False) is True
    assert rs.is_eligible(4, False) is False
    assert rs.is_eligible(5, True) is False


from unittest.mock import MagicMock


def _user_snapshot(data, exists=True):
    snap = MagicMock()
    snap.exists = exists
    snap.to_dict.return_value = data
    return snap


def test_get_or_create_returns_existing_code():
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({'referralCode': 'EXISTING1'})

    code = rs.get_or_create_referral_code(db, 'u1')

    assert code == 'EXISTING1'
    user_ref.set.assert_not_called()
    user_ref.update.assert_not_called()


def test_get_or_create_generates_when_missing():
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({'email': 'a@x.com'})

    code = rs.get_or_create_referral_code(db, 'u1')

    assert len(code) == 8
    # writes code onto the user doc and into the lookup collection
    user_ref.update.assert_called_once()
    assert user_ref.update.call_args[0][0]['referralCode'] == code
    db.collection.assert_any_call('referralCodes')


def test_get_referral_status_shape():
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({
        'referralCode': 'CODE1234',
        'referralQualifiedCount': 5,
        'referralRewardClaimed': False,
    })

    status = rs.get_referral_status(db, 'u1')

    assert status['referralCode'] == 'CODE1234'
    assert status['signupCount'] == 5
    assert status['signupTarget'] == 5
    assert status['eligible'] is True
    assert status['rewardClaimed'] is False
    assert status['referralLink'].endswith('ref=CODE1234')
