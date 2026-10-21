// Bringing things back: the topic deck, new cards from each day's work, worth another look, your error
// log from memory, the week's recap, fresh-question checks, where each topic stands, and coverage.

import { describe, expect, it } from "vitest";
import { buildModel, upkeep } from "../src/core/model";
import { standingOf } from "../src/core/mastery";
import { closeRemedies, coverage, firstWeeks, offerToday, recallGroups, recallSpecs, NEW_PER_DAY, OFFER_PAUSE_AT } from "../src/core/recall";
import { CORE_TOPICS, TOPIC_DECK, deckFor } from "../src/core/topicDeck";
import { topupOffers, topupHistory } from "../src/core/adapt";
import type { TopicStat } from "../src/core/adapt";
import { fixtureContent, Log } from "./fixture";
import { realContent, task } from "./helpers";

const C = fixtureContent();
const setup = () => new Log().at("2026-11-20T10:00", { type: "setup.done" });
const at = (log: Log, when: string) => buildModel(C, log.events, new Date(when));

/** Saturday 5 Dec: the OG block of six. 1 B (wrong), 2 B, 3 Cs (right, unsure), 4 A (wrong), 5 E, 6 A. */
function loggedSet(log = setup()) {
  return log
    .at("2026-12-05T10:05", { type: "piece.started", piece: "og1#0", mode: "desk" })
    .grid("2026-12-05T10:10", "og1#0", 1, ["b", "b", "cs", "a", "e", "a"])
    .at("2026-12-05T10:30", { type: "piece.submitted", piece: "og1#0", wrongOrUnsure: 3, answered: 6 })
    .at("2026-12-05T10:30", { type: "piece.done", piece: "og1#0" });
}
const attempt = (log: Log, when: string, q: number, value: string, kind: "retry" | "mixed" | "recall" = "mixed", review = "mixed:x") =>
  log.at(when, { type: "review.answer", review, item: `og1|${q}`, attempt: kind, value });

/** Run the app's own records (the day's offer of new cards, extras) as the app would on opening. */
function settle(log: Log, when: string) {
  for (let i = 0; i < 6; i++) {
    const out = upkeep(at(log, when));
    if (!out.length) break;
    for (const e of out) log.at(when, e);
  }
  return at(log, when);
}

const BANNED = /\b(behind|overdue|failed|missed|broken|late|reset|should|must|still|only)\b|you haven't/i;

describe("the rules-and-traps deck", () => {
  it("every topic the plan teaches has cards, ids are unique, and the copy keeps the tone rules", () => {
    for (const t of CORE_TOPICS) expect(deckFor(t).length + (t === "cr" ? TOPIC_DECK.filter((c) => c.key.startsWith("cr:")).length : 0), t).toBeGreaterThanOrEqual(3);
    expect(new Set(TOPIC_DECK.map((c) => c.id)).size).toBe(TOPIC_DECK.length);
    for (const c of TOPIC_DECK) expect(`${c.front} ${c.back}`, c.id).not.toMatch(BANNED);
    expect(TOPIC_DECK.length).toBeGreaterThan(150);
  });

  it.skipIf(!realContent())("every topic comes up somewhere in the real plan, so none is left without its turn", () => {
    const R = realContent()!;
    const m = buildModel(R, setup().events, new Date("2026-12-07T08:00"));
    const weeks = firstWeeks(R, m.plan);
    for (const t of CORE_TOPICS) expect(weeks.get(t), t).toBeTruthy();
  });
});

describe("new cards from each day's work", () => {
  it("a topic you worked on today offers its cards, a few a day; keep one, skip one, the rest are kept the day after next", () => {
    const log = loggedSet();
    let m = settle(log, "2026-12-05T11:00");
    expect(m.d.offered.size).toBe(NEW_PER_DAY);
    expect(m.sugg.pending.length).toBe(NEW_PER_DAY);
    expect(m.sugg.pending.every((s) => s.key === "percents" || s.key === "statistics")).toBe(true);
    const [a, b] = m.sugg.pending;
    log.at("2026-12-05T11:05", { type: "card.kept", card: a.id, keep: true }).at("2026-12-05T11:05", { type: "card.kept", card: b.id, keep: false });
    m = at(log, "2026-12-05T11:10");
    expect(m.cards.some((c) => c.id === a.id && c.source === "topic")).toBe(true);
    expect(m.cards.some((c) => c.id === b.id)).toBe(false);
    // two days later, the untouched ones from Saturday are in your cards
    m = at(log, "2026-12-07T19:00");
    expect(m.cards.filter((c) => c.source === "topic").length).toBe(NEW_PER_DAY - 1);
    // and the next day offers the next few, once
    const sun = settle(log, "2026-12-06T19:00");
    expect(sun.d.offerDays.has("2026-12-06")).toBe(true);
    expect(upkeep(sun).some((e) => e.type === "cards.offered")).toBe(false);
  });

  it("nothing new is offered while more than 30 cards are due", () => {
    const m = at(loggedSet(), "2026-12-05T11:00");
    expect(offerToday(m.sugg, m.d, m.today, OFFER_PAUSE_AT + 1)).toEqual([]);
    expect(offerToday(m.sugg, m.d, m.today, 0)!.length).toBe(NEW_PER_DAY);
  });

  it("a concept mistake tagged without a line gets its own card; a careless one, or one with your own line, doesn't", () => {
    const log = loggedSet()
      .at("2026-12-07T07:50", { type: "review.tag", item: "og1|1", tag: "concept" })
      .at("2026-12-07T07:50", { type: "review.tag", item: "og1|4", tag: "careless" });
    const m = at(log, "2026-12-07T08:00");
    const all = [...m.sugg.pending, ...m.sugg.waiting, ...m.sugg.kept];
    const e1 = all.find((s) => s.id === "err:og1|1")!;
    expect(e1.front).toMatch(/question 1\. What gets it right\?/);
    expect(e1.back).toMatch(/You put B; the answer is A/);
    expect(all.some((s) => s.id === "err:og1|4")).toBe(false);
    // the careless routine is a card of its own, from the first careless tag
    expect(all.some((s) => s.key === "tag:careless")).toBe(true);
    const withLine = at(loggedSet().at("2026-12-07T07:50", { type: "review.tag", item: "og1|1", tag: "concept", line: "find the base first" }), "2026-12-07T08:00");
    expect([...withLine.sugg.pending, ...withLine.sugg.waiting].some((s) => s.id === "err:og1|1")).toBe(false);
  });
});

describe("worth another look", () => {
  it("a starred right one comes back a week later, then two weeks after a clean go, then it's off the list", () => {
    const log = loggedSet().at("2026-12-05T10:31", { type: "look", item: "og1|2", on: true });
    let it2 = at(log, "2026-12-06T10:00").reviews.items.get("og1|2")!;
    expect(it2.state).toBe("look");
    expect(it2.dueFrom).toBe("2026-12-12");
    attempt(log, "2026-12-12T10:00", 2, "B");
    it2 = at(log, "2026-12-12T11:00").reviews.items.get("og1|2")!;
    expect([it2.state, it2.dueFrom]).toEqual(["look", "2026-12-26"]);
    attempt(log, "2026-12-26T10:00", 2, "B");
    expect(at(log, "2026-12-26T11:00").reviews.items.get("og1|2")!.state).toBe("looked");
  });

  it("wrong on another look: it becomes a mistake like any other, and the review asks why", () => {
    const log = attempt(loggedSet().at("2026-12-05T10:31", { type: "look", item: "og1|2", on: true }), "2026-12-12T10:00", 2, "D");
    const it2 = at(log, "2026-12-12T11:00").reviews.items.get("og1|2")!;
    expect([it2.state, it2.entered, it2.needsTag, it2.dueFrom]).toEqual(["redo", true, true, "2026-12-13"]);
  });

  it("right and sure but slow (over 2:30 on quant) is flagged on its own; unstarring takes it off", () => {
    const log = setup()
      .at("2026-12-05T10:05", { type: "piece.started", piece: "og1#0", mode: "desk" })
      .at("2026-12-05T10:06", { type: "answer", piece: "og1#0", q: 1, value: "A", unsure: false, sinceStartMs: 60_000 })
      .at("2026-12-05T10:10", { type: "answer", piece: "og1#0", q: 2, value: "B", unsure: false, sinceStartMs: 60_000 + 200_000 })
      .at("2026-12-05T10:30", { type: "piece.submitted", piece: "og1#0", wrongOrUnsure: 0, answered: 2 })
      .at("2026-12-05T10:30", { type: "piece.done", piece: "og1#0" });
    const m = at(log, "2026-12-06T10:00");
    expect(m.reviews.items.get("og1|2")!.look).toBe("slow");
    expect(m.reviews.items.get("og1|1")!.state).toBe("fine");
    expect(m.reviews.look).toBe(1);
    log.at("2026-12-06T10:01", { type: "look", item: "og1|2", on: false });
    expect(at(log, "2026-12-06T10:02").reviews.items.get("og1|2")!.state).toBe("fine");
  });

  it("a retired one you star again comes back for a look, and stays counted as retired", () => {
    const log = attempt(attempt(loggedSet(), "2026-12-08T07:50", 1, "A", "retry", "set:og1"), "2026-12-22T07:50", 1, "A");
    expect(at(log, "2026-12-22T08:00").reviews.items.get("og1|1")!.state).toBe("retired");
    log.at("2026-12-23T09:00", { type: "look", item: "og1|1", on: true });
    const m = at(log, "2026-12-23T10:00");
    expect(m.reviews.items.get("og1|1")!.state).toBe("look");
    expect(m.reviews.retired).toBe(1);
  });
});

describe("your error log, from memory", () => {
  it("goes inside it are practice: they never move the redo ladder", () => {
    const log = attempt(loggedSet(), "2026-12-08T07:50", 1, "A", "retry", "set:og1");
    const before = at(log, "2026-12-08T08:00").reviews.items.get("og1|1")!;
    attempt(log, "2026-12-10T19:00", 1, "C", "recall", "recall:x");
    const after = at(log, "2026-12-10T19:10").reviews.items.get("og1|1")!;
    expect([after.state, after.dueFrom, after.misses]).toEqual([before.state, before.dueFrom, before.misses]);
  });

  it("never offers a question still waiting for its blind retry", () => {
    const m = at(loggedSet(), "2026-12-06T10:00");
    const gs = recallGroups(m.reviews, m.d, m.today, { online: true, bus: false });
    expect(gs.length).toBeGreaterThan(0);
    expect(gs.flatMap((g) => g.questions)).toEqual([]);
  });

  it("comes once a week from Thursday when three or more groups are open, with questions to try again", () => {
    // three groups: wrong (concept), wrong (process), right-but-unsure, all past their blind retry
    const log = loggedSet()
      .at("2026-12-07T08:00", { type: "week.built", week: "2026-12-07", chips: [{ pieceId: "rc1#0", budget: "bus", carried: false }], mockDay: null, key: "x" });
    // right on the blind retry: they're returning (two weeks out), so they're free to try again from memory
    attempt(log, "2026-12-08T07:50", 1, "A", "retry", "set:og1");
    attempt(log, "2026-12-08T07:51", 3, "C", "retry", "set:og1");
    attempt(log, "2026-12-08T07:52", 4, "D", "retry", "set:og1");
    log.at("2026-12-08T07:55", { type: "review.tag", item: "og1|1", tag: "concept" }).at("2026-12-08T07:55", { type: "review.tag", item: "og1|4", tag: "process" })
      .at("2026-12-08T07:56", { type: "review.done", review: "set:og1" });
    expect(recallSpecs(at(log, "2026-12-09T19:00")).some((x) => x.kind === "recall")).toBe(false);   // Wednesday
    const thu = recallSpecs(at(log, "2026-12-10T19:00"));
    const r = thu.find((x) => x.id === "recall:2026-12-07")!;
    expect(r.open).toEqual({ type: "recall", bus: false });                                          // quant: it needs a desk
    const ids = recallGroups(at(log, "2026-12-10T19:00").reviews, at(log, "2026-12-10T19:00").d, "2026-12-10", { online: true, bus: false }).flatMap((g) => g.questions.map((q) => q.id));
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("the week's recap", () => {
  it("on Saturday, the cards you made that week, mixed", () => {
    const log = loggedSet(setup().at("2026-11-30T08:00", { type: "week.built", week: "2026-11-30", chips: [{ pieceId: "og1#0", budget: "desk", carried: false }], mockDay: null, key: "x" }));
    const m = settle(log, "2026-12-05T11:00");
    for (const s of m.sugg.pending) log.at("2026-12-05T11:05", { type: "card.kept", card: s.id, keep: true });
    log.at("2026-12-05T11:06", { type: "line", source: "video:v1#0", text: "Percent change: divide by the original." });
    expect(recallSpecs(at(log, "2026-12-04T19:00")).some((x) => x.kind === "recap")).toBe(false);     // Friday
    const r = recallSpecs(at(log, "2026-12-05T19:00")).find((x) => x.kind === "recap")!;
    expect(r).toMatchObject({ id: "recap:2026-11-30", title: "This week's recap · 5 cards", open: { type: "recap", week: "2026-11-30" } });
  });
});

describe("a fresh-question check, a week after re-learning", () => {
  it("follows a finished top-up by a week, with six new questions on the topic", () => {
    const top = { id: "topup:percents:2026-11-30:1", kind: "topup" as const, week: "2026-11-30", section: "quant" as const, topic: "percents", title: "Top-up", minutes: 30,
      open: { type: "list" as const, urls: [{ label: "x", url: "https://gmatclub.com/forum/search.php?pct-easy" }], count: 8 } };
    const log = setup().at("2026-12-03T19:00", { type: "extra.added", extra: top }).at("2026-12-04T19:00", { type: "piece.done", piece: `x:${top.id}#0` })
      .at("2026-12-07T08:00", { type: "week.built", week: "2026-12-07", chips: [], mockDay: null, key: "x" });
    expect(recallSpecs(at(log, "2026-12-10T19:00")).some((x) => x.kind === "check")).toBe(false);    // six days
    const c = recallSpecs(at(log, "2026-12-11T19:00")).find((x) => x.kind === "check")!;
    expect(c.title).toBe("Check · percents · 6 new questions");
    expect(c.open).toMatchObject({ type: "list", count: 6 });
  });
});

describe("where each topic stands", () => {
  const stat = (sets: [string, number, number][], attempts = sets.reduce((s, x) => s + x[2], 0)): TopicStat => ({
    topic: "percents", section: "quant", attempts, accuracy: 0.8, redoAccuracy: null, inReview: 0, reviewWeight: 0, tags: {},
    sets: sets.map(([day, accuracy, n]) => ({ day, accuracy, n })),
  });
  it("finishing work isn't knowing it: confirmed needs two good sets a week apart, 15+ questions, and no recent gaps", () => {
    expect(standingOf(undefined, false, 0)).toBe("later");
    expect(standingOf(undefined, true, 0)).toBe("started");
    expect(standingOf(stat([["2026-12-05", 1, 2]]), false, 0)).toBe("later");                                     // two stray questions
    expect(standingOf(stat([["2026-12-05", 0.6, 10]]), true, 0)).toBe("building");
    expect(standingOf(stat([["2026-12-05", 0.9, 10]]), true, 0)).toBe("consistent");
    expect(standingOf(stat([["2026-12-05", 0.9, 10], ["2026-12-09", 0.9, 10]]), true, 0)).toBe("consistent");    // four days apart
    expect(standingOf(stat([["2026-12-05", 0.9, 10], ["2026-12-12", 0.8, 10]]), true, 0)).toBe("confirmed");
    expect(standingOf(stat([["2026-12-05", 0.9, 10], ["2026-12-12", 0.8, 10]]), true, 1)).toBe("consistent");    // a recent concept mistake
    expect(standingOf(stat([["2026-12-05", 0.9, 10], ["2026-12-12", 0.8, 10], ["2026-12-19", 0.5, 10]]), true, 0)).toBe("consistent");  // the latest dipped
  });
});

describe("after a review: the next step for each kind of mistake", () => {
  it("timing: six with no clock, then six timed, added to this week; concept: re-teach with the tutor", () => {
    const gc = task({ id: "gcp", section: "quant", kind: "gmatclub_set", plan_week: 1 });
    gc.topic = "percents";
    gc.pointer = { type: "gmatclub_list", lists: { easy: "https://gmatclub.com/forum/search.php?pct-easy2", mixed: "https://gmatclub.com/forum/search.php?pct-mixed2" }, count: 10 };
    const CC = fixtureContent([gc]);
    const log = loggedSet().at("2026-12-07T07:55", { type: "review.tag", item: "og1|1", tag: "timing" }).at("2026-12-07T07:55", { type: "review.tag", item: "og1|4", tag: "concept" });
    const m = buildModel(CC, log.events, new Date("2026-12-07T08:00"));
    const r = closeRemedies(m.reviews.setById.get("set:og1")!, m);
    expect(r.add[0]).toMatchObject({ kind: "timing", topic: "percents", open: { count: 12 } });
    expect(r.teach).toBe("statistics");
  });

  it("two concept mistakes on one topic offer a re-teach even when the set went fine overall", () => {
    const log = loggedSet().at("2026-12-07T07:55", { type: "review.tag", item: "og1|1", tag: "concept" }).at("2026-12-07T07:55", { type: "review.tag", item: "og1|3", tag: "concept" });
    const m = at(log, "2026-12-07T08:00");
    const s = m.reviews.setById.get("set:og1")!;
    const offers = topupOffers(s.all, m.reviews, topupHistory(m.d, "2026-12-07", "2026-12-07"));
    expect(offers.some((o) => o.topic === "percents")).toBe(true);
  });
});

describe("what's covered", () => {
  it("lists every topic the plan teaches, with its cards, and counts what's coming back", () => {
    const m = settle(loggedSet(), "2026-12-05T11:00");
    const c = coverage(m);
    expect(c.total).toBe(CORE_TOPICS.length);
    expect(c.missingCards).toEqual([]);
    const pct = c.rows.find((r) => r.topic === "percents")!;
    expect(pct.met).toBe("2026-12-05");
    expect(pct.cards).toBe(deckFor("percents").length);
    expect(c.rows.find((r) => r.topic === "probability")!.standing).toBe("later");
  });
});
