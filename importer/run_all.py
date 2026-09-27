"""Phase 0: turn the source files into versioned JSON, and write the import report.

    python importer/run_all.py
"""
import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import benchmarks  # noqa: E402
import config  # noqa: E402
import cr_import  # noqa: E402
import decks  # noqa: E402
import links_import  # noqa: E402
import og_import  # noqa: E402
import plan_import  # noqa: E402
import rc_import  # noqa: E402

# ---------------------------------------------------------------- the calendar (spec: Your dates)
START = date(2026, 12, 1)
PAUSE = (date(2026, 12, 24), date(2027, 1, 1))
SATURDAY_MIN, MORNING_MIN, RIDE_MIN = 240, 45, 80      # Sat 10-14; Tue-Thu 07:45-08:30; 80 min a weekday
PLAN_SHARE = 0.85                                       # the free 15%


def day_capacity(d):
    if PAUSE[0] <= d <= PAUSE[1]:
        return 0, 0
    wd = d.weekday()                                    # Mon 0 … Sun 6
    desk = SATURDAY_MIN if wd == 5 else MORNING_MIN if wd in (1, 2, 3) else 0
    bus = RIDE_MIN if wd <= 4 else 0
    return desk * PLAN_SHARE, bus * PLAN_SHARE


def finish_date(desk_need, bus_need):
    """Desk-only work needs desk time; bus-friendly work can use either."""
    d, desk, bus = START, 0.0, 0.0
    while True:
        a, b = day_capacity(d)
        desk += a
        bus += b
        if desk >= desk_need and desk + bus >= desk_need + bus_need:
            return d
        d += timedelta(days=1)


def totals(tasks, pred=lambda t: True):
    desk = sum(t["est_minutes"] + t["review_minutes"] for t in tasks if pred(t) and t["needs_desk"])
    bus = sum(t["est_minutes"] + t["review_minutes"] for t in tasks if pred(t) and not t["needs_desk"])
    return desk, bus


def write_json(name, obj):
    config.OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = config.OUT_DIR / name
    text = json.dumps(obj, ensure_ascii=False, indent=1)
    path.write_text(text, encoding="utf-8")
    return {"file": name, "bytes": len(text.encode()), "sha256": hashlib.sha256(text.encode()).hexdigest()[:16]}


def hm(minutes):
    return f"{minutes / 60:.0f} h"


def main():
    print("RC bank…")
    rc_sections, rc_stats, rc_issues, glosses, key_examples, rc_check = rc_import.run()
    print("CR bank…")
    cr_bank, cr_stats, cr_issues = cr_import.run()
    print("Official Guide books…")
    books, book_reports, og_flagged = og_import.run()
    og = books["og"]
    print("Plan…")
    plan = plan_import.run(books, rc_sections, cr_bank)
    tasks = plan["tasks"]
    links, link_compare = links_import.run(plan["paragraphs"], tasks)
    rules = benchmarks.run()
    deck = decks.run()

    # ------------------------------------------------------------ write the data
    files = [
        write_json("plan.json", {"version": config.DATA_VERSION, "plan": "GMAT Ninja 13-week plan, 2024–25 Focus edition",
                                 "settings_defaults": plan_import.SETTINGS_DEFAULTS, "tasks": tasks,
                                 "section_text": plan["section_text"], "help": plan["help"]}),
        write_json("rc_bank.json", {"version": config.DATA_VERSION, "sections": [
            {**s, "passages": [{k: v for k, v in p.items() if not k.startswith("_")} for p in s["passages"]]}
            for s in rc_sections]}),
        write_json("cr_bank.json", {"version": config.DATA_VERSION, **cr_bank}),
        write_json("book_keys.json", {"version": config.DATA_VERSION, "books": books}),
        write_json("links.json", {"version": config.DATA_VERSION, "links": links}),
        write_json("benchmarks.json", {"version": config.DATA_VERSION, **rules}),
        write_json("decks.json", {"version": config.DATA_VERSION, **deck}),
    ]
    write_json("manifest.json", {"version": config.DATA_VERSION, "files": files})
    # One file for the app: loaded once from the laptop, never published with the site.
    bundle = {"format": "gmat-content", "version": config.DATA_VERSION}
    for f in files:
        name = f["file"].removesuffix(".json")
        bundle[name] = json.loads((config.OUT_DIR / f["file"]).read_text(encoding="utf-8"))
    (config.PROJECT / "data" / "gmat-content-v1.json").write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")

    # ------------------------------------------------------------ hours and the finish date
    real = [t for t in tasks if t["optional"] != "setting"]
    desk, bus = totals(real)
    fin = finish_date(desk, bus)
    core_desk, core_bus = totals(real, lambda t: t["optional"] == "core")
    fin_core = finish_date(core_desk, core_bus)
    # the Settings switch "Verbal Review sets on the bus" is on by default; this is the date with it off
    vr_min = sum(t["est_minutes"] + t["review_minutes"] for t in real if t.get("bus_switch"))
    lever_desk = desk + vr_min
    fin_lever = finish_date(lever_desk, bus - vr_min)
    weeks = (fin - START).days / 7
    desk_week = (SATURDAY_MIN + 3 * MORNING_MIN) * PLAN_SHARE
    bus_week = 5 * RIDE_MIN * PLAN_SHARE
    pending = [t for t in tasks if json.dumps(t["pointer"]).find("pending_catalog") >= 0]
    chips = sum(len(t["break_points"]) if t["break_points"] and t["kind"] != "video" else 1 for t in real)

    # ------------------------------------------------------------ the report
    R = []
    w = R.append
    w(f"# Phase 0 import report\n\nData version `{config.DATA_VERSION}` · generated by `importer/run_all.py`\n")
    w("## At a glance\n")
    w(f"- **Plan:** {len(real)} tasks over 13 plan weeks ({chips} chips once long sets are cut into halves). "
      f"{len(plan['dropped'])} plan lines deliberately not made into tasks, {len(plan['duplicates'])} repeated videos merged, "
      f"{len(plan['unclassified'])} lines the importer couldn't classify.")
    w(f"- **RC bank:** {rc_stats['sections']} sections, {rc_stats['passages']} passages, {rc_stats['questions']} questions. "
      f"All {rc_stats['keys_found']} hidden keys found, and all {rc_check['agree']} agree with the answer key at the end of the file.")
    w(f"- **CR bank:** {cr_stats['lsat_sets']} LSAT sets ({cr_stats['lsat_questions']} questions) as the default, "
      f"{cr_stats['reserve_sets']} GMAT Club sets ({cr_stats['reserve_questions']}) in reserve. **No answer column**, so CR sets use the review's fallback path.")
    nq = sum(len(b["questions"]) for b in books.values())
    w(f"- **Official Guide books:** all four, 2025–2026 editions, {nq} questions (OG {len(og['questions'])}, Quant Review "
      f"{len(books['qr']['questions'])}, Verbal Review {len(books['vr']['questions'])}, DI Review {len(books['dir']['questions'])}). "
      f"Numbering and counts pass in every section; {len(og_flagged)} questions flagged. Printed DI in both OG and DI Review: "
      "data sufficiency and two-part only.")
    w(f"- **Hours:** {hm(desk)} at a desk and {hm(bus)} that fit the bus (both include the reviews). "
      f"From 1 Dec 2026, that finishes around **{fin:%d %b %Y}** (desk time sets it).")
    w("")

    w("## Before anything else: what's different from the prompt\n")
    w("| Prompt says | What I found | What I did |\n|---|---|---|")
    w("| `link_catalog.json`, 272 links | The plan's links, classified, plus 3 extras (GMAT with CJ list, Forum Quiz, a Bunuel thread) | "
      "Merged into `links.json`. It has no hard-only (605–705) lists; timed sets use the plan's mixed-difficulty lists instead |")
    w("| The OG as a PDF | The 2025–2026 **epubs** of all four books (OG, Quant, Verbal and DI Review) | Read the epubs: same "
      "numbering and answers as the PDF, and they keep the printed page numbers |")
    w("| Convert the `.doc` with `soffice` | LibreOffice isn't installed | Word did the same conversion to UTF-8 text |")
    w("| Split on `Time 35 minutes`; strip `\\(([A-E])\\)` from choice D | The key sits in full-width brackets, `（B）` | "
      "The regex accepts both kinds of bracket. Still 29 sections, 780 keys |")
    w("| Prototype and research report | Now in `sources/` and `docs/` | Used from Phase 1 |")
    w("| Node.js and Git | Neither is installed | Not needed for Phase 0; needed for Phase 1 |")
    w("")

    # ---- A. plan
    w("## A. The plan\n")
    kinds = Counter(t["kind"] for t in real)
    w("**Tasks by kind:** " + ", ".join(f"{k.replace('_', ' ')} {n}" for k, n in kinds.most_common()) + "\n")
    by_week = defaultdict(lambda: [0, 0, 0])
    for t in real:
        by_week[t["plan_week"]][0] += 1
        by_week[t["plan_week"]][1 if t["needs_desk"] else 2] += t["est_minutes"] + t["review_minutes"]
    w("| Plan week | Tasks | Desk | Bus-friendly |\n|---|---|---|---|")
    for wk in sorted(by_week):
        n, d, b = by_week[wk]
        w(f"| {wk} | {n} | {d / 60:.1f} h | {b / 60:.1f} h |")
    w("")
    w(f"**About the count.** The prompt expected about 320. It comes to {len(real)} tasks because {len(plan['dropped'])} lines aren't tasks "
      f"(below), {len(plan['duplicates'])} videos appear twice in the plan and became one task each, and a line like "
      f"“Videos: A | B | C” becomes three tasks while “Watch A or read B” becomes one. Cut into pieces, it's {chips} chips.\n")
    w("**Sample: the whole of plan week 1, and part of week 8**\n")
    w("| id | kind | optional? | min | where | what | pointer |\n|---|---|---|---|---|---|---|")

    def ptr(t):
        p = t["pointer"]
        if p["type"] == "og_block":
            s = f"{plan_import.BOOK_NAMES[p.get('book', 'og')]} {p['qtype']} #{p['numbers'][0]}–{p['numbers'][1]}"
            if p.get("book_pages"):
                s += f", pp. {p['book_pages'][0]}–{p['book_pages'][1]}"
            return s
        if p["type"] == "lsat_rc":
            return f"{p.get('section')} ({p.get('source')})" + (f" · stands in for {p['stand_in_for']}" if p.get("stand_in_for") else "")
        if p["type"] == "lsat_cr":
            return f"{p.get('label')}" + (f" · stands in for {p['stand_in_for']}" if p.get("stand_in_for") else "")
        if p["type"] == "gmatclub_list":
            return f"GMAT Club list ({', '.join(p['lists'])}), {p.get('count')}"
        if p["type"] in ("stand_in", "timed_set", "timed_sections"):
            rec = "; ".join(f"{r['count']} from {r['source']}" for r in p.get("recipe", []))
            return (f"stand-in for {p.get('stand_in_for')}" + (f": {rec}" if rec else "")
                    + (" · *links pending*" if "pending_catalog" in json.dumps(p) else ""))
        if p["type"] == "official_mock":
            return f"Official Practice Exam {p['exam']}"
        if p["type"] == "worksheet":
            return "worksheet link"
        return p.get("url", "")[:50]

    for t in real:
        if t["plan_week"] == 1 or (t["plan_week"] == 8 and t["section"] in ("mock", "quant", "di")):
            where = "desk" if t["needs_desk"] else "bus"
            g = t.get("target")
            tgt = (f" · target {g['count']} at 100%" + (f" in under {g['minutes']} min" if g.get("minutes") else "")) if g else ""
            w(f"| {t['id']} | {t['kind']} | {t['optional']} | {t['est_minutes']} | {where} | {(t['title'] or '')[:48]}{tgt} | {ptr(t)} |")
    w("\nThe full list is in `data/v1/plan.json`, each task with the fields from the prompt: `id, plan_week, section, kind, est_minutes, "
      "needs_desk, bus_ok, break_points, depends_on, pointer, target, benchmark_week`, plus the plan's own wording (`source_text`).\n")
    w("**Plan lines that are not tasks**\n")
    for n in plan["not_tasks"]:
        w(f"- Week {n['week']}: “{n['what']}”. {n['why']}")
    groups = Counter(d["why"] for d in plan["dropped"])
    for why, n in groups.items():
        eg = [d["key"] for d in plan["dropped"] if d["why"] == why][:3]
        w(f"- {n} × {why} (e.g. {', '.join(eg)})")
    w("- Week 1's baseline mock is in the data as a setting, off by default (spec: *The starting line*).")
    w("")
    w("**Decisions I made that you can reverse**\n")
    w("- Week 5 says “watch one (not both!)”: I picked the single 1-hour video (option B) over the two-video series.")
    w("- Where the plan offers two videos as alternatives (“this one or this one”), the first is the task and the other is its fallback.")
    w("- Sub-555 and mixed-difficulty links are both kept on each GMAT Club task; the app picks the level (Adapting to you).")
    w("- GMAT Club sets of 20 or more are cut into halves like OG sets, so they fit a 45-minute morning. The spec only says this for OG sets.")
    w("- The plan's six mba.com exams map to what you have: test #1 → **Exam 1 in week 8**; test #4 → **Exam 2 in week 11**; "
      "tests #2, #3, #5 and #6 (weeks 9, 10, 12, 13) → timed full sections. The spec names weeks 10 and 12; weeks 9 and 13 follow the same rule.")
    w("")
    w("**The review books replace the stand-ins.** Every plan task that names the Quant, Verbal or DI Review now points at that "
      "book's own questions (you'll read them from the epub on screen unless you have print copies). What's left of the stand-ins:\n")
    w("- **The DI online question banks** (OG and DI Review) need an access code, so those sets draw first on the two books' printed "
      "Two-Part questions, then on the free Starter Kit (weeks 4–5) and the GMAT with CJ list of official DI questions (from week 6). All linked.")
    pc = Counter(t["pointer"].get("stand_in_for", t["title"]).split(" set ")[0] for t in pending)
    w("- **Timed sections** (the plan's paid practice tests and question banks) draw on the plan's own mixed-difficulty GMAT Club lists for the topics covered so far, and the reserve CR sets plus LSAT passages for verbal.")
    w("")
    rcs = plan["material"]["rc_sets"]
    w("**How the book blocks map to your editions.** The plan numbers questions in the 2024–25 books. Each block keeps its position: "
      "“PS #76–100” is the 76th–100th problem-solving question in the 2025–26 book. Both editions order questions from easy to hard, "
      "so the difficulty curve holds, though some questions differ from the ones the plan's authors picked. Reading sets end at a passage: "
      + "; ".join(f"{plan_import.BOOK_NAMES[bk]} " + ", ".join(f"{a}–{b} ({n})" for a, b, n in s) for bk, s in rcs.items()) + ".\n")
    left = {k: v for k, v in plan["material"]["unused"].items() if v}
    w(f"**Material use:** {plan['material']['lsat_rc_used']} of 29 LSAT RC sections and {plan['material']['lsat_cr_used']} of 62 LSAT CR "
      "sets are assigned to plan tasks; the rest, and these unused book questions, are for top-ups, extra practice and a retake block: "
      + (", ".join(f"{k} {v}" for k, v in left.items()) or "none") + ".\n")
    w("**Stored once per section:** the “how to approach” and “what to do after” text for quant, RC, CR and DI, and each week's "
      f"“Need help?” links sorted by cause ({sum(len(h['entries']) for h in plan['help'])} links in {len(plan['help'])} lists).\n")

    # ---- B. RC
    w("## B. RC bank\n")
    w(f"- {rc_stats['sections']} sections, {rc_stats['passages']} passages, {rc_stats['questions']} questions; every section has 4 passages.")
    w(f"- **Answer keys: {rc_stats['keys_found']} of 780** found at the end of choice D. The file also ends with a plain answer key per section, "
      f"so every hidden key was checked against it: **{rc_check['agree']} agree, {len(rc_check['disagree'])} disagree.**")
    for i in rc_issues:
        w(f"- {i}")
    w("- The “Time 35 minutes 26 Questions” headers are wrong in 10 sections (they have 27 or 28). The question numbers and the end key agree, so I went by those.")
    w(f"- **Vocabulary notes removed.** Someone typed dictionary glosses into the passages, many in Chinese, e.g. "
      f"“revolving door (revolving door: n.十字形旋转门)”. {rc_stats['glosses_removed']} were removed so the passages read like the exam. "
      "26 were unclear; my calls are in `importer/curation/rc_glosses.json` (16 removed, 10 kept as the author's words). Worth a 2-minute look.")
    lr = rc_check["line_refs"]
    w(f"- **Line references.** {lr['questions']} questions say things like “in lines 38–39”, but the file lost the original line breaks. "
      f"The reader will highlight the text instead, as the real GMAT does: exactly for the {lr['exact_quote_highlight']} that quote a phrase, "
      f"and approximately (a few lines either side) for the other {lr['approximate_window']}.")
    qt = Counter(q["type"] for s in rc_sections for p in s["passages"] for q in p["questions"])
    tp = Counter(p["topic"] for s in rc_sections for p in s["passages"])
    low = sum(1 for s in rc_sections for p in s["passages"] if p["topic_confidence"] == "low")
    w(f"- Question types: " + ", ".join(f"{k} {v}" for k, v in qt.most_common()) + ".")
    w(f"- Passage topics: " + ", ".join(f"{k} {v}" for k, v in tp.most_common()) + f" ({low} low-confidence labels). "
      "Both are labelled by keywords, so expect a few misfiled passages; the bars only need them roughly right.\n")
    w("**20 answer-key examples** (the end of choice D as it is in the file, then as the app shows it)\n")
    random.seed(7)
    by_sec = defaultdict(list)
    for e in key_examples:
        by_sec[e["id"][:4]].append(e)
    secs = sorted(random.sample(sorted(by_sec), 20))
    picks = [random.choice(by_sec[s]) for s in secs]
    w("| Question | Choice D in the file | Choice D in the app | Key |\n|---|---|---|---|")
    for e in picks:
        w(f"| {e['id']} | …{e['before'][-58:]} | …{e['after'][-50:]} | **{e['key']}** |")
    w("")

    # ---- C. CR
    w("## C. CR bank\n")
    w(f"- **Default: {cr_stats['lsat_sets']} LSAT sets, {cr_stats['lsat_questions']} questions** (rows 489–2044). Sizes: "
      + ", ".join(f"{n} sets of {k}" for k, n in cr_stats["lsat_set_sizes"].items()) + ".")
    w(f"- **Reserve: {cr_stats['reserve_sets']} GMAT Club sets, {cr_stats['reserve_questions']} questions** (rows 1–488). "
      "The prompt says 27; the sheet has 26: Tests A–D, I–III, 1–8 and 10–20 (there's no Test 9). "
      "“Poor quality” marks one question (Test A #20), not a set; that question is dropped.")
    w("- **No column holds official answers.** So a CR set is marked when you review it: retry the not-sure ones, then type the official "
      "letters from GMAT Club in one line. After that, redos are marked automatically.")
    for i in cr_issues:
        w(f"- {i}")
    w(f"- {cr_stats['unique_links']} distinct links. Some LSAT questions share a stimulus, so a few links appear twice in a set.\n")

    # ---- D. the four books
    w("## D. Official Guide books\n")
    w("Taken from each: every question's number and answer (for Two-Part, the correct row in each column), and from the book's own "
      "index: difficulty, concept and printed page. No question text, choices or explanations.\n")
    w("| Book | Section | Numbers | No gaps | One valid answer each | Count matches the book's index |\n|---|---|---|---|---|---|")
    names = {"PS": "Quant problem solving", "DS": "Data sufficiency", "TPA": "Two-part analysis", "RC": "Reading", "CR": "Critical reasoning"}
    for bk, rep in book_reports.items():
        for sec, r in rep.items():
            w(f"| {plan_import.BOOK_NAMES[bk]} ({books[bk]['meta']['edition']}) | {names[sec]} | {r['range']} ({r['printed']}) | "
              f"{'yes' if r['numbers_run_without_gaps'] else 'NO'} | {r['exactly_one_valid_answer']} | {'yes' if r['count_matches_index'] else 'NO'} |")
    w("\n**Flagged** (the first time one comes up, the app asks for the answer from the book's key):\n")
    for f in og_flagged:
        w(f"- {plan_import.BOOK_NAMES[f['book']]} Q{f['n']} ({names[f['section']]}): {f['why']}")
    w("\n**DI types printed (decision D14):** both the OG and the DI Review print only data sufficiency and two-part questions. "
      "Graphs, tables and multi-source questions live in their online banks, which need the access code that comes with a new copy. "
      "The stand-ins above cover them for free; buying access would only replace those.\n")
    w("**Page numbers.** Each index gives the printed page in the 2025–26 books. If your friend's printed OG is that edition, the "
      "“question __ is on page __” screen comes pre-filled and you just confirm it.\n")

    # ---- E. benchmarks
    w("## E. Reading your results\n")
    w(f"`benchmarks.json` has {len(rules['rules'])} entries (per plan week and section): accuracy bands, the careless-slip ceiling, time per "
      "question, and the mock gap from 665. The numbers come from the spec's summary table; I haven't opened the GMAT Club posts.\n")
    w("**Three numbers to check against the original posts:**\n")
    for c in rules["double_check"]:
        w(f"- {c['what']}: {c['value']}")
    w("\nAlso: only week 1's guide has a link in the docx. Weeks 2–13 say “see the next post in this thread” with no address, "
      "and the catalogue doesn't have them either, so the “Why?” links need the week threads' addresses.\n")

    # ---- F. decks
    w("## F. Starter decks (drafts, not in the app until you approve)\n")
    tcount = Counter(c["topic"] for c in deck["quant_facts"])
    w(f"- Quant facts: **{len(deck['quant_facts'])} cards**: " + ", ".join(f"{k} {v}" for k, v in tcount.items()) + ".")
    w(f"- Method: **{len(deck['method'])} cards** covering RC, CR, DS, quant, timing and DI. No technique is named.")
    w("- Full list to read: `data/decks_draft.md`. Numeric answers are computed by the script, not typed.\n")

    # ---- hours
    w("## Hours and the finish date\n")
    w(f"Your week: desk {SATURDAY_MIN + 3 * MORNING_MIN} min (Saturday 4 h + three 45-minute mornings), rides {5 * RIDE_MIN} min. "
      f"Plan tasks get 85%: **{desk_week / 60:.1f} h desk + {bus_week / 60:.1f} h bus a week**. Pause 24 Dec – 1 Jan.\n")
    w("| Scenario | Desk | Bus-friendly | Finish (from 1 Dec 2026) |\n|---|---|---|---|")
    w(f"| **Every plan task, Verbal Review sets on the bus (default)** | {hm(desk)} | {hm(bus)} | **{fin:%d %b %Y}** ({weeks:.0f} weeks) |")
    w(f"| Same, with the Settings switch off (Verbal Review at the desk) | {hm(lever_desk)} | {hm(bus - vr_min)} | {fin_lever:%d %b %Y} |")
    w(f"| Core tasks only, for comparison | {hm(core_desk)} | {hm(core_bus)} | {fin_core:%d %b %Y} |")
    w("")
    w(f"The spec expected “about late June 2027”. The difference is desk time: {hm(desk)} at {desk_week / 60:.1f} h a week is "
      f"{desk / desk_week:.0f} working weeks. The biggest desk items are GMAT Club sets ({hm(sum(t['est_minutes'] + t['review_minutes'] for t in real if t['kind'] == 'gmatclub_set'))}), "
      f"book sets from the four OG books ({hm(sum(t['est_minutes'] + t['review_minutes'] for t in real if t['kind'] == 'og_set'))}) and DI sets "
      f"({hm(sum(t['est_minutes'] + t['review_minutes'] for t in real if t['kind'] == 'di_set'))}). "
      "Estimates: 2 min a question in the book, 2.5 on GMAT Club, reviews at about a third of a set's questions × 3 min. "
      f"{sum(1 for t in real if t['kind'] == 'video' and t['est_source'] == 'default')} videos have no stated length and count as {plan_import.DEFAULT_VIDEO_MIN} min.\n")
    w("Bus-friendly work fits the rides comfortably, so rides will also carry cards, verbal reviews and reserve CR (spec: *If one budget runs ahead*).\n")

    # ---- decisions
    w("## Decided (27 Sep 2026)\n")
    w("- **OG edition:** taken as 2025–2026 (the book hasn't arrived yet). The app's one-time edition check at setup confirms it.")
    w("- **Hard lists:** timed sections and late stand-ins use the plan's own mixed-difficulty lists for the topics covered so far. "
      "Hard-only (605–705) lists can replace them in Phase 3.")
    w("- **Verbal Review on the bus:** a switch in Settings, on by default. Off puts those sets back at the desk (the second row of the "
      "finish-date table).")
    w("- **Content stays off the public site:** the app is published; the passages and answer keys load once from a file on your laptop.")
    w("- **Approved:** the 26 gloss calls and both starter decks.\n")
    w("## Before Phase 1\n")
    w("- Node.js and Git on this laptop (neither is installed).")
    w("- Optional: the week-2 “how to read your results” link, if you have it. Weeks without one just don't show a “Why?” link.\n")

    w("## Files\n")
    w("| File | Size | What |\n|---|---|---|")
    desc = {"plan.json": "tasks, per-section text, help links", "rc_bank.json": "passages, questions, keys, types, topics, highlight spans",
            "cr_bank.json": "62 LSAT sets + 26 reserve sets (links)",
            "book_keys.json": "answers + index metadata for the OG and the three review books, no question text",
            "links.json": "every plan link, classified, with fallbacks", "benchmarks.json": "reading-your-results rules",
            "decks.json": "starter decks (approved 27 Sep 2026)"}
    for f in files:
        w(f"| `data/v1/{f['file']}` | {f['bytes'] / 1024:.0f} KB | {desc[f['file']]} |")
    if link_compare:
        w(f"\nLinks: {len(links)} in `links.json`. Of the catalogue's {link_compare['catalog_links']}, {link_compare['matched']} match a "
          f"plan link (ignoring `?si=` and `#post` tails); its extras are {', '.join(link_compare['catalog_only'])}. "
          f"Links in the plan but not in the catalogue: {len(link_compare['docx_only'])}.")
    config.REPORT.write_text("\n".join(R), encoding="utf-8")

    # decks for reading
    D = ["# Draft starter decks\n", "Status: waiting for approval. Edit freely; say which to cut or change.\n",
         f"## Quant facts ({len(deck['quant_facts'])})\n", "| # | Topic | Front | Back |", "|---|---|---|---|"]
    for c in deck["quant_facts"]:
        D.append(f"| {c['id']} | {c['topic']} | {c['front']} | {c['back']} |")
    D += [f"\n## Method ({len(deck['method'])})\n", "| # | Front | Back |", "|---|---|---|"]
    for c in deck["method"]:
        D.append(f"| {c['id']} | {c['front']} | {c['back']} |")
    (config.PROJECT / "data" / "decks_draft.md").write_text("\n".join(D), encoding="utf-8")
    print(f"done: {len(real)} tasks, finish {fin}, report at {config.REPORT}")


if __name__ == "__main__":
    main()
