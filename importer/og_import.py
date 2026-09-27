"""Official Guide 2025-2026: answer keys only, plus the book's own question index.

Takes, per question: number, answer (a letter; for Two-Part, the correct row per column),
and from the book's index (chapter 9): difficulty, concept, question ID, printed page.
No question text, answer choices or explanations are copied.

The epub is the source the PDF was converted from, so it has the same numbering and
answers, and it keeps the printed page numbers as page markers.
"""
import re
import zipfile

from bs4 import BeautifulSoup

import config

SECTIONS = {
    # name: (file, practice heading id, key heading id, first number)
    "PS": ("c04.xhtml", "c04-sec-003", "c04-sec-004"),
    "DS": ("c06.xhtml", "c06-sec-0017", "c06-sec-0018"),
    "TPA": ("c06.xhtml", "c06-sec-0020", "c06-sec-0021"),
    "RC": ("c08.xhtml", "c08-sec-4", "c08-sec-5"),
    "CR": ("c08.xhtml", "c08-sec-7", "c08-sec-8"),
}
INDEX_HEADINGS = {
    "Quantitative Reasoning": "PS", "Data Sufficiency": "DS", "Two-Part Analysis": "TPA",
    "Reading Comprehension": "RC", "Critical Reasoning": "CR",
}


def _section_html(raw: str, heading_id: str, next_id: str) -> str:
    a = raw.find(f'id="{heading_id}"')
    b = raw.find(f'id="{next_id}"', a + 1)
    assert a > 0 and b > a, f"section {heading_id} not found"
    return raw[a:b]


def practice_questions(html: str):
    """Numbers of the questions printed in a practice section, in order, with their choice
    count (or, for Two-Part, the option column of their response table)."""
    soup = BeautifulSoup(html, "lxml")
    out = []
    for ol in soup.find_all("ol"):
        if "decimal" not in (ol.get("class") or []) or ol.find_parent("li") is not None:
            continue
        n = int(ol.get("start", 1)) - 1
        for li in ol.find_all("li", recursive=False):
            n = int(li["value"]) if li.get("value") else n + 1
            alpha = li.find("ol", class_="upper-alpha")
            table = li.find("table")
            options = None
            if table is not None:
                rows = [[c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])] for tr in table.find_all("tr")]
                options = [r[-1] for r in rows[1:] if r and r[-1]]
            out.append({"n": n, "choices": len(alpha.find_all("li", recursive=False)) if alpha else 0,
                        "options": options})
    return out


def answer_key(section: str, html: str):
    soup = BeautifulSoup(html, "lxml")
    if section == "TPA":
        key = []
        for tr in soup.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all("td")]
            m = re.fullmatch(r"(\d+)\.", cells[0]) if cells else None
            if m:
                key.append((int(m.group(1)), cells[1:3]))
        return key
    text_key = [(int(n), a) for n, a in re.findall(r"(\d+)\.\s*\|?\s*([A-E])\b", soup.get_text(" | ", strip=True))]
    if section == "DS" and not text_key:
        ol = soup.find("ol")
        n = int(ol.li["value"]) - 1
        key = []
        for li in ol.find_all("li", recursive=False):
            n = int(li["value"]) if li.get("value") else n + 1
            key.append((n, li.get_text(strip=True)))
        return key
    return text_key


def book_index(raw: str):
    soup = BeautifulSoup(raw, "lxml")
    idx = {}
    for h3 in soup.find_all("h3"):
        title = h3.get_text(" ", strip=True)
        sec = next((v for k, v in INDEX_HEADINGS.items() if title.startswith(k)), None)
        table = h3.find_next("table")
        if not sec or table is None:
            continue
        for tr in table.find("tbody").find_all("tr"):
            c = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
            if len(c) >= 6 and c[2].isdigit():
                idx[int(c[2])] = {"section": sec, "difficulty": c[0], "concept": c[1],
                                  "qid": c[3], "page": int(c[4]) if c[4].isdigit() else None,
                                  "explanation_page": int(c[5]) if c[5].isdigit() else None}
    return idx


def rc_passages(html: str):
    groups = [(int(a), int(b)) for a, b in
              re.findall(r"Questions?\s+(\d+)\s*[–-]\s*(\d+)\s+refers? to the passage", html)]
    return groups


def section_type(title):
    t = title.lower()
    return ("DS" if "data sufficiency" in t else "TPA" if "two-part" in t else "RC" if "reading" in t
            else "CR" if "critical" in t else "PS")


def read_toc(z):
    """(title, file, anchor) for every entry, in order, with paths relative to the zip."""
    toc_name = next(n for n in z.namelist() if re.search(r"toc\.x?html$", n))
    base = toc_name.rsplit("/", 1)[0] + "/" if "/" in toc_name else ""
    soup = BeautifulSoup(z.read(toc_name), "lxml")
    out = []
    for a in soup.find_all("a"):
        href = a.get("href") or ""
        f, _, anchor = href.partition("#")
        out.append((a.get_text(" ", strip=True), base + f, anchor))
    return out


def book_sections(z):
    """Pairs of (section type, practice html, answer-key html), found from the book's contents page."""
    toc = read_toc(z)
    cache = {}
    get = lambda f: cache.setdefault(f, z.read(f).decode("utf-8"))
    found = []
    for i, (title, f, anchor) in enumerate(toc):
        if not title.startswith(tuple(f"{c}.{d} Practice Questions" for c in range(1, 12) for d in range(1, 12))) \
                and not re.match(r"^\d+\.\d+ Practice Questions", title):
            continue
        key_title, key_f, key_anchor = toc[i + 1]
        _, exp_f, exp_anchor = toc[i + 2]
        assert "Answer Key" in key_title, f"expected an answer key after {title!r}, got {key_title!r}"
        raw = get(f)
        found.append((section_type(title), _section_html(raw, anchor, key_anchor),
                      _section_html(get(key_f), key_anchor, exp_anchor)))
    index_entry = next(e for e in toc if "Question Index" in e[0])
    return found, get(index_entry[1])


def edition_of(z):
    for n in z.namelist():
        if n.endswith((".xhtml", ".html")):
            m = re.search(r"OFFICIAL GUIDE[A-Za-z™ ]*?(\d{4})\s*[–-]\s*(\d{4})", z.read(n).decode("utf-8", "ignore"), re.I)
            if m:
                return f"{m.group(1)}–{m.group(2)}"
    return None


def run():
    """Every Official Guide book in config.OG_BOOKS: {'og': {...}, 'qr': {...}, ...}."""
    books, reports, flagged_all = {}, {}, []
    for book_id, (name, path) in config.OG_BOOKS.items():
        b, rep, fl = run_book(book_id, name, path)
        books[book_id] = b
        reports[book_id] = rep
        flagged_all += fl
    return books, reports, flagged_all


def run_book(book_id, name, path):
    z = zipfile.ZipFile(path)
    sections, index_html = book_sections(z)
    edition = edition_of(z)
    index = book_index(index_html)

    questions, report, flagged = {}, {}, []
    rc_groups = []
    for sec, practice_html, key_html in sections:
        printed = practice_questions(practice_html)
        key = answer_key(sec, key_html)
        if sec == "RC":
            rc_groups = rc_passages(practice_html)
        nums_printed = [q["n"] for q in printed]
        nums_key = [n for n, _ in key]
        in_index = sorted(n for n, v in index.items() if v["section"] == sec)
        lo, hi = min(nums_printed), max(nums_printed)
        checks = {
            "range": f"{lo}–{hi}",
            "printed": len(printed),
            "in_book_index": len(in_index),
            "numbers_run_without_gaps": nums_printed == list(range(lo, hi + 1)),
            "key_entries": len(key),
            "key_duplicates": sorted({n for n in nums_key if nums_key.count(n) > 1}),
            "key_missing": sorted(set(nums_printed) - set(nums_key)),
            "count_matches_index": len(printed) == len(in_index) and set(in_index) == set(nums_printed),
        }
        # A number printed twice in the key (e.g. "484. B | 484. B") with the next one missing
        # is a typesetting slip; the key's order still gives the answer. Flag it, don't guess silently.
        if sec in ("PS", "RC", "CR") and checks["key_duplicates"]:
            fixed = []
            for pos, (n, a) in enumerate(key):
                expected = lo + pos
                if n != expected:
                    flagged.append({"n": expected, "section": sec, "book": book_id,
                                    "why": f"answer key prints '{n}.' where {expected} belongs; "
                                           f"taken by position as {a}. Ask for the book's key the first time it comes up."})
                fixed.append((expected, a))
            key = fixed
            checks["key_missing"] = sorted(set(nums_printed) - {n for n, _ in key})
        by_n = {q["n"]: q for q in printed}
        one_valid = 0
        for n, a in key:
            q = by_n.get(n)
            entry = {"n": n, "section": sec, **{k: v for k, v in index.get(n, {}).items() if k != "section"}}
            if sec == "TPA":
                opts = (q or {}).get("options") or []
                rows = [match_option(opts, part) for part in a]
                if all(len(r) == 1 for r in rows):
                    entry["answer"] = [r[0] for r in rows]     # correct row, per column
                    entry["options"] = len(opts)
                    one_valid += 1
                else:
                    entry["answer"] = None
                    flagged.append({"n": n, "section": sec, "book": book_id,
                                    "why": f"could not match the key to exactly one row per part ({[len(r) for r in rows]})"})
            else:
                # DS questions share the five standard DS choices, printed once for the section.
                n_choices = 5 if sec == "DS" else (q or {}).get("choices", 0)
                ok = q is not None and n_choices == 5 and a in "ABCDE"
                entry["answer"] = a
                if ok:
                    one_valid += 1
                else:
                    flagged.append({"n": n, "section": sec, "book": book_id,
                                    "why": f"key {a!r} but the question shows {q and q['choices']} choices"})
            questions[n] = entry
        checks["exactly_one_valid_answer"] = f"{one_valid}/{len(printed)}"
        report[sec] = checks

    for f in flagged:
        if f["n"] in questions:
            questions[f["n"]]["flagged"] = f["why"]

    di_types = None
    if "DS" in report or "TPA" in report:
        di_types = {"data_sufficiency": report.get("DS", {}).get("printed", 0),
                    "two_part": report.get("TPA", {}).get("printed", 0), "graphs": 0, "tables": 0, "multi_source": 0,
                    "note": "Graphs, Table Analysis and Multi-Source Reasoning are online-only in this edition; none are printed."}
    meta = {"book": book_id, "name": name, "edition": edition, "source": "epub",
            "sections": report, "rc_passage_groups": rc_groups, "di_types_printed": di_types}
    return {"meta": meta, "questions": [questions[n] for n in sorted(questions)]}, report, flagged


def norm(s: str) -> str:
    s = re.sub(r"^\([A-F]\)\s*", "", s.replace("’", "'"))
    return re.sub(r"[\s,]+", " ", s).strip().rstrip(".").lower()


def match_option(options, part):
    """Row number(s) of the option matching one part of the key. Exact first; then a
    close match (spelling variants like archaeological/archeological), only if unique."""
    import difflib
    if not part.strip():
        return []
    exact = [i + 1 for i, o in enumerate(options) if norm(o) == norm(part)]
    if exact:
        return exact
    scored = sorted(((difflib.SequenceMatcher(None, norm(o), norm(part)).ratio(), i + 1)
                     for i, o in enumerate(options)), reverse=True)
    if scored and scored[0][0] >= 0.85 and (len(scored) == 1 or scored[1][0] < scored[0][0] - 0.1):
        return [scored[0][1]]
    return []
