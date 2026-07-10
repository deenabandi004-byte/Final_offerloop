"""Live eval for the scout intent classifier's mishear repair (real OpenAI
calls — run manually before every prompt change, not in CI).

    cd backend && python3 scripts/eval_scout_intent.py

The whack-a-mole killer: every new field-observed mishear becomes ONE fixture
line here instead of a new regex in the mobile fix-map. Exits non-zero on any
failure so it can gate a deploy.
"""
import os
import sys

_here = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(_here, ".."))        # backend/ (app.*)
sys.path.insert(0, os.path.join(_here, "..", ".."))  # repo root (backend.app.*)
os.environ.setdefault("FLASK_ENV", "testing")

from app.services.scout_intent import classify_scout_ask  # noqa: E402

# (transcript, expected_company, expect_repaired)
# expect_repaired=None means "either is acceptable" (verbatim firm present).
REPAIR_CASES = [
    # The Moelis family — all observed on Rylan's 2026-07-08 field walk.
    ("Find me two analysts at Molly's", "Moelis", True),
    ("find analysts at Molise", "Moelis", True),
    ("Draft 1 someone on the team in Molise", "Moelis", True),
    ("Draft one analyst at Mose", "Moelis", True),
    ("reach out to someone at mo ellis", "Moelis", True),
    # Connector damage with the firm name intact.
    ("You have two analyst set Evercore", "Evercore", None),
    ("Draft 2 analysts at ever core", "Evercore", True),
    # Clean asks must pass through verbatim, unrepaired.
    ("Draft 3 IB analysts at Goldman Sachs", "Goldman Sachs", False),
    ("who works at Lazard", "Lazard", False),
]

# Negative controls: plausible real businesses must NOT be "repaired" into
# finance firms. Verbatim passthrough required.
NEGATIVE_CASES = [
    ("find me baristas at Molly's Cupcakes in Chicago", "Molly's Cupcakes"),
]

# Targeting doctrine (2026-07-09, Rylan's rule of thumb): employees are the
# default target — hiring_manager=true ONLY on an explicit hiring-manager /
# recruiter ask. An industry is never a company.
# (ask, want_hiring_manager, company_must_be_empty)
DOCTRINE_CASES = [
    ("find me five employees in the tech industry in Los Angeles", False, True),
    ("draft five people in investment banking in LA", False, True),
    ("find me people at Google", False, False),
    ("draft 3 analysts at Moelis", False, False),
    ("find five hiring managers in investment banking in Los Angeles", True, True),
    ("draft two recruiters at Google", True, False),
]


def main() -> int:
    failures = []
    for ask, want_company, want_repaired in REPAIR_CASES:
        r = classify_scout_ask(None, ask)
        ok_company = r.get("company", "").lower() == want_company.lower()
        ok_repaired = want_repaired is None or r.get("repaired") is want_repaired
        status = "PASS" if (ok_company and ok_repaired) else "FAIL"
        if status == "FAIL":
            failures.append(ask)
        print(f"[{status}] {ask!r} -> company={r.get('company')!r} "
              f"repaired={r.get('repaired')} intent={r.get('intent')} "
              f"(want company={want_company!r} repaired={want_repaired})")

    for ask, want_company in NEGATIVE_CASES:
        r = classify_scout_ask(None, ask)
        got = r.get("company", "")
        # Must keep the user's business verbatim-ish — never a finance firm.
        ok = "moelis" not in got.lower()
        status = "PASS" if ok else "FAIL"
        if not ok:
            failures.append(ask)
        print(f"[{status}] NEG {ask!r} -> company={got!r} repaired={r.get('repaired')}")

    for ask, want_hm, company_empty in DOCTRINE_CASES:
        r = classify_scout_ask(None, ask)
        ok_hm = bool(r.get("hiring_manager")) is want_hm
        ok_co = (not r.get("company")) if company_empty else True
        status = "PASS" if (ok_hm and ok_co) else "FAIL"
        if status == "FAIL":
            failures.append(ask)
        print(f"[{status}] DOC {ask!r} -> hm={r.get('hiring_manager')} "
              f"company={r.get('company')!r} role={r.get('role')!r} "
              f"(want hm={want_hm} company_empty={company_empty})")

    total = len(REPAIR_CASES) + len(NEGATIVE_CASES) + len(DOCTRINE_CASES)
    print(f"\n{total - len(failures)}/{total} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
