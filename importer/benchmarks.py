"""'Reading your results': one entry per plan week and section, numbers only.

Source: the spec's summary of the plan's weekly guides (the 2nd post in each week's GMAT Club
thread). The posts themselves were not opened for this import, so every number carries its
source, and the three the spec asks to double-check are listed separately.
"""

GUIDE_WEEK1 = "https://gmatclub.com/forum/gmat-ninja-study-plan-week-400295.html#p3088893"

ACCURACY = {
    "og_new_topic": {"great": [80, 90], "fine": [70, 80], "note": "lower is fine on topics not studied yet"},
    "forum_easy": {"target": [85, 90]},          # sub-555 GMAT Club sets
    "forum_hard_or_mixed": {"target": [50, 60]},
    "lsat_sets": {"target": [70, 80], "note": "similar results set to set"},
}
TIME = {
    "quant_ps": {"target_s": 120, "flag_s": 150},
    "ds": {"target_s": 120, "flag_s": 150},
    "graphs_tables_two_part": {"target_s": 150, "flag_s": 180},
    "multi_source_set": {"target_s": [420, 540]},
    "lsat_set_25": {"target_min": 60},
}
MOCK_GAP = {8: [50, 50], 9: [30, 40], 10: [20, 40], 11: [20, 30], 12: [20, 20]}


def careless_ceiling(week, section):
    if section in ("rc", "cr"):
        return None
    if week <= 2:
        return 0.05
    if section == "quant":
        return 0.03 if week < 5 else 0.02
    if section == "di":
        return 0.03 if week < 8 else 0.02
    return None


def run():
    rules = []
    for w in range(1, 14):
        for sec in ("quant", "di", "rc", "cr", "mock"):
            if sec == "mock":
                if w not in MOCK_GAP:
                    continue
                rules.append({"week": w, "section": "mock", "gap_below_665": MOCK_GAP[w],
                              "careless_per_section_max": 1, "source": "spec",
                              "guide_link": GUIDE_WEEK1 if w == 1 else None})
                continue
            if sec == "di" and w == 1:
                continue      # no DI in week 1
            r = {"week": w, "section": sec, "source": "spec", "guide_link": GUIDE_WEEK1 if w == 1 else None,
                 "careless_max_share": careless_ceiling(w, sec)}
            if sec in ("quant", "di"):
                r["accuracy"] = {"og": ACCURACY["og_new_topic"],
                                 "forum_easy": ACCURACY["forum_easy"], "forum_mixed": ACCURACY["forum_hard_or_mixed"]}
                r["time"] = {"quant": TIME["quant_ps"]} if sec == "quant" else \
                    {"ds": TIME["ds"], "graphs_tables_two_part": TIME["graphs_tables_two_part"],
                     "multi_source_set": TIME["multi_source_set"]}
                # the plan's own list level for the week: sub-555 until week 7, sub-655 from week 8
                r["forum_level"] = "sub-555" if w <= 7 else "sub-655"
            else:
                r["accuracy"] = {"lsat": ACCURACY["lsat_sets"]}
                r["time"] = {"lsat_set_25": TIME["lsat_set_25"]}
                r["passage_redo_if_missed"] = 3 if sec == "rc" else None
            rules.append(r)
    to_check = [
        {"what": "Week 8 mock gap", "value": "50 points below 665", "where": "week 8 guide"},
        {"what": "Week 8 forum-set level", "value": "sub-655 lists (the week 8 homework links say 'Sub-655 (recommended)')",
         "where": "week 8 guide"},
        {"what": "Week 11 section gap", "value": "20–30 points below 665", "where": "week 11 guide"},
    ]
    missing_links = [w for w in range(2, 14)]
    return {"rules": rules, "double_check": to_check,
            "note": "Numbers from the spec's summary table. Weeks 2–13 have no link to their guide post in the "
                    "docx ('see the next post in this thread' without a URL); the week threads' addresses are needed "
                    "for the 'Why?' links.",
            "weeks_without_guide_link": missing_links}
