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
