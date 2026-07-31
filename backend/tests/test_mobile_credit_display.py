"""
Tests for _credit_display (app/routes/mobile.py) — the /me balance mapping.

Pure functions only, no Firestore. The contract under test: /me reports the
TOTAL spendable balance across all three ledger buckets (monthly + purchased
bonus + unexpired promo), plus each bucket separately, using the exact same
pure ledger functions the deduct path uses. This is what makes top-up packs
granted by the RevenueCat webhook visible in the app.
"""
from datetime import timedelta

from app.routes.mobile import _credit_display
from app.services.credit_ledger import FakeClock


class TestCreditDisplay:
    def test_combines_monthly_and_bonus(self):
        out = _credit_display({'credits': 190, 'bonusCredits': 300})
        assert out['credits'] == 490
        assert out['monthlyCredits'] == 190
        assert out['bonusCredits'] == 300
        assert out['promoCredits'] == 0

    def test_monthly_only_matches_old_behavior(self):
        out = _credit_display({'credits': 240})
        assert out['credits'] == 240
        assert out['bonusCredits'] == 0

    def test_missing_fields_are_zero(self):
        out = _credit_display({})
        assert out == {
            'credits': 0,
            'monthlyCredits': 0,
            'bonusCredits': 0,
            'promoCredits': 0,
        }

    def test_unexpired_promo_counts(self):
        clock = FakeClock()
        out = _credit_display(
            {
                'credits': 100,
                'bonusCredits': 150,
                'promoCredits': 50,
                'promoCreditsExpiresAt': clock.now() + timedelta(days=1),
            },
            clock=clock,
        )
        assert out['credits'] == 300
        assert out['promoCredits'] == 50

    def test_expired_promo_is_swept_from_display(self):
        clock = FakeClock()
        out = _credit_display(
            {
                'credits': 100,
                'bonusCredits': 150,
                'promoCredits': 50,
                'promoCreditsExpiresAt': clock.now() - timedelta(seconds=1),
            },
            clock=clock,
        )
        assert out['credits'] == 250
        assert out['promoCredits'] == 0

    def test_negative_buckets_never_reduce_the_total(self):
        # A monthly bucket driven negative by a race must not eat purchased
        # credits in the display; total() clamps each bucket at zero.
        out = _credit_display({'credits': -20, 'bonusCredits': 150})
        assert out['credits'] == 150
        assert out['monthlyCredits'] == 0
