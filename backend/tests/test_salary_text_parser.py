"""Unit tests for backend.app.utils.salary_text_parser.parse_salary_text.

Locks parser behavior across the formats observed in real Firestore
data (200-sample probe 2026-06-02) plus defensive corner cases. A
failed/ambiguous parse MUST return None so the backfill writes nothing
(honest-blank discipline) instead of inventing a number.

Happy-path cases reflect actual strings seen in production.
"""
from backend.app.utils.salary_text_parser import parse_salary_text


# ---------------------------------------------------------------------------
# Happy paths (must parse cleanly)
# ---------------------------------------------------------------------------

def test_dollar_range_plain():
    r = parse_salary_text("$128,000 - $160,000")
    assert r == {"min": 128000, "max": 160000, "period": "annual", "display": "$128k - $160k"}


def test_em_dash_separator():
    r = parse_salary_text("$129,000—$152,000 USD")
    assert r["min"] == 129000 and r["max"] == 152000
    assert r["period"] == "annual"


def test_en_dash_separator():
    r = parse_salary_text("$129,000–$152,000 USD")
    assert r["min"] == 129000 and r["max"] == 152000
    assert r["period"] == "annual"


def test_k_suffix_no_commas():
    r = parse_salary_text("$120k - $150k")
    assert r == {"min": 120000, "max": 150000, "period": "annual", "display": "$120k - $150k"}


def test_usd_with_zone_qualifier_preserves_qualifier_in_display():
    r = parse_salary_text("$187,000 - $220,000 USD (Zone 1)")
    assert r["min"] == 187000 and r["max"] == 220000
    assert "(Zone 1)" in r["display"]


def test_ote_trailing():
    r = parse_salary_text("$400,000 - $460,000 OTE")
    assert r["min"] == 400000 and r["max"] == 460000


def test_hourly_range_annualizes_min_max():
    r = parse_salary_text("$50/hr - $75/hr")
    assert r["period"] == "hourly"
    # Annualized at 2080 hours/year
    assert r["min"] == 104000 and r["max"] == 156000
    # Display shows the hourly rate, not the annualized value
    assert "/hr" in r["display"]


def test_multi_zone_spans_all_subranges():
    """Multi-range strings (any with ';') span from min of all sub-ranges
    to max of all sub-ranges. No zone qualifier preserved on the display.
    Reason: first-range was HCOL-first only ~95% of the time in production
    data (Okta, Brex, Airtable, Carta inverted), so taking the first range
    systematically understated those by $15-$40k."""
    r = parse_salary_text(
        "$196,000 - $230,000 USD (Zone 1); "
        "$172,000 - $202,000 USD (Zone 2); "
        "$153,000 - $179,000 USD (Zone 3)"
    )
    assert r["min"] == 153000 and r["max"] == 230000
    # No qualifier on multi-range spans
    assert "(Zone" not in r["display"]


def test_multi_city_spans_all_subranges():
    r = parse_salary_text(
        "$201,875 - $237,500 in Seattle, WA; "
        "$212,500 - $250,000 in San Francisco, CA"
    )
    assert r["min"] == 201875 and r["max"] == 250000


def test_multi_zone_inverted_order_no_understatement():
    """When the first sub-range is LOWER than later sub-ranges (e.g. Okta
    'varied by location' listed before SF), full-span still produces the
    full pay band rather than understating to the first sub-range."""
    r = parse_salary_text(
        "$128,000—$176,000 USD (California, Colorado, Illinois, New York, Washington); "
        "$143,000—$197,000 USD (San Francisco Bay Area)"
    )
    assert r["min"] == 128000 and r["max"] == 197000


# ---------------------------------------------------------------------------
# Honest-blank (must return None)
# ---------------------------------------------------------------------------

def test_doe_returns_none():
    assert parse_salary_text("DOE") is None


def test_competitive_returns_none():
    assert parse_salary_text("competitive") is None


def test_negotiable_returns_none():
    assert parse_salary_text("Salary is negotiable") is None


def test_not_disclosed_returns_none():
    assert parse_salary_text("Salary not disclosed") is None


def test_upto_single_returns_none():
    assert parse_salary_text("Up to $200k") is None


def test_single_value_returns_none():
    """Single value is not a range; refuse rather than fabricate the other side."""
    assert parse_salary_text("$200,000") is None


def test_single_hourly_returns_none():
    assert parse_salary_text("$60/hr") is None


def test_non_usd_gbp_symbol_returns_none():
    assert parse_salary_text("£80,000 - £120,000") is None


def test_non_usd_eur_symbol_returns_none():
    assert parse_salary_text("€100,000 - €150,000") is None


def test_non_usd_cad_word_returns_none():
    assert parse_salary_text("CAD 100,000 - CAD 150,000") is None


def test_empty_string_returns_none():
    assert parse_salary_text("") is None


def test_whitespace_only_returns_none():
    assert parse_salary_text("   \t  ") is None


def test_none_input_returns_none():
    assert parse_salary_text(None) is None


def test_max_below_min_returns_none():
    assert parse_salary_text("$200,000 - $100,000") is None


def test_max_too_large_vs_min_returns_none():
    """Suspected equity contamination or base+OTE mis-parse. Refuse."""
    assert parse_salary_text("$100 - $1,000,000") is None


# ---------------------------------------------------------------------------
# Bug fixes locked after first real-data dry-run (2026-06-02)
# ---------------------------------------------------------------------------

def test_level_split_spans_full_range():
    """SpaceX Level I + Level II: span min of first to max of last.
    Level/Year/Tier ladders now use the same multi-range full-span path
    as zone splits (the dedicated _LEVEL_SPLIT_RE detector was removed)."""
    r = parse_salary_text(
        "GNC Engineer/Level I: $125,000.00 - $145,000.00/per year; "
        "GNC Engineer/Level II: $145,000.00 - $175,000.00/per year"
    )
    assert r["min"] == 125000 and r["max"] == 175000
    assert r["display"] == "$125k - $175k"


def test_year_split_spans_full_range():
    """Year 1 / Year 2 OTE: span the whole career range."""
    r = parse_salary_text(
        "Year 1 on target earnings between $80,000-$110,000; "
        "Year 2 on target earnings between $104,000-$122,000"
    )
    assert r["min"] == 80000 and r["max"] == 122000


def test_hourly_level_split_spans_full_range():
    """SpaceX hourly ladder: spans across all levels, hourly period."""
    r = parse_salary_text(
        "Level 1: $22.00 - $26.50/hour; "
        "Level 2: $25.50 - $31.00/hour; "
        "Level 3: $29.50 - $37.00/hour"
    )
    assert r["period"] == "hourly"
    # min=22/hr=45,760 annualized; max=37/hr=76,960 annualized
    assert r["min"] == 45760 and r["max"] == 76960
    assert "/hr" in r["display"]


def test_no_dollar_prefix_with_usd_word():
    """Numbers without $ prefix parse when USD is in the string."""
    r = parse_salary_text("233,000—320,100 USD (San Francisco Bay Area)")
    assert r["min"] == 233000 and r["max"] == 320100
    assert "(San Francisco Bay Area)" in r["display"]


def test_no_dollar_prefix_multi_zone_with_usd_spans():
    """No-$ multi-zone: full-span across all sub-ranges. No qualifier."""
    r = parse_salary_text(
        "233,000—320,100 USD (San Francisco Bay Area); "
        "208,000—286,000 USD (Other California locations)"
    )
    assert r["min"] == 208000 and r["max"] == 320100
    assert "(" not in r["display"]


def test_no_dollar_prefix_without_usd_returns_none():
    """Bare numbers without any currency signal stay ambiguous."""
    assert parse_salary_text("140,000 - 200,000") is None


def test_zero_width_range_shows_single_value_display():
    """$110k - $110k is a fixed-comp posting; show single value."""
    r = parse_salary_text("$110,000 - $110,000 USD")
    assert r["min"] == 110000 and r["max"] == 110000
    assert r["display"] == "$110k"


def test_zero_width_hourly_shows_single_hourly():
    """$22/hr - $22/hr fixed hourly. Annualized for sort, /hr in display."""
    r = parse_salary_text("$22 - $22 USD per hour")
    assert r["period"] == "hourly"
    assert r["min"] == r["max"] == 45760
    assert r["display"] == "$22/hr"


def test_weekly_rate_rejected_via_marker():
    """Weekly rates not supported; refuse rather than mis-annualize."""
    assert parse_salary_text("$1,000/Week Guaranteed") is None


def test_signon_bonus_phrase_rejected():
    """$1k/week + $5k sign-on parses to a ratio that the 8x check misses;
    the marker rule catches it instead."""
    assert parse_salary_text("$1,000/Week Guaranteed + $5,000 Sign-On Bonus") is None


def test_tight_8x_threshold_rejects_at_9x():
    """A range with max == 9x min is suspicious; reject."""
    assert parse_salary_text("$50,000 - $450,000") is None


def test_tight_8x_threshold_accepts_at_8x():
    """Edge: max == 8x min is on the boundary; the rule is strict >8x."""
    r = parse_salary_text("$50,000 - $400,000")
    assert r is not None
    assert r["min"] == 50000 and r["max"] == 400000


def test_anthropic_style_broad_range_accepted():
    """Real-data sample: legitimate broad principal-research-engineer range."""
    r = parse_salary_text("$280,000 - $850,000 USD")
    assert r["min"] == 280000 and r["max"] == 850000


# ---------------------------------------------------------------------------
# Bug fixes locked after raw-case review of 6,092 tier-2 successes
# ---------------------------------------------------------------------------

def test_bare_digit_no_comma_parses_correctly():
    """Numbers like '$65000' (no commas) must parse to 65000, not 650.
    The original regex's greedy {1,3} match truncated bare-digit numbers."""
    r = parse_salary_text("$65000.00 - $80000.00")
    assert r["min"] == 65000 and r["max"] == 80000


def test_bare_digit_long_number_parses_correctly():
    """'$144250 - $256250' must parse as 144k-256k, not as 144-256.
    Real-data sample: fantasticjobs_2177040747."""
    r = parse_salary_text("$144250 - $256250 annually + bonus + equity")
    assert r["min"] == 144250 and r["max"] == 256250


def test_low_annual_max_returns_none():
    """'$20.10 - $70.40' with no period indicator and no commas parses to
    $20-$70 annual, which is implausibly low. Min-annual sanity rejects."""
    assert parse_salary_text("$20.10 – $70.40") is None


def test_low_annual_max_with_explicit_annual_returns_none():
    """Even with 'annually' marker, a max below $5,000 is implausible."""
    assert parse_salary_text("$50 - $100 annually") is None


def test_hourly_low_amounts_still_accepted():
    """Hourly amounts can legitimately be small (e.g. $22/hr). The
    min-annual floor only applies to annual-period parses."""
    r = parse_salary_text("$22 - $40 USD per hour")
    assert r is not None
    assert r["period"] == "hourly"
