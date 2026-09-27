"""The GMAT Ninja 13-week plan (2024-25 Focus edition) -> tasks.

Pass 1 finds the homework lists in the docx and splits them into numbered items.
Pass 2 turns each item into one or more tasks (kind, section, minutes, pointer...).
Pass 3 assigns concrete material in plan order: OG blocks, LSAT RC sections and CR sets,
printed Two-Part questions, and the free stand-ins for material you don't own.
"""
import re
from collections import defaultdict
from math import ceil

import docx
from docx.text.hyperlink import Hyperlink

import config
from curation import plan_curation as C

LINK = re.compile(r"\[([^\]]*)\]<([^>]*)>")
NUM = re.compile(r"^\s*(\d{1,2})\.\s*(.*)$")
HEADER = re.compile(
    r"Week\s*(\d+)\s+(quant|RC|CR|Data Insights)\s+homework\s*$"
    r"|Week\s*(\d+)\s+DI assignments:?\s*$"
    r"|Week\s*(\d+)\s+practice test(?:s| assignments)?:?\s*$", re.I)
STOP = re.compile(r"^(What to do AFTER|Instructions for|Need help|How to approach|Guidance for|Warning|"
                  r"There’s no DI|As always, please see|Friendly warning|The quant “fake test”)", re.I)
SECTION_OF = {"quant": "quant", "rc": "rc", "cr": "cr", "data insights": "di"}
ORDINALS = {"first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3, "fourth": 4, "4th": 4,
            "fifth": 5, "5th": 5, "sixth": 6, "6th": 6, "seventh": 7, "7th": 7}


# ---------------------------------------------------------------- reading the docx
def plain(raw):
    return LINK.sub(lambda m: m.group(1), raw)


def links_in(raw):
    return [(t, u) for t, u in LINK.findall(raw) if not u.startswith("javascript")]


def read_paragraphs():
    d = docx.Document(config.PLAN_DOCX)
    out = []
    for i, p in enumerate(d.paragraphs):
        parts = [f"[{x.text}]<{x.url}>" if isinstance(x, Hyperlink) else x.text for x in p.iter_inner_content()]
        raw = "".join(parts)
        # "…them.2. Do a fake quant test" -> put the second item on its own line
        raw = re.sub(r"(?<=[.!?)])(?=\d{1,2}\.\s+[A-Z(“\"])", "\n", raw)
        out.append({"i": i, "raw": raw, "text": plain(raw),
                    "bullet": p._p.pPr is not None and p._p.pPr.numPr is not None})
    return out


def week_of(i):
    return max(w for w, (start, _) in C.WEEK_STARTS.items() if start <= i)


def is_section_header(p):
    return "javascript:void" in p["raw"]


# ---------------------------------------------------------------- pass 1: homework lists
def find_blocks(paras):
    starts = {s for s, _ in C.WEEK_STARTS.values()}
    blocks = []
    for p in paras:
        m = HEADER.search(p["text"].strip())
        if not m:
            continue
        week = int(m.group(1) or m.group(3) or m.group(4))
        assert week == week_of(p["i"]), f"para {p['i']}: header says week {week}, position says {week_of(p['i'])}"
        if m.group(2):
            kind, section = "homework", SECTION_OF[m.group(2).lower()]
        elif m.group(3):
            kind, section = "homework", "di"
        else:
            kind, section = "practice", "mock"
        lines = []
        for q in paras[p["i"] + 1:]:
            if q["i"] in starts or is_section_header(q) or HEADER.search(q["text"].strip()):
                break
            stop = False
            for ln in q["raw"].split("\n"):
                if STOP.match(plain(ln).strip()):
                    stop = True
                    break
                if ln.strip():
                    lines.append((q["i"], ln.strip(), q["bullet"]))
            if stop:
                break
        items, cur = [], None
        for pi, ln, bullet in lines:
            m2 = NUM.match(ln)
            if m2:
                cur = {"num": int(m2.group(1)), "raw": m2.group(2), "subs": [], "para": pi}
                items.append(cur)
            elif bullet or ln.startswith("- "):
                if kind == "practice":
                    continue                          # set-up instructions for mba.com, not tasks
                if cur is None:
                    cur = {"num": None, "raw": ln.lstrip("- "), "subs": [], "para": pi}
                    items.append(cur)
                else:
                    cur["subs"].append(ln.lstrip("- "))
            elif cur is not None and pi == cur["para"]:
                cur["raw"] += " " + ln
        if items:
            blocks.append({"week": week, "section": section, "kind": kind, "header_para": p["i"], "items": items})
    return blocks


def help_blocks(paras):
    """'Need help with X?' lists: not tasks; the source of the 'Need help?' chip, by cause."""
    out = []
    for p in paras:
        m = re.match(r"Need help with (quant|RC|CR|Data Insights)\?", p["text"].strip())
        if not m:
            continue
        section = SECTION_OF[m.group(1).lower()]
        entries = []
        for q in paras[p["i"]:p["i"] + 12]:
            if q["i"] != p["i"] and (is_section_header(q) or HEADER.search(q["text"]) or
                                     q["i"] in {s for s, _ in C.WEEK_STARTS.values()} or
                                     re.match(r"(What to do|Instructions|Need help|Congratulations|That’s it)", q["text"])):
                break
            for ln in q["raw"].split("\n"):
                ls = links_in(ln)
                if not ls:
                    continue
                t = plain(ln).lower()
                cause = ("slips" if "careless" in t else
                         "content" if re.search(r"struggl|fundamental|content|topic|trouble|worried|help", t) else
                         "general")
                entries.append({"cause": cause, "text": plain(ln).strip(" -")[:200],
                                "links": [{"text": a, "url": u} for a, u in ls if "memberlist" not in u]})
        out.append({"week": week_of(p["i"]), "section": section, "entries": entries})
    return out


def boilerplate(paras):
    """'How to approach' and 'What to do after' text, stored once per section."""
    found = {}
    for p in paras:
        t = p["text"]
        for sec_word, sec in (("quant", "quant"), ("RC", "rc"), ("CR", "cr"), ("Data Insights", "di")):
            if re.search(rf"What to do AFTER completing an? {sec_word} homework set", t) and "after" not in found.get(sec, {}):
                bullets = []
                for q in paras[p["i"] + 1:p["i"] + 6]:
                    if not q["bullet"]:
                        break
                    bullets.append(q["text"].strip())
                found.setdefault(sec, {})["after"] = bullets
            if re.search(rf"How to approach {sec_word} homework", t) and "approach" not in found.get(sec, {}):
                nxt = paras[p["i"] + 1]["text"] if "Time each set" not in t else t.split(f"How to approach {sec_word} homework")[-1]
                found.setdefault(sec, {})["approach"] = [s.strip() for s in nxt.split("\n") if s.strip()]
    return found


# ---------------------------------------------------------------- pass 2: items -> tasks
def optionality(t):
    tl = t.lower()
    if re.search(r"very,? very optional|very optional|extremely optional", tl):
        return "very optional"
    if re.search(r"optional,? but", tl):
        return "recommended"
    if re.search(r"\(optional|^optional|\(very optional", tl):
        return "optional"
    return "core"


def yt_id(url):
    m = re.search(r"(?:youtu\.be/|[?&]v=|/live/|/embed/)([\w-]{11})", url)
    return m.group(1) if m else None


def minutes_near(raw, url):
    """'(~ 1 hr.)', '(34 minutes)', '(8 mins)' in the link text or just after the link."""
    i = raw.find(url)
    j = raw.rfind("[", 0, i)
    window = raw[j:i + len(url) + 30] if i >= 0 else raw
    m = re.search(r"\(~?\s*(\d+)\+?\s*(min|minutes|mins|hr|hrs|hour)", window) or \
        re.search(r"\b(\d+)-(minute|hour)", window)
    if not m:
        return None
    n = int(m.group(1))
    return n * 60 if m.group(2).startswith("h") else n


def count_from(t):
    tl = t.lower()
    m = re.search(r"(?:\bdo|set of|total of|a set of|^)\s*(\d+)(?:\s*[-–]\s*(\d+))?\s", tl)
    if m:
        a, b = int(m.group(1)), int(m.group(2) or m.group(1))
        return round((a + b) / 2)
    if "a few" in tl:
        return 5
    return None


VERBAL_TOPICS = ["science", "humanities", "strengthen/weaken", "assumption", "evaluate the argument",
                 "inference", "except", "paradox", "boldface", "fill-in-the-blank", "RC passages"]


# GMAT Club difficulty tags as the plan's own links use them: sub-555 lists carry only the lowest
# bands, sub-655 lists add the middle ones, mixed lists carry every band (or no band at all).
TAG_SOURCE = {1320: "lsat", 1272: "older_og", 1279: "older_og", 1286: "older_og", 1293: "older_og"}
TAG_TOP_BANDS = {1540, 1533, 187, 1541, 1534, 180, 1626, 1627, 1556, 1634, 1635, 1569}
TAG_MID_BANDS = {1526, 216, 1527, 222, 1628, 1557, 1636, 1570}


def gc_lists(raw):
    lists = {}
    for text, url in links_in(raw):
        if "gmatclub.com/forum/search.php" not in url:
            continue
        tags = {int(x) for x in re.findall(r"selected_search_tags%5B%5D=(\d+)", url)}
        tl = text.lower()
        src = next((TAG_SOURCE[t] for t in tags if t in TAG_SOURCE), None)
        if src:
            key = src
        elif "555" in tl or (tags and not tags & (TAG_TOP_BANDS | TAG_MID_BANDS) and tags & {217, 1519, 223, 1520, 1558, 1629, 1571, 1637}):
            key = "easy"
        elif "655" in tl or (tags & TAG_MID_BANDS and not tags & TAG_TOP_BANDS):
            key = "medium"
        else:
            key = "mixed"
        lists[key] = url
    return lists


def topic_of(t, section):
    tl = t.lower()
    if section in ("rc", "cr"):
        for v in VERBAL_TOPICS:
            if v.split("/")[0] in tl:
                return v
        return "RC passages" if "passage" in tl else section.upper()
    m = re.search(r"(?:do|set of)\s+\d+\s+(?:sub-555\s+)?([a-z &’'\-]+?)\s+(ps|ds|problem-solving|questions)", tl)
    return m.group(1).strip() if m else None


def nice_title(title, context=""):
    """'this LIVE video on how to approach RC science passages' -> 'How to approach RC science passages'."""
    s = re.sub(r"\s*\((?:~\s*)?\d+\+?\s*(?:min|mins|minutes|hr|hrs)\.?\)\s*", " ", title or "").strip(" .")
    s = re.sub(r"^(?:watch\s+)?(?:this|these|a|the|an)?\s*(?:one\s+)?(?:last\s+)?(?:[\w]+-minute\s+)?(?:live|prerecorded|not-so-live|older|youtube)?\s*"
               r"(?:video|videos|debrief)\s*(?:series)?\s*(?:on|about|for|of)?\s*", "", s, flags=re.I).strip()
    if not s or s.lower() in ("here", "this one", "this", "this video"):
        m = re.search(r"(?:help (?:on|with)|video on|video about)\s+([a-z ,&\-]+?)(?:,|\.| watch|$)", context.lower())
        s = m.group(1).strip() if m else (title or "")
    return s[:1].upper() + s[1:]


def base_task(week, section, block_seq, t, raw):
    return {"plan_week": week, "section": section, "optional": optionality(t), "title": None,
            "source_text": plain(raw).strip()[:300], "benchmark_week": week, "_seq": block_seq}


def classify(item, week, section, block_kind, seq):
    key = f"w{week:02d}.{section}.{seq}"
    ov = C.OVERRIDES.get(key, {})
    raw = item["raw"]
    subs = item["subs"]
    if ov.get("choose"):
        subs = [s for s in subs if ov["choose"] in s]
    full_raw = raw + " " + " ".join(subs)
    t = plain(full_raw)
    tl = t.lower()
    B = lambda **kw: {**base_task(week, section, seq, t, full_raw), **kw, "_key": key}

    for pat, why in C.DROP_PATTERNS:
        if re.search(pat, tl):
            return [], why

    # --- practice-test lists
    m = re.search(r"full mba\.com test #(\d)", tl)
    if m:
        n = int(m.group(1))
        how, exam, title = C.MOCKS[n]
        return [B(section="mock", kind="mock", title=title, plan_ref=f"mba.com test #{n}",
                  pointer={"type": "official_mock", "exam": exam} if how == "official"
                  else {"type": "timed_sections", "stand_in_for": f"mba.com test #{n}",
                        "sections": ["quant", "verbal", "di"], "minutes_each": 45, "links": "pending_catalog"})], None
    # "Do a fake verbal test … similar to the fake quant test described above": the first one named counts
    fakes = sorted((tl.find(w), w, s, n) for w, s, n in (("fake quant test", "quant", 21), ("fake verbal test", "rc", 23),
                                                         ("fake di test", "di", 20)) if w in tl)
    for _, word, sec, n_q in fakes[:1]:
            ptr = {"type": "timed_set", "stand_in_for": f"Official Practice Questions ({word})", "questions": n_q,
                   "minutes": 45}
            if sec == "rc":
                ptr.update(cr={"source": "reserve CR sets", "questions": 13}, rc={"source": "lsat_rc", "passages": 3})
            else:
                ptr["links"] = "pending_catalog"
            return [B(section=sec if sec != "rc" else "cr", kind="gmatclub_set", timed=True,
                      title=f"Timed {'quant' if sec == 'quant' else 'verbal' if sec == 'rc' else 'DI'} section", pointer=ptr)], None
    if "quant section only" in tl:
        return [B(section="quant", kind="gmatclub_set", timed=True, title="Timed quant section",
                  pointer={"type": "timed_set", "stand_in_for": "unofficial quant practice test (GMAT Club tests, paid)",
                           "questions": 21, "minutes": 45, "links": "pending_catalog"})], None

    # --- drills (worksheets without A–E choices)
    if "worksheet" in tl or ("equations" in tl and "generate" in tl):
        url = next(u for _, u in links_in(full_raw))
        target = {"accuracy": 1.0, "count": 10, "minutes": 15 if "15 minutes" in tl else None}
        title = ("Linear equations drill" if "linear" in tl else "Quadratics drill" if "quadratic" in tl
                 else "Inequalities drill" if "inequalit" in tl else "Absolute values drill")
        return [B(section="quant", kind="drill", title=title, pointer={"type": "worksheet", "url": url}, target=target)], None

    # --- LSAT sets
    if re.search(r"lsat rc set", tl):
        return [B(kind="rc_section", title="LSAT reading set", pointer={"type": "lsat_rc"})], None
    if re.search(r"lsat cr set", tl):
        return [B(kind="cr_set", title="LSAT CR set", pointer={"type": "lsat_cr"})], None

    # --- GMAT Club lists from older OGs / the LSAT (verbal)
    lists = gc_lists(full_raw)
    if lists and "older editions" in tl:
        n = count_from(t) or 5
        topic = topic_of(t, section)
        q = n * 4 if "passage" in tl else n
        return [B(kind="gmatclub_set", title=f"{topic} from older OGs", topic=topic,
                  pointer={"type": "gmatclub_list", "lists": lists, "count": q,
                           "unit": "passages" if "passage" in tl else "questions", "passages": n if "passage" in tl else None})], None

    # --- Official Guide / Review books
    m = re.search(r"(quant guide|quant review)[^#]*#\s*(\d+)\s*-\s*(\d+)", tl)
    if m:
        a, b = int(m.group(2)), int(m.group(3))
        return [B(section="quant", kind="og_set", title="Quant Review problem solving",
                  pointer={"type": "og_block", "book": "qr", "qtype": "PS", "plan_numbers": [a, b]})], None
    if "remaining ps questions" in tl and "quant guide" in tl:
        return [B(section="quant", kind="og_set", title="Quant Review problem solving, the rest",
                  pointer={"type": "og_block", "book": "qr", "qtype": "PS", "remaining": True})], None
    m = re.search(r"(?:official guide|\bog)\s*(?:ps|problem solving)\s*#\s*(\d+)\s*-\s*(\d+)", tl)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return [B(section="quant", kind="og_set", title="OG problem solving",
                  pointer={"type": "og_block", "qtype": "PS", "plan_numbers": [a, b]})], None
    if "remaining ps questions" in tl:
        return [B(section="quant", kind="og_set", title="OG problem solving, the rest",
                  pointer={"type": "og_block", "qtype": "PS", "remaining": True})], None
    ordm = re.search(r"\b(first|second|third|fourth|fifth|sixth|seventh|1st|2nd|3rd|4th|5th|6th|7th)\b", tl)
    ordinal = ORDINALS[ordm.group(1)] if ordm else None
    # "the 6th set … (if you have fewer than 20 remaining, finish them all)" is the 6th set, not "the rest"
    remaining = bool(re.search(r"\bany remaining\b", tl)) and ordinal is None
    if section in ("rc", "cr") and remaining and re.search(r"remaining (?:\w+ )?questions from (?:a recent edition of )?the (?:gmat )?(?:og|official guide)", tl):
        return [B(kind="og_set", title=f"OG {'reading' if section == 'rc' else 'critical reasoning'}, the rest",
                  pointer={"type": "og_block", "qtype": section.upper(), "remaining": True})], None
    if re.search(r"data sufficiency questions|\bds questions from", tl) and not tl.startswith("watch"):
        if "online exclusive" in tl:
            return [B(kind="di_set", title="Extra DS set", pointer={"type": "stand_in", "stand_in_for": "OG online-only DS",
                                                                     "source": "gmatclub_week_lists", "qtype": "DS", "count": 10})], None
        if "data insights review" in tl:
            return [B(kind="og_set", title="DI Review data sufficiency" + (", the rest" if remaining else ""),
                      pointer={"type": "og_block", "book": "dir", "qtype": "DS", "ordinal": ordinal, "size": 20,
                               "remaining": remaining})], None
        return [B(kind="og_set", title="OG data sufficiency" + (", the rest" if remaining else ""),
                  pointer={"type": "og_block", "qtype": "DS", "ordinal": ordinal, "size": 20,
                           "remaining": remaining})], None
    if section in ("rc", "cr") and ("verbal" in tl and ("guide" in tl or "review" in tl)):
        name = "reading" if section == "rc" else "critical reasoning"
        return [B(kind="og_set", title=f"Verbal Review {name}" + (", the rest" if remaining else ""),
                  pointer={"type": "og_block", "book": "vr", "qtype": section.upper(), "ordinal": ordinal, "size": 25,
                           "remaining": remaining})], None
    if section in ("rc", "cr") and re.search(r"\bog\b|official guide", tl):
        return [B(kind="og_set", title=f"OG {'reading' if section == 'rc' else 'critical reasoning'}",
                  pointer={"type": "og_block", "qtype": section.upper(), "ordinal": ordinal, "size": 25,
                           "remaining": remaining})], None

    # --- mba.com online question banks (DI) -> free stand-ins
    if re.search(r"question bank|official practice questions\s*-\s*data insights", tl):
        n = count_from(t) or (None if "remaining" in tl else 15)
        tl_types = re.sub(r"no (?:ds|msr)(?: or (?:ds|msr))?|\(no ds[^)]*\)", "", tl)   # "no DS or MSR"
        types = [x for x, pat in (("GI", r"graphical|\bgi\b"), ("TA", r"table analysis|\bta\b"),
                                  ("TPA", r"two-part|\btpa\b"), ("MSR", r"multi-source|\bmsr\b")) if re.search(pat, tl_types)]
        if "four non-ds" in tl or "all four" in tl:
            types = ["GI", "TA", "TPA", "MSR"]
        bank = ("DI Review online bank" if "data insights review" in tl else
                "Official Practice Questions – DI" if "official practice questions" in tl else "OG online bank")
        return [B(kind="di_set", title=f"DI set: {', '.join(types) or 'mixed'}",
                  pointer={"type": "stand_in", "stand_in_for": bank, "types": types or ["GI", "TA", "TPA", "MSR"],
                           "count": n, "remaining": "remaining" in tl})], None

    # --- GMAT Club topic lists (quant, DS, DI)
    if lists:
        n = count_from(t) or 15
        qtype = "DS" if re.search(r"\bds\b", tl) else "PS" if re.search(r"\bps\b|problem-solving", tl) else None
        topic = topic_of(t, section)
        if topic is None:
            topic = ("graphs & tables" if "graphs" in tl else "two-part" if "two-part" in tl else "mixed")
        return [B(kind="gmatclub_set", title=f"{topic.title() if topic else 'Practice'} · {n} questions",
                  topic=topic, pointer={"type": "gmatclub_list", "lists": lists, "count": n, "qtype": qtype})], None

    # --- videos (possibly several in one item)
    vids = [(a, u) for a, u in links_in(full_raw) if "youtu" in u and yt_id(u)]
    if vids:
        tasks, group = [], None
        segs = LINK.split(full_raw)   # text, linktext, url, text, ...
        between = [segs[i] for i in range(3, len(segs), 3)]
        all_links = links_in(full_raw)
        for idx, (a, u) in enumerate(all_links):
            conn = segs[idx * 3].lower() if idx else ""
            alt = bool(re.search(r"\bor\b|alternatively|and perhaps", conn[-60:])) and idx > 0
            if "youtu" in u and yt_id(u):
                if alt and group is not None:
                    group["alternatives"].append({"title": a, "url": u})
                    continue
                mins = minutes_near(full_raw, u)
                group = B(kind="video", title=nice_title(a, t)[:120], pointer={"type": "video", "url": u, "youtube_id": yt_id(u)},
                          est_minutes=mins, alternatives=[])
                tasks.append(group)
            elif alt and group is not None:
                group["alternatives"].append({"title": a, "url": u})   # e.g. the article version of a video
        return tasks, None

    ls = links_in(full_raw)
    if ls:
        return [B(kind="article", title=ls[0][0][:120], pointer={"type": "url", "url": ls[0][1]})], None
    return [], "could not classify"


def para_tasks(paras):
    tasks = []
    for spec in C.PARA_TASKS:
        p = paras[spec["para"]]
        assert spec["expect"] in p["raw"], f"para {spec['para']} no longer contains {spec['expect']!r}"
        raw = p["raw"]
        ls = [(a, u) for a, u in links_in(raw) if not any(s in u for s in spec.get("skip", []))]
        base = {"plan_week": spec["week"], "section": spec["section"], "benchmark_week": spec["week"],
                "source_text": p["text"][:300], "optional": "optional" if spec["kind"] == "article" else optionality(p["text"]),
                "_key": f"w{spec['week']:02d}.para{spec['para']}", "_first": spec.get("first", False)}
        if spec["mode"] in ("numbered",):
            chunks = [NUM.match(ln) for ln in raw.split("\n")]
            groups = [(m.group(2)) for m in chunks if m]
        elif spec["mode"] == "alternatives":
            groups = [raw]
        elif spec["mode"] == "bullets":
            groups = [raw]
        else:
            groups = [f"[{a}]<{u}>" for a, u in ls]
        for g in groups:
            gl = [(a, u) for a, u in links_in(g) if not any(s in u for s in spec.get("skip", []))]
            if not gl:
                continue
            a, u = gl[0]
            kind = spec["kind"]
            if kind in ("test_prep", "video") and "youtu" not in u and kind == "video":
                kind = "article"
            t = {**base, "kind": kind, "title": spec.get("title") or nice_title(a, plain(g))[:120],
                 "optional": optionality(plain(g)) if spec["mode"] in ("numbered", "bullets") else base["optional"],
                 "pointer": {"type": "video", "url": u, "youtube_id": yt_id(u)} if yt_id(u) else {"type": "url", "url": u},
                 "alternatives": [{"title": x, "url": y} for x, y in gl[1:]] if spec["mode"] == "alternatives" else [],
                 "est_minutes": spec.get("minutes") or minutes_near(g, u)}
            tasks.append(t)
    return tasks


# ---------------------------------------------------------------- pass 3: material + estimates
BOOK_NAMES = {"og": "OG", "qr": "Quant Review", "vr": "Verbal Review", "dir": "DI Review"}
# DI stand-ins by type (spec: Material you don't have), from links in the catalogue.
STARTER_KIT_URL = "https://gmatofficialpractice.mba.com/account/learning-hub/my-learning/in-progress"   # L154
CJ_LIST_URL = "https://gmatwithcj.com/official-gmat-data-insights-practice-questions/"                   # X003


def og_groups_rc(og):
    """Book RC sets of ~25 that end at a passage boundary."""
    groups = og["meta"]["rc_passage_groups"]
    sets, cur = [], []
    for a, b in groups:
        n_cur = sum(y - x + 1 for x, y in cur)
        if cur and n_cur + (b - a + 1) > 27 and n_cur >= 20:
            sets.append(cur)
            cur = []
        cur.append((a, b))
    if cur:
        sets.append(cur)
    return sets


def assign_material(tasks, books, rc_sections, cr_bank):
    notes = []
    q_of = {b: {q["n"]: q for q in books[b]["questions"]} for b in books}
    ranges = {b: {sec: tuple(int(x) for x in r["range"].split("–")) for sec, r in books[b]["meta"]["sections"].items()}
              for b in books}
    rc_sets = {b: og_groups_rc(books[b]) for b in books if books[b]["meta"]["rc_passage_groups"]}
    used = defaultdict(set)
    lsat_rc_i, lsat_cr_i = 0, 0
    tpa_pool = {b: list(range(ranges[b]["TPA"][0], ranges[b]["TPA"][1] + 1)) for b in books if "TPA" in ranges[b]}

    def block(book, qtype, nums, t, into=None):
        nums = [n for n in nums if n not in used[(book, qtype)]]
        used[(book, qtype)].update(nums)
        qs = q_of[book]
        pages = sorted({qs[n]["page"] for n in nums if qs[n].get("page")})
        (into if into is not None else t["pointer"]).update(
            book=book, numbers=[nums[0], nums[-1]] if nums else None, count=len(nums),
            book_pages=[pages[0], pages[-1]] if pages else None, edition=books[book]["meta"]["edition"],
            flagged=[n for n in nums if qs[n].get("flagged")])
        return nums

    for t in tasks:
        p = t["pointer"]
        if p.get("type") == "og_block":
            bk, q = p.get("book", "og"), p["qtype"]
            lo, hi = ranges[bk][q]
            if q == "PS" and not p.get("remaining"):
                a, b = p["plan_numbers"]
                nums = block(bk, "PS", list(range(lo + a - 1, min(lo + b - 1, hi) + 1)), t)
                p["mapping"] = (f"2024–25 {BOOK_NAMES[bk]} PS #{a}–{b} → your edition's #{nums[0]}–{nums[-1]} (same positions)"
                                if nums else f"2024–25 {BOOK_NAMES[bk]} PS #{a}–{b}: nothing left in your edition")
            elif q in ("DS", "CR") and not p.get("remaining"):
                size = p["size"]
                a = lo + (p["ordinal"] - 1) * size
                nums = block(bk, q, list(range(a, min(a + size - 1, hi) + 1)), t)
                if not nums:
                    notes.append(f"{t['id']}: nothing left in your {BOOK_NAMES[bk]} for {q} set {p['ordinal']}")
            elif q == "RC" and not p.get("remaining"):
                k = p["ordinal"] - 1
                if k < len(rc_sets[bk]):
                    block(bk, "RC", [n for a, b in rc_sets[bk][k] for n in range(a, b + 1)], t)
                    p["passage_groups"] = rc_sets[bk][k]
                else:
                    block(bk, "RC", [], t)
            else:   # "any remaining"
                nums = block(bk, q, [n for n in range(lo, hi + 1) if n not in used[(bk, q)]], t)
                if not nums:
                    t["_drop"] = f"Nothing left: your {BOOK_NAMES[bk]}'s {q} questions are all used by earlier sets."
        elif p.get("type") == "lsat_rc":
            if lsat_rc_i < len(rc_sections):
                p.update(section=rc_sections[lsat_rc_i]["id"], source=rc_sections[lsat_rc_i]["source"],
                         count=rc_sections[lsat_rc_i]["question_count"])
                lsat_rc_i += 1
            else:
                p["section"] = None
                notes.append(f"{t['id']}: no LSAT RC section left (all 29 used)")
        elif p.get("type") == "lsat_cr":
            s = cr_bank["default_sets"][lsat_cr_i]
            p.update(set=s["id"], label=s["label"], count=s["size"])
            lsat_cr_i += 1
        elif p.get("type") == "stand_in" and t["kind"] == "di_set" and "types" in p:
            # Spec order: the books' printed Two-Part questions first, then the free Starter Kit (early weeks)
            # or the GMAT with CJ list of official DI questions (from plan week 6).
            n = p.get("count") or 15
            p["count"] = n
            recipe = []
            if "TPA" in p["types"]:
                share = n if p["types"] == ["TPA"] else round(n / len(p["types"]))
                prefer = ["dir", "og"] if "DI Review" in p["stand_in_for"] else ["og", "dir"]
                for bk in prefer:
                    take = [x for x in tpa_pool.get(bk, []) if x not in used[(bk, "TPA")]][:share]
                    if take:
                        part = {"source": f"{BOOK_NAMES[bk]} book, Two-Part (printed)"}
                        block(bk, "TPA", take, t, into=part)
                        recipe.append(part)
                        share -= len(take)
                    if share <= 0:
                        break
            rest = n - sum(r["count"] for r in recipe)
            if rest > 0:
                others = [x for x in p["types"] if x != "TPA"] or ["TPA"]
                if t["plan_week"] < 6:
                    recipe.append({"source": "mba.com Starter Kit (free)", "url": STARTER_KIT_URL, "types": others, "count": rest})
                else:
                    recipe.append({"source": "GMAT with CJ list (official DI questions)", "url": CJ_LIST_URL,
                                   "types": others, "count": rest})
            p["recipe"] = recipe
    return notes, {"lsat_rc_used": lsat_rc_i, "lsat_cr_used": lsat_cr_i,
                   "printed_tpa_unused": {bk: len([x for x in pool if x not in used[(bk, "TPA")]]) for bk, pool in tpa_pool.items()},
                   "rc_sets": {bk: [[g[0][0], g[-1][1], sum(b - a + 1 for a, b in g)] for g in s] for bk, s in rc_sets.items()},
                   "unused": {f"{BOOK_NAMES[bk]} {sec}": (hi - lo + 1) - len(used[(bk, sec)])
                              for bk in ranges for sec, (lo, hi) in ranges[bk].items()}}


def resolve_week_lists(tasks):
    """Stand-ins that say 'use this week's GMAT Club lists' get the first matching list of that week."""
    by_week = defaultdict(list)
    for t in tasks:
        if t["pointer"].get("type") == "gmatclub_list" and t["pointer"].get("qtype"):
            by_week[(t["plan_week"], t["pointer"]["qtype"])].append(t)
    for t in tasks:
        p = t["pointer"]
        if p.get("source") != "gmatclub_week_lists":
            continue
        qtype = p.get("qtype") or "PS"
        cands = by_week.get((t["plan_week"], qtype)) or []
        if not cands and by_week.get((t["plan_week"] - 1, qtype)) and t["plan_week"] <= 9:
            # the week before has this week's topic lists (e.g. DS lists follow the quant topics)
            cands = by_week[(t["plan_week"] - 1, qtype)]
            p["from_week"] = t["plan_week"] - 1
        # Weeks 10-13 have no topics: those stand-ins need mixed-difficulty lists from the catalogue.
        if cands:
            p["lists"] = cands[0]["pointer"]["lists"]
            p["topic"] = cands[0].get("topic")
        else:
            p["links"] = "pending_catalog"


def resolve_mixed_pools(tasks):
    """Timed sections and late-plan stand-ins have no list of their own. They draw on the plan's own
    mixed-difficulty lists for every topic covered so far (decided 27 Sep 2026: hard-only
    605–705 lists can replace these in Phase 3; the app never builds a search address itself)."""
    pools = defaultdict(list)          # (qtype, week) -> [{topic, url}]
    for t in tasks:
        p = t["pointer"]
        if p.get("type") != "gmatclub_list" or not p.get("lists"):
            continue
        url = p["lists"].get("mixed") or p["lists"].get("medium")
        easy = url is None
        url = url or p["lists"].get("easy")
        qtype = p.get("qtype") or ("TPA" if "two-part" in (t.get("topic") or "") else "GT")
        if url and qtype in ("PS", "DS", "TPA", "GT"):
            pools[qtype].append({"week": t["plan_week"], "topic": t.get("topic"), "url": url, "easy": easy})

    def pool(qtypes, week):
        seen, out = set(), []
        for q in qtypes:
            for e in pools[q]:
                if e["week"] <= week and e["url"] not in seen:
                    seen.add(e["url"])
                    out.append({"topic": e["topic"], "qtype": q, "url": e["url"], "easy": e["easy"]})
        # easy-only lists are there for the first weeks; once there are harder ones, leave them out
        harder = [e for e in out if not e["easy"]]
        return [{k: v for k, v in e.items() if k != "easy"} for e in (harder if len(harder) >= 3 else out)]

    for t in tasks:
        p = t["pointer"]
        if "pending_catalog" not in str(p):
            continue
        w = t["plan_week"]
        if p["type"] == "timed_sections":           # a full mock stand-in: one timed section each
            p["sections_from"] = {"quant": pool(["PS"], w), "di": pool(["DS", "GT", "TPA"], w),
                                  "verbal": {"cr": "reserve CR sets", "rc": "3 LSAT passages"}}
        elif t["section"] == "quant":
            p["lists_pool"] = pool(["PS"], w)
        else:                                       # DI timed sets and the extra DS set
            p["lists_pool"] = pool(["DS"] if p.get("qtype") == "DS" else ["DS", "GT", "TPA"], w)
        p.pop("links", None)
        p["how"] = "Work across these lists, a few from each, questions you haven't done; timed as the real section."


DEFAULT_VIDEO_MIN = 50


def estimate(t):
    """Minutes for the task itself, and for its review later (spec: 'log now, review later')."""
    k, p = t["kind"], t["pointer"]
    n = p.get("count") or 0
    review = 0
    if k == "video":
        m, src = (t.get("est_minutes"), "stated in the plan") if t.get("est_minutes") else (DEFAULT_VIDEO_MIN, "default")
    elif k in ("article",):
        m, src = t.get("est_minutes") or 15, "default"
    elif k == "test_prep":
        m, src = t.get("est_minutes") or 10, "stated" if t.get("est_minutes") else "default"
    elif k == "rc_section":
        m, src, review = 60, "plan: ~25 questions, ~1 hr", 10
    elif k == "cr_set":
        m, src, review = 60, "plan: ~25 questions, ~1 hr", 20
    elif k == "og_set":
        per = {"PS": 2.0, "DS": 2.0, "RC": 1.9, "CR": 2.0}[p["qtype"]]
        m, src = ceil(n * per) + 5, f"{per} min a question + 5"
        review = ceil(0.3 * n * 3)
    elif k == "drill":
        m, src = 15, "plan target: under 15 minutes"
    elif k == "gmatclub_set":
        if t.get("timed"):
            m, src, review = 50, "45-minute timed section + 5", 15
        else:
            n = n or 15
            m, src = ceil(n * 2.5), "2.5 min a question (includes finding it on GMAT Club)"
            review = ceil(0.3 * n * 3)
    elif k == "di_set":
        n = n or 15
        m, src, review = ceil(n * 2.5), "2.5 min a question", ceil(0.3 * n * 3)
    elif k == "mock":
        m, src, review = 135, "spec: fixed 2 h 15 min", 15
    elif k == "admin":
        m, src = 5, "default"
    else:
        m, src = 15, "default"
    t["est_minutes"], t["est_source"], t["review_minutes"] = int(m), src, int(review)


def desk_and_bus(t):
    k, sec = t["kind"], t["section"]
    needs_desk = (sec in ("quant", "di") and k not in ("video", "article", "test_prep")) or \
        k in ("og_set", "drill", "gmatclub_set", "di_set", "mock")
    if t.get("timed") and sec == "cr":      # the timed verbal section: a sitting, not a ride
        needs_desk = True
    t["needs_desk"] = needs_desk
    t["bus_ok"] = not needs_desk and k in ("video", "article", "rc_section", "cr_set", "test_prep", "admin", "cards")
    t["offline_ok"] = k in ("rc_section", "og_set", "drill", "cards")
    # Verbal Review sets are read from the epub on the laptop and need no scratch paper, so they may
    # go on the bus. It's a switch in Settings (default on); off puts them back at the desk.
    if k == "og_set" and t["pointer"].get("book") == "vr":
        t["bus_switch"] = "verbal_review_on_bus"
        if SETTINGS_DEFAULTS["verbal_review_on_bus"]:
            t["needs_desk"], t["bus_ok"] = False, True


SETTINGS_DEFAULTS = {"verbal_review_on_bus": True}


def pieces(t):
    k, p = t["kind"], t["pointer"]
    n = p.get("count") or 0
    if k == "og_set" and n >= 16:
        if p["qtype"] == "RC" and p.get("passage_groups"):
            g = p["passage_groups"]
            half, acc, cut = n / 2, 0, 0
            for i, (a, b) in enumerate(g):
                acc += b - a + 1
                if acc >= half:
                    cut = i + 1
                    break
            first = g[:cut]
            return [{"numbers": [first[0][0], first[-1][1]]}, {"numbers": [g[cut][0], g[-1][1]]}] if cut < len(g) else None
        a, b = p["numbers"]
        mid = a + n // 2 - 1
        return [{"numbers": [a, mid]}, {"numbers": [mid + 1, b]}]
    if k == "gmatclub_set" and not t.get("timed") and n >= 20:
        return [{"count": n // 2}, {"count": n - n // 2}]
    if k == "video" and t["est_minutes"] > 40:
        return [{"at": "chapters", "fallback_every_minutes": 30}]
    return None    # LSAT RC and CR sets, timed sets and mocks are never split


def dependencies(tasks):
    by_key = defaultdict(list)
    for t in tasks:
        by_key[(t["plan_week"], t["section"], t.get("_block"))].append(t)
    first = [t for t in tasks if t.get("_first")]
    for (w, sec, blk), ts in by_key.items():
        lead = [t for t in ts if t["kind"] == "video" and t["optional"] == "core" and t.get("_seq") == 1]
        for t in ts:
            deps = []
            if lead and t is not lead[0] and t["kind"] != "video":
                deps.append(lead[0]["id"])
            t["depends_on"] = deps
    last_block = {}
    for t in tasks:
        p = t["pointer"]
        if p.get("type") == "og_block":
            q = p["qtype"]
            if q in last_block:
                t["depends_on"].append(last_block[q])
            last_block[q] = t["id"]
        if first and t is not first[0] and t["plan_week"] == 1:
            t["depends_on"].insert(0, first[0]["id"])


def run(books, rc_sections, cr_bank):
    paras = read_paragraphs()
    for w, (i, snippet) in C.WEEK_STARTS.items():
        assert snippet in paras[i]["text"], f"week {w} start moved: para {i} lacks {snippet!r}"
    for w, i, snippet, _ in C.NOT_TASKS:
        assert snippet.lower() in paras[i]["text"].lower(), f"para {i} lacks {snippet!r}"
    blocks = find_blocks(paras)
    tasks, dropped, unclassified = [], [], []
    for b in blocks:
        for seq, item in enumerate(b["items"], 1):
            ts, why = classify(item, b["week"], b["section"], b["kind"], seq)
            if why:
                (unclassified if why == "could not classify" else dropped).append(
                    {"key": f"w{b['week']:02d}.{b['section']}.{seq}", "text": plain(item["raw"])[:160], "why": why})
            for t in ts:
                t["_block"] = b["header_para"]
                t["_para"] = item["para"]
            tasks.extend(ts)
    extra = para_tasks(paras)
    for t in extra:
        t["_para"] = int(t["_key"].split("para")[1])
        t["_block"] = t["_para"]
        t["_seq"] = 0
    tasks.extend(extra)
    for a in C.ADMIN_TASKS:
        tasks.append({"plan_week": a["week"], "section": "general", "kind": "admin", "title": a["title"],
                      "detail": a["detail"], "optional": "core", "benchmark_week": a["week"],
                      "pointer": {"type": "url", "url": a["url"]} if a["url"] else {"type": "none"},
                      "decision": a["decision"], "noteboard": a.get("noteboard", False),
                      "_para": C.WEEK_STARTS[a["week"]][0] + 0.5, "_block": -1, "_seq": 0, "_key": f"admin.{a['title'][:20]}"})
    m6 = paras[C.LAST_MOCK["para"]]
    assert C.LAST_MOCK["expect"] in m6["text"]
    how, exam, title = C.MOCKS[6]
    tasks.append({"plan_week": 13, "section": "mock", "kind": "mock", "title": title, "optional": "core",
                  "benchmark_week": 13, "plan_ref": "mba.com test #6", "source_text": m6["text"],
                  "pointer": {"type": "timed_sections", "stand_in_for": "mba.com test #6",
                              "sections": ["quant", "verbal", "di"], "minutes_each": 45, "links": "pending_catalog"},
                  "_para": C.LAST_MOCK["para"], "_block": -1, "_seq": 0, "_key": "w13.mock6"})
    pr = paras[C.PRACTICE_RUN["para"]]
    assert C.PRACTICE_RUN["expect"] in pr["text"]
    tasks.append({"plan_week": 1, "section": "mock", "kind": "mock", "title": "Practice-run mock (off by default)",
                  "optional": "setting", "setting": "practice_run_week1", "benchmark_week": 1,
                  "pointer": {"type": "official_mock", "exam": 1, "practice_run": True},
                  "_para": 18, "_block": -1, "_seq": 0, "_key": "w01.practice_run"})

    # plan order: by paragraph position (week by week, section by section)
    tasks.sort(key=lambda t: (t["plan_week"], t["_para"]))

    # the same video offered twice (e.g. in both the quant and DI lists) becomes one task
    seen, deduped, dup_notes = {}, [], []
    for t in tasks:
        vid = t["pointer"].get("youtube_id")
        if vid and vid in seen:
            dup_notes.append(f"w{t['plan_week']} {t['section']}: '{t['title']}' is already a task in week {seen[vid]['plan_week']}")
            if t["optional"] == "core":
                seen[vid]["optional"] = "core"
            continue
        if vid:
            seen[vid] = t
        deduped.append(t)
    tasks = deduped

    counters = defaultdict(int)
    for t in tasks:
        counters[(t["plan_week"], t["section"])] += 1
        t["id"] = f"w{t['plan_week']:02d}-{t['section']}-{counters[(t['plan_week'], t['section'])]:02d}"

    notes, material = assign_material(tasks, books, rc_sections, cr_bank)
    for t in [t for t in tasks if t.get("_drop")]:
        dropped.append({"key": t["id"], "text": t["title"], "why": t["_drop"]})
    tasks = [t for t in tasks if not t.get("_drop")]
    resolve_week_lists(tasks)
    resolve_mixed_pools(tasks)
    for t in tasks:
        estimate(t)
        desk_and_bus(t)
        t["break_points"] = pieces(t)
        t.setdefault("target", None)
        t.setdefault("alternatives", [])
    dependencies(tasks)
    for t in tasks:
        for k in [k for k in t if k.startswith("_")]:
            t.pop(k)
    return {
        "tasks": tasks,
        "section_text": boilerplate(paras),
        "help": help_blocks(paras),
        "not_tasks": [{"week": w, "para": i, "what": s, "why": why} for w, i, s, why in C.NOT_TASKS],
        "dropped": dropped, "unclassified": unclassified, "duplicates": dup_notes,
        "assign_notes": notes, "material": material, "paragraphs": paras,
    }
