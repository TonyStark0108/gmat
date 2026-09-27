"""Hand decisions for the plan import: things a parser can't know from the text.

Everything here is checked against the docx when the importer runs: each paragraph
index carries a text snippet, and the import stops if the snippet isn't there.
"""

# Where each plan week starts in the docx (week 5 has no heading of its own).
WEEK_STARTS = {
    1: (0, "Week 1 (~15 hours)"), 2: (95, "WEEK2:"), 3: (185, "Week 3 (~15 hours)"),
    4: (247, "WEEK 4:"), 5: (328, "Inspiration & Advice"), 6: (405, "Week 6 (~15 hours)"),
    7: (484, "Week 7:"), 8: (572, "Week 8 (~15 hours)"), 9: (656, "Week 9 (~15 hours)"),
    10: (748, "Week 10 (~15 hours)"), 11: (845, "Week 11 (~15 hours)"),
    12: (940, "Week 12 (7-15 hours)"), 13: (1013, "Week 13 (4-10 hours)"),
}

# Paragraphs outside the homework lists that still hold plan tasks.
# mode "links": one task per link (minus skip); "numbered"/"bullets": parsed like a homework list.
PARA_TASKS = [
    dict(week=1, para=6, expect="how best to use it", section="general", kind="video", mode="links",
         title="How to use the study plan", minutes=20, first=True),
    dict(week=1, para=27, expect="why 3 = 20", section="general", kind="video", mode="links", minutes=2),
    dict(week=1, para=33, expect="time management", section="quant", kind="video", mode="alternatives",
         title="Why careless errors cost so much", minutes=6),
    dict(week=1, para=93, expect="charming Aussie", section="general", kind="article", mode="alternatives",
         title="A 430 to 710 debrief"),
    dict(week=2, para=98, expect="souvik101990", section="general", kind="article", mode="links",
         skip=["memberlist.php"]),
    dict(week=2, para=169, expect="youtu.be/gpe_5Tbm3yY", section="general", kind="video", mode="links",
         title="Week 2 plan preview"),
    dict(week=2, para=182, expect="test anxiety", section="general", kind="test_prep", mode="numbered"),
    dict(week=4, para=250, expect="PyjamaScientist", section="general", kind="article", mode="links",
         skip=["memberlist.php"]),
    dict(week=4, para=253, expect="close the gap", section="general", kind="test_prep", mode="bullets"),
    dict(week=4, para=254, expect="exercise", section="general", kind="test_prep", mode="bullets"),
    dict(week=4, para=255, expect="nutrition", section="general", kind="test_prep", mode="bullets"),
    dict(week=5, para=329, expect="Vinayak", section="general", kind="article", mode="links"),
    dict(week=6, para=407, expect="How NOT to Study", section="general", kind="article", mode="links",
         skip=["memberlist.php"]),
    dict(week=7, para=486, expect="spirituality", section="general", kind="article", mode="links"),
    dict(week=7, para=489, expect="official GMAT practice exams", section="mock", kind="video", mode="bullets"),
    dict(week=8, para=575, expect="what NOT to do", section="general", kind="article", mode="links"),
    dict(week=8, para=578, expect="test-day routine", section="mock", kind="video", mode="bullets"),
    dict(week=9, para=659, expect="pnishant", section="general", kind="article", mode="links",
         skip=["memberlist.php"]),
    dict(week=10, para=754, expect="Read the full story", section="general", kind="article", mode="links"),
    dict(week=11, para=848, expect="22-year-old self", section="general", kind="article", mode="links"),
    dict(week=11, para=851, expect="two weeks before", section="mock", kind="test_prep", mode="bullets"),
    dict(week=12, para=943, expect="never gotten nervous", section="general", kind="test_prep", mode="links"),
    dict(week=12, para=944, expect="sunglasses", section="general", kind="test_prep", mode="bullets"),
    dict(week=12, para=945, expect="push himself away", section="general", kind="test_prep", mode="bullets"),
    dict(week=12, para=946, expect="couldn’t sleep", section="general", kind="test_prep", mode="bullets"),
    dict(week=12, para=950, expect="12-minute workout", section="general", kind="test_prep", mode="links",
         skip=["trainandable.net"], minutes=12),
    dict(week=13, para=1015, expect="Mr. Fat Pants", section="general", kind="article", mode="links"),
]

# Plan paragraphs that are deliberately not tasks, with the reason (shown in the report).
NOT_TASKS = [
    (1, 8, "Official Guide 2024-2025 bundle", "You own the OG (your friend's print copy + the PDF)."),
    (1, 9, "official LSAT book", "Replaced by your 116 RC passages and the CR spreadsheet."),
    (1, 10, "error log", "The app is the error log."),
    (1, 13, "Official mba.com practice questions", "Paid; the plan's uses of it get free stand-ins."),
    (1, 14, "GMAT Club tests", "Paid; replaced by timed GMAT Club sets."),
    (1, 15, "Forum Quiz", "Decision D8: free first. No card until you hit its daily limit."),
    (1, 23, "score report", "You haven't sat the GMAT, so there's no score report to read."),
    (1, 25, "how many points", "The app does this from your homework results."),
]

# Tasks the plan implies that the app adds as admin cards (spec: Purchase / admin, Noteboard).
# (The DI Review purchase card is gone: all three review books are now in the library.)
ADMIN_TASKS = [
    dict(week=6, section="general", title="Practise on a noteboard",
         detail="At the test centre you work on an erasable noteboard with a marker, not paper. "
                "A laminated A4 sheet and a fine dry-erase marker is enough.",
         url=None, decision=None, source_para=(1, 16), noteboard=True),
    dict(week=7, section="general", title="Decide on Official Practice Exams 3–6 (about $110)",
         detail="Two official exams are free. Exams 3–6 give the later weeks real full-length mocks; "
                "until then those weeks use timed sections built from GMAT Club lists.",
         url="https://www.mba.com/exam-prep/gmat-practice-exams-3-6", decision="D14", source_para=(1, 12)),
]

# Week 1's baseline mock: skipped by default (spec, "The starting line"); a setup switch turns it on.
PRACTICE_RUN = dict(week=1, para=18, expect="take mba.com test #1")
# Week 13's practice test is a bullet under its section heading rather than a numbered list.
LAST_MOCK = dict(week=13, para=1017, expect="Full mba.com test #6")

# How the plan's six mba.com exams map to what you have (spec: Material you don't have).
MOCKS = {
    1: ("official", 1, "Official Practice Exam 1, fresh"),
    2: ("sections", None, "Timed full sections (Exam 2 is kept for plan week 11)"),
    3: ("sections", None, "Timed full sections"),
    4: ("official", 2, "Official Practice Exam 2, fresh"),
    5: ("sections", None, "Timed full sections"),
    6: ("sections", None, "Timed full sections"),
}

# Item-level decisions, keyed "w<week>.<section>.<n>" (n = position in the list, from 1).
OVERRIDES = {
    # "Watch one (not both!)": the single older video is an hour; option A is two.
    "w05.quant.1": {"choose": "Option B"},
    # "(Very optional) Do 15-20 CR from older editions of the OGs" etc. stay tasks (spec: all optional
    # items are normal tasks); counts below where the text gives a range.
    "w13.rc.1": {"note": "Nothing may be left: your edition's RC runs out in the 6th set."},
}

DROP_PATTERNS = [
    (r"only if you[’']re (certain|sure|100% certain)", "Open-ended extra sets; the app's weekly extra-practice chip does this."),
]
