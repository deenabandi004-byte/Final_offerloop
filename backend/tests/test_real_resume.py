"""
Run pdf_patcher on a real resume PDF.
Usage: python tests/test_real_resume.py

Expects: tests/test_resume.pdf
Output: tests/output/patched_real_resume.pdf
"""
import logging
import os
import sys

# Add backend to path when run as script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(asctime)s - %(message)s")

from app.services.pdf_patcher import patch_pdf

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_PDF = os.path.join(SCRIPT_DIR, "test_resume.pdf")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
OUTPUT_PDF = os.path.join(OUTPUT_DIR, "patched_real_resume.pdf")

# Example patches: 2 bullet rewrites + 1 skill_append (3+ patches to verify multi-patch flow)
PATCHES = [
    {
        "type": "bullet_rewrite",
        "original_text": "ETL Pipeline Engineering: Engineered end-to-end ETL pipelines to ingest, normalize, and aggregate Internet measurement logs.",
        "replacement_text": "◦ ETL Pipeline Engineering: Engineered end-to-end ETL pipelines to ingest, normalize, and aggregate Internet measurement logs with improved error handling.",
    },
    {
        "type": "bullet_rewrite",
        "original_text": "Distributed Computing: Designed and implemented distributed systems for large-scale data processing.",
        "replacement_text": "◦ Distributed Computing: Designed and implemented distributed systems for large-scale data processing with fault tolerance.",
    },
    {
        "type": "skill_append",
        "original_text": "Languages: Python, C, C++, Java, JavaScript, TypeScript, SQL, MATLAB",
        "replacement_text": "Languages: Python, C, C++, Java, JavaScript, TypeScript, SQL, MATLAB, Rust",
    },
]


def main():
    if not os.path.exists(INPUT_PDF):
        print(f"Input PDF not found: {INPUT_PDF}")
        print("Place a resume PDF at tests/test_resume.pdf to run this script.")
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(INPUT_PDF, "rb") as f:
        pdf_bytes = f.read()

    result = patch_pdf(pdf_bytes, PATCHES)

    print("\n=== PATCH RESULTS ===\n")
    for entry in result["patch_log"]:
        status = entry["status"].upper()
        print(f"[{status}] {entry.get('type', 'unknown')}")
        print(f"  Matched: {entry.get('original_text_matched', '')[:80]}...")
        print(f"  Font: {entry.get('font_name', '')} @ {entry.get('font_size_original')}pt -> {entry.get('font_size_used')}pt")
        print(f"  Fit: {entry.get('fit_success')}")
        print()

    print(f"All safe: {result['all_safe']}")

    if result["patched_pdf_bytes"]:
        with open(OUTPUT_PDF, "wb") as f:
            f.write(result["patched_pdf_bytes"])
        print(f"Saved to {OUTPUT_PDF}")
    else:
        print("No patched PDF produced.")
        sys.exit(1)


if __name__ == "__main__":
    main()
