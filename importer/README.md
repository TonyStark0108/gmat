# Importer (Phase 0)

Turns the source files in `Documents\02_Library` into versioned JSON in `data/v1/`, and writes
`data/import_report.md`.

```
python importer/run_all.py
```

Needs: Python 3, `pip install python-docx openpyxl beautifulsoup4 lxml`, and Microsoft Word
(or LibreOffice) to convert the RC `.doc` once. Source paths are in `config.py`.

| Module | Source | Output |
|---|---|---|
| `plan_import.py` | `gmat_ninja_study_schedule.docx` | `plan.json` |
| `rc_import.py` | `116 LSAT RC Passages.doc` | `rc_bank.json` |
| `cr_import.py` | `GMAT Club 1000-CR by LSAT PrepTest Section.xlsx` | `cr_bank.json` |
| `og_import.py` | OG 2025–2026 epub | `og_key.json` (answers + index metadata, no question text) |
| `links_import.py` | the plan's hyperlinks | `links.json` |
| `benchmarks.py` | the spec's summary of the weekly guides | `benchmarks.json` |
| `decks.py` | written here | `decks_draft.json`, `data/decks_draft.md` |

Hand decisions live in `curation/`: where plan weeks start, which paragraphs hold extra tasks,
the mock mapping, and the unclear RC glosses. Every paragraph reference carries a text snippet
that is checked on each run, so an edited docx fails loudly instead of importing the wrong thing.
