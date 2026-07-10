"""Industry-as-company guard (2026-07-09): an industry phrase must never
reach PDL as an employer. Exact-phrase only - real companies with
industry-flavored names must pass."""
import pytest

from app.services.industry_terms import is_industry_not_company

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("name", [
    "investment banking", "Investment Banking", " INVESTMENT  BANKING ",
    "banking", "IB", "consulting", "tech", "private equity",
    "hedge funds", "venture capital", "finance",
])
def test_industry_phrases_rejected(name):
    assert is_industry_not_company(name) is True


@pytest.mark.parametrize("name", [
    "Goldman Sachs", "Moelis", "JPMorgan", "Capital One",
    "First Republic Bank", "Bank of America", "Tech Mahindra",
    "Consulting Partners LLC", "PE Partners", "", None, 42,
])
def test_real_companies_pass(name):
    assert is_industry_not_company(name) is False
