"""
Seniority classifier.

Maps a job title string to one of four seniority buckets:
vp, director, manager, analyst (default).

Checked from senior → junior to avoid false positives.
"""


VP_KEYWORDS = (
    "vice president", " vp ", " vp,", "(vp)", "svp", "evp",
    "chief ", " cto ", " cto,", " cfo ", " cfo,", " ceo ", " ceo,",
    " coo ", " coo,", " cio ", " cio,", " cmo ", " cmo,",
    "managing director", " md ",
    "president", "founder", "co-founder",
    "partner", "general partner",
)

DIRECTOR_KEYWORDS = (
    "director", "head of", "principal",
    "sr. manager", "senior manager", "sr manager",
)

MANAGER_KEYWORDS = (
    "manager", " lead", "team lead", "senior ", "sr.",
    "sr ", "staff ",
)


def classify_seniority(title: str) -> str:
    """Classify a job title into a seniority bucket.

    Returns one of: vp, director, manager, analyst.
    """
    t = f" {(title or '').lower().strip()} "
    if not t.strip():
        return "analyst"
    if any(kw in t for kw in VP_KEYWORDS):
        return "vp"
    if any(kw in t for kw in DIRECTOR_KEYWORDS):
        return "director"
    if any(kw in t for kw in MANAGER_KEYWORDS):
        return "manager"
    return "analyst"
