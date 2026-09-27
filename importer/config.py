"""Where the source files live and where the JSON goes.

The source files stay in your library folder; nothing from them is copied into the
project except what the importer extracts into data/ (which is never published).
"""
import os
from pathlib import Path

# Set GMAT_LIBRARY to use another folder.
LIBRARY = Path(os.environ.get("GMAT_LIBRARY", Path.home() / "Documents" / "02_Library"))
PROJECT = Path(__file__).resolve().parent.parent


def find(pattern: str) -> Path:
    """The one file in the library matching a pattern (book files carry long download names)."""
    hits = sorted(LIBRARY.glob(pattern))
    if not hits:
        raise FileNotFoundError(f"No file matching {pattern!r} in {LIBRARY}")
    return hits[0]


PLAN_DOCX = LIBRARY / "gmat_ninja_study_schedule.docx"
RC_DOC = LIBRARY / "116 LSAT RC Passages.doc"
CR_XLSX = LIBRARY / "GMAT Club 1000-CR by LSAT PrepTest Section.xlsx"
OG_EPUB = find("GMAT Official Guide 2025*2026 Book*.epub")
OG_BOOKS = {
    "og": ("Official Guide", OG_EPUB),
    "qr": ("Quantitative Review", find("GMAT Official Guide Quantitative Review 2025*.epub")),
    "vr": ("Verbal Review", find("GMAT Official Guide Verbal Review 2025*.epub")),
    "dir": ("Data Insights Review", find("GMAT Official Guide Data Insights Review 2025*.epub")),
}
# The plan's links, classified (from the build conversation).
LINK_CATALOG = PROJECT / "sources" / "link_catalog.json"

DATA_VERSION = "2026-09-27.1"
OUT_DIR = PROJECT / "data" / "v1"
WORK_DIR = PROJECT / "importer" / ".work"   # converted text, not committed
REPORT = PROJECT / "data" / "import_report.md"
