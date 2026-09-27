"""LSAT RC bank: 29 sections, 116 passages, 780 questions.

The answer letter is hidden at the end of choice (D), in full-width brackets
('（B）') in this file, so the key regex accepts both bracket styles.
"""
import json
import re
import shutil
import subprocess

import config

KEY_AT_END = re.compile(r"\s*[（(]\s*([A-E])\s*[）)]\s*$")
QUESTION = re.compile(r"^(\d+)\.\t(.*)$")
CHOICE = re.compile(r"^\(([A-E])\)\s?(.*)$")
SECTION_HEAD = re.compile(r"LSAT\s*(\d+)\s*SECTION\s*([IVX]+)")
TIME_LINE = re.compile(r"^Time 35 minutes\s*(\d+)\s*Questions", re.M)

# Glosses someone typed into the passages, e.g. "(revolving door: n.十字形旋转门)".
CJK = re.compile(r"[　-鿿＀-￯]")
PAREN = re.compile(r"\s?\(([^()]{1,160})\)")


def convert_doc_to_text() -> str:
    out = config.WORK_DIR / "rc_raw.txt"
    if out.exists():
        return out.read_text(encoding="utf-8-sig")
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    if shutil.which("soffice"):
        subprocess.run(["soffice", "--headless", "--convert-to", "txt:Text (encoded):UTF8",
                        "--outdir", str(config.WORK_DIR), str(config.RC_DOC)], check=True)
        (config.WORK_DIR / (config.RC_DOC.stem + ".txt")).rename(out)
    else:
        # No LibreOffice on this laptop; Word does the same conversion (65001 = UTF-8).
        ps = (
            "$w = New-Object -ComObject Word.Application; $w.Visible = $false; "
            f"$d = $w.Documents.Open('{config.RC_DOC}', $false, $true); "
            f"$d.SaveAs2('{out}', 7, $false, '', $false, '', $false, $false, $false, $false, $false, 65001); "
            "$d.Close($false); $w.Quit()"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    return out.read_text(encoding="utf-8-sig")


APPENDIX_HEAD = re.compile(r"\n(LSAT\s*\d+\s*SECTION\s*[IVX]+)\n1\. ")
LINE_REF = re.compile(r"\blines? \d+")


def split_appendix(text: str):
    """The file ends with a plain answer key per section; use it to cross-check the hidden keys."""
    m = APPENDIX_HEAD.search(text)
    if not m:
        return text, []
    body, tail = text[:m.start()], text[m.start():]
    keys = []
    for block in re.split(r"\n(?=LSAT\s*\d+\s*SECTION)", tail.strip()):
        head, *rows = block.split("\n")
        answers = {}
        for r in rows:
            mm = re.match(r"^(\d+)\.\s*(\S*)", r.strip())
            if mm and mm.group(2):
                answers[int(mm.group(1))] = mm.group(2)
        keys.append((" ".join(head.split()), answers))
    return body, keys


_DECISIONS = json.loads((config.PROJECT / "importer" / "curation" / "rc_glosses.json").read_text(encoding="utf-8"))
GLOSS_REMOVE = {g[1:-1] for g in _DECISIONS["remove"]}
GLOSS_KEEP = {g[1:-1] for g in _DECISIONS["keep"]}


def is_gloss(inner: str) -> bool:
    """A parenthetical that reads like a dictionary note rather than the author's text."""
    if inner in GLOSS_REMOVE:
        return True
    if inner in GLOSS_KEEP:
        return False
    if CJK.search(inner):
        return True
    if LINE_REF.search(inner):
        return False
    s = inner.strip()
    if re.fullmatch(r"[A-Z]{3,}(,\s*[A-Z]{3,})+", s):                 # "(SIGNIFY, MEAN)"
        return True
    return bool(re.match(r"^[\w\s'\-]+:\s*(n|v|adj|adv)\.", s)) or \
        bool(re.search(r"\b(also|syn|esp|specifically)\s*:", s)) or \
        bool(re.search(r":\s*[A-Z]{3,}\b", s)) or \
        bool(re.match(r"^:?\s*a:\s.*\bb:\s", s)) or \
        bool(re.search(r'"[^"]+"$', s)) or \
        bool(re.match(r"^to [a-z]+\b", s) and len(s.split()) >= 3)


def maybe_gloss(inner: str) -> bool:
    """Left in the passage, but listed in the report in case it is a note too."""
    if inner in GLOSS_KEEP:
        return False
    return bool(re.match(r"^(a|an|the|of|having|being|one who|the act of|marked by|capable of)\b", inner)
                and len(inner.split()) >= 3 and not re.search(r"\d", inner))


QTYPE_RULES = [
    ("main idea", r"main (point|idea)|central (idea|point|thesis)|best (summarizes|expresses|describes) the (content|passage|main)|most accurately (states|expresses|summarizes|describes) the (main|central|passage)|title"),
    ("purpose", r"primary purpose|in order to|serves? (primarily )?to|function of|purpose of|mainly concerned with|primarily concerned with|organization of the passage|role (played|of)|author (mentions|refers|discusses|cites|introduces).{0,60}(most likely|primarily) (to|in order)"),
    ("author's attitude", r"attitude|tone|author'?s? (view|position|stance)|regards?\b.{0,30}with|skeptic|approv|the author would (most likely|be most likely to) (describe|characterize)"),
    ("inference", r"infer|suggest|impl(y|ies|ied)|most likely|would (most likely |be most likely to |probably )?agree|"
                  r"passage supports|most strongly supported|can be concluded|analog|would be considered|consistent with|"
                  r"would (most|least) (likely )?(weaken|strengthen)"),
    ("detail", r"according to the passage|the passage (states|mentions|indicates|asserts|identifies|provides information)|(stated|mentioned|asserted|explicitly|cites)|which one of the following is (stated|mentioned|given)|the author (states|mentions|asserts|claims)|refers to"),
]


def question_type(stem: str) -> str:
    s = stem.lower()
    for name, pat in QTYPE_RULES:
        if re.search(pat, s):
            return name
    return "inference"


TOPIC_WORDS = {
    "law": r"\blaw(s|yer|yers)?\b|legal|court|judge|judicial|statut|constitution|legislat|attorney|jurisdiction|contract|"
           r"plaintiff|defendant|jur(y|ies|or)|litigat|copyright|patent|tribunal|rights\b|justice|extradit|treaty|prosecut|crime|criminal",
    "science": r"species|\bcells?\b|gene|genetic|molecul|chemi|physic|biolog|scientist|experiment|climate|planet|evolution|"
               r"geolog|protein|bacteri|organism|fossil|astronom|ecolog|neuro|virus|enzyme|atmospher|mathemat|laboratory|hypothes|asteroid|mantle",
    "social science": r"econom|market|societ|social|anthropolog|politic|psycholog|labor|immigra|class\b|income|population|"
                      r"histor(y|ian)|government|women|ethnic|sociolog|cultur|tribe|colonial|industr|worker|wage|emotion",
    "humanities": r"\bart\b|artist|novel|poe(t|m|try)|literat|music|paint|philosoph|aesthetic|film|fiction|drama|theater|"
                  r"theatre|writer|author of|critic|sculpt|architect|dance|jazz|composer|essay|narrat",
}
TOPICS = list(TOPIC_WORDS)


def topic_scores(text: str):
    t = text.lower()
    return {k: len(re.findall(p, t)) for k, p in TOPIC_WORDS.items()}


def label_topics(passages):
    """LSAT sections usually carry one passage of each kind. Use that pattern when the keyword
    evidence roughly agrees with it; otherwise take each passage's own best match."""
    from itertools import permutations
    scores = [topic_scores(" ".join(p["paragraphs"])) for p in passages]
    share = [{k: v / max(sum(s.values()), 1) for k, v in s.items()} for s in scores]
    own = [max(TOPICS, key=lambda k: s[k]) for s in share]
    own_total = sum(s[k] for s, k in zip(share, own))
    best = None
    if len(passages) == 4:
        for perm in permutations(TOPICS):
            total = sum(s[k] for s, k in zip(share, perm))
            if best is None or total > best[0]:
                best = (total, perm)
    use_pattern = best is not None and best[0] >= 0.7 * own_total
    for p, s, o, k in zip(passages, share, own, best[1] if use_pattern else own):
        p["topic"] = k
        p["topic_confidence"] = "high" if (k == o and s[k] >= 0.5) else "medium" if s[k] >= 0.25 else "low"


def parse(text: str):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text, appendix = split_appendix(text)
    starts = [m.start() for m in TIME_LINE.finditer(text)]
    assert len(starts) == 29, f"expected 29 'Time 35 minutes' markers, found {len(starts)}"
    sections, issues, glosses, key_examples = [], [], [], []
    for si, st in enumerate(starts):
        end = starts[si + 1] if si + 1 < len(starts) else len(text)
        head_zone = text[max(0, st - 200):st]
        heads = SECTION_HEAD.findall(head_zone)
        src = f"LSAT {heads[-1][0]} SECTION {heads[-1][1]}" if heads else f"section {si + 1}"
        chunk = text[st:end]
        declared = int(TIME_LINE.match(chunk).group(1))
        # drop the trailing header of the next section, and the directions paragraph
        chunk = SECTION_HEAD.split(chunk)[0] if si + 1 < len(starts) else chunk
        lines = chunk.split("\n")[1:]
        if lines and lines[0].startswith("Directions:"):
            lines = lines[1:]

        passages, cur_p, cur_q = [], None, None
        for raw in lines:
            line = raw.rstrip()
            if not line.strip():
                continue
            if SECTION_HEAD.search(line) and len(line) < 40:
                continue
            mq, mc = QUESTION.match(line), CHOICE.match(line)
            if mq and cur_p is not None:
                cur_q = {"n": int(mq.group(1)), "stem": mq.group(2).strip(), "choices": {}}
                cur_p["questions"].append(cur_q)
            elif mc and cur_q is not None:
                cur_q["choices"][mc.group(1)] = mc.group(2).strip()
            elif cur_q is not None and len(cur_q["choices"]) < 5:
                # wrapped stem or choice
                if cur_q["choices"]:
                    last = sorted(cur_q["choices"])[-1]
                    cur_q["choices"][last] += " " + line.strip()
                else:
                    cur_q["stem"] += " " + line.strip()
            else:
                if cur_p is None or cur_p["questions"]:
                    cur_p = {"paragraphs": [], "questions": []}
                    passages.append(cur_p)
                    cur_q = None
                cur_p["paragraphs"].append(line.strip())

        count = 0
        for pi, p in enumerate(passages):
            p["id"] = f"rc{si + 1:02d}p{pi + 1}"
            # A numbered stem with no choices at all (LSAT 2002 #24, "N/A" in the appendix key)
            # is a withdrawn question; it can't be answered, so it doesn't go in the bank.
            dropped = [q for q in p["questions"] if not q["choices"]]
            for q in dropped:
                issues.append(f"{p['id']}q{q['n']}: stem with no answer choices, dropped "
                              f"(appendix key says N/A): {q['stem'][:70]!r}")
            p["questions"] = [q for q in p["questions"] if q["choices"]]

            def clean(s, where):
                def strip(m):
                    inner = m.group(1)
                    if is_gloss(inner):
                        glosses.append({"where": where, "gloss": f"({inner})", "removed": True})
                        return ""
                    if maybe_gloss(inner):
                        glosses.append({"where": where, "gloss": f"({inner})", "removed": False})
                    return m.group(0)
                return PAREN.sub(strip, s)

            clean_pars = [clean(par, p["id"]) for par in p["paragraphs"]]
            p["paragraphs"] = clean_pars
            for q in p["questions"]:
                count += 1
                q["id"] = f"{p['id']}q{q['n']}"
                d = q["choices"].get("D", "")
                m = KEY_AT_END.search(d)
                if not m:
                    issues.append(f"{q['id']}: no hidden key at the end of (D): {d[-60:]!r}")
                    q["answer"] = None
                else:
                    q["answer"] = m.group(1)
                    before = d
                    q["choices"]["D"] = KEY_AT_END.sub("", d)
                    key_examples.append({"id": q["id"], "before": before, "after": q["choices"]["D"], "key": q["answer"]})
                if sorted(q["choices"]) != list("ABCDE"):
                    issues.append(f"{q['id']}: choices found {sorted(q['choices'])}")
                q["stem"] = clean(q["stem"], q["id"])
                q["choices"] = {k: clean(v, q["id"]) for k, v in q["choices"].items()}
                q["line_ref"] = bool(LINE_REF.search(q["stem"]))
                q["type"] = question_type(q["stem"])
        label_topics(passages)
        seq = [q["n"] for p in passages for q in p["questions"]]
        gaps = sorted(set(range(1, max(seq) + 1)) - set(seq))
        if len(set(seq)) != len(seq) or seq != sorted(seq):
            issues.append(f"rc{si + 1:02d}: question numbers out of order: {seq}")
        sections.append({"id": f"rc{si + 1:02d}", "source": src, "declared_questions": declared,
                         "question_count": count, "skipped_numbers": gaps, "passages": passages})

    # Cross-check against the appendix key. The "Time 35 minutes NN Questions" headers are
    # not reliable (several say 26 where the section has 27), so the appendix is the check.
    crosscheck = {"compared": 0, "agree": 0, "disagree": [], "appendix_blank": []}
    by_src = {" ".join(s["source"].split()): s for s in sections}
    for head, answers in appendix:
        s = by_src.get(head)
        if not s:
            issues.append(f"appendix block '{head}' matches no section")
            continue
        for p in s["passages"]:
            for q in p["questions"]:
                a = answers.get(q["n"])
                if a is None or a not in "ABCDE":
                    crosscheck["appendix_blank"].append(f"{q['id']} (appendix: {a!r}, hidden key: {q['answer']})")
                    continue
                crosscheck["compared"] += 1
                if a == q["answer"]:
                    crosscheck["agree"] += 1
                else:
                    crosscheck["disagree"].append(f"{q['id']}: hidden key {q['answer']}, appendix {a}")
        extra = sorted(set(answers) - {q["n"] for p in s["passages"] for q in p["questions"]})
        if extra:
            issues.append(f"{s['id']}: appendix has answers for questions not in the section: {extra}")
    return sections, issues, glosses, key_examples, crosscheck


LINE_SPAN = re.compile(r"\blines? (\d+)(?:\s*(?:-|–|and|through)\s*(\d+))?")
QUOTED = re.compile(r"[\"“]([^\"”]{4,120})[\"”]")


def wrap_lines(paragraphs, width):
    """Greedy word-wrap, continuous line numbers across paragraphs, like the printed LSAT.
    Returns a list of (paragraph index, start char, end char) per line."""
    out = []
    for pi, par in enumerate(paragraphs):
        pos, line_start, line_len = 0, 0, 0
        for m in re.finditer(r"\S+", par):
            w = len(m.group(0))
            if line_len and line_len + 1 + w > width:
                out.append((pi, line_start, pos))
                line_start, line_len = m.start(), 0
            line_len += (1 if line_len else 0) + w
            pos = m.end()
        out.append((pi, line_start, pos))
    return out


def locate(paragraphs, phrase):
    norm = lambda s: re.sub(r"\W+", " ", s).lower().strip()
    target = norm(phrase)
    for pi, par in enumerate(paragraphs):
        i = norm(par).find(target)
        if i >= 0:
            # map back approximately: position in normalised text ~ position in original
            return pi, int(i * len(par) / max(len(norm(par)), 1))
    return None


def calibrate_line_width(sections):
    """Pick the wrap width at which quoted phrases land on the lines the questions cite."""
    samples = []
    for s in sections:
        for p in s["passages"]:
            for q in p["questions"]:
                m, qm = LINE_SPAN.search(q["stem"]), QUOTED.search(q["stem"])
                if m and qm:
                    loc = locate(p["paragraphs"], qm.group(1))
                    if loc:
                        a = int(m.group(1)); b = int(m.group(2) or a)
                        samples.append((p, loc, a, b))
    best = None
    for width in range(40, 91):
        cache, err, hits = {}, 0, 0
        for p, (pi, ci), a, b in samples:
            lines = cache.setdefault(p["id"], wrap_lines(p["paragraphs"], width))
            ln = next(i + 1 for i, (lpi, st, en) in enumerate(lines) if lpi == pi and st <= ci <= en)
            d = 0 if a <= ln <= b else min(abs(ln - a), abs(ln - b))
            err += d; hits += d <= 1
        if best is None or err < best[1]:
            best = (width, err, hits, len(samples))
    return best


def sentence_around(par, pos):
    starts = [0] + [m.end() for m in re.finditer(r"[.!?][\"”)]?\s+", par) if m.end() <= pos]
    st = starts[-1]
    m = re.search(r"[.!?][\"”)]?(\s|$)", par[pos:])
    return st, (pos + m.end() if m else len(par))


def attach_line_spans(sections, width):
    """The printed line numbers are gone, so the reader highlights text instead:
    exact when the question quotes a phrase, approximate (a wider window) when it doesn't."""
    for s in sections:
        for p in s["passages"]:
            lines = wrap_lines(p["paragraphs"], width)
            for q in p["questions"]:
                m = LINE_SPAN.search(q["stem"])
                if not m:
                    continue
                qm = QUOTED.search(q["stem"])
                loc = locate(p["paragraphs"], qm.group(1)) if qm else None
                if loc:
                    pi, ci = loc
                    st, en = sentence_around(p["paragraphs"][pi], ci)
                    q["line_span"] = {"exact": True, "spans": [{"paragraph": pi, "start": st, "end": en}]}
                    continue
                a = int(m.group(1)); b = int(m.group(2) or a)
                if a < 1 or a > len(lines):
                    q["line_span"] = None
                    continue
                a2, b2 = max(1, a - 2), min(len(lines), b + 2)
                q["line_span"] = {"exact": False, "spans": [{"paragraph": pi, "start": st, "end": en}
                                                            for pi, st, en in lines[a2 - 1:b2]]}


def run():
    text = convert_doc_to_text()
    sections, issues, glosses, key_examples, crosscheck = parse(text)
    n_pass = sum(len(s["passages"]) for s in sections)
    n_q = sum(s["question_count"] for s in sections)
    allq = [q for s in sections for p in s["passages"] for q in p["questions"]]
    keyed = sum(1 for q in allq if q["answer"])
    assert (len(sections), n_pass, n_q) == (29, 116, 780), f"RC counts off: {len(sections)}/{n_pass}/{n_q}"
    assert keyed == 780, f"only {keyed} of 780 hidden keys found"
    width, err, hits, n = calibrate_line_width(sections)
    attach_line_spans(sections, width)
    lr = [q for s in sections for p in s["passages"] for q in p["questions"] if q["line_ref"]]
    crosscheck["line_refs"] = {
        "questions": len(lr),
        "exact_quote_highlight": sum(1 for q in lr if q.get("line_span") and q["line_span"]["exact"]),
        "approximate_window": sum(1 for q in lr if q.get("line_span") and not q["line_span"]["exact"]),
        "none": sum(1 for q in lr if not q.get("line_span")),
        "rebuilt_width": width, "rebuilt_within_one_line": f"{hits}/{n}"}
    stats = {"sections": len(sections), "passages": n_pass, "questions": n_q, "keys_found": keyed,
             "glosses_removed": sum(g["removed"] for g in glosses),
             "glosses_left_in_for_review": sum(not g["removed"] for g in glosses), "line_ref_questions": sum(q["line_ref"] for q in allq)}
    return sections, stats, issues, glosses, key_examples, crosscheck
