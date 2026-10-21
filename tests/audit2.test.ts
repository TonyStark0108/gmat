// The second audit (21 Oct 2026): one test per bug found in the core rules.

import { describe, expect, it } from "vitest";
import { chooseCard } from "../src/core/card";
import { keepDatePlan } from "../src/core/life";
import { buildModel, cardContext, upkeep } from "../src/core/model";
import { planTasks, toPieces } from "../src/core/pieces";
import { levelFromWork, weeksInARow } from "../src/core/progress";
import { specToPiece } from "../src/core/extras";
import { noteWeek } from "../src/core/sunday";
import { buildWeek } from "../src/core/week";
import { fixtureContent, Log } from "./fixture";
import { settings, task } from "./helpers";

const C = fixtureContent();
const setup = () => new Log().at("2026-11-20T10:00", { type: "setup.done" });
const at = (log: Log, when: string, content = C) => buildModel(content, log.events, new Date(when));
function settle(log: Log, when: string, content = C) {
  for (let i = 0; i < 8; i++) {
    const out = upkeep(at(log, when, content));
    if (!out.length) break;
    for (const e of out) log.at(when, e);
  }
  return at(log, when, content);
}

describe("weeks and levels", () => {
  it("a Sunday rebuild (a changed setting) can't make an unfinished week count", () => {
    const log = setup();
    let m = settle(log, "2026-12-07T08:00");
    const chips = m.week!.chips;
    expect(chips.length).toBeGreaterThan(2);
    log.at("2026-12-08T19:00", { type: "piece.done", piece: chips[0].pieceId });
    log.at("2026-12-13T10:00", { type: "settings", patch: { busMinutesPerWeekday: 60 } });
    m = settle(log, "2026-12-13T12:00");
    expect(m.d.weeks.get("2026-12-07")!.chips.length).toBeLessThan(chips.length);    // the rebuild dropped them
    m = settle(log, "2026-12-14T08:00");
    expect(m.d.counted.has("2026-12-07")).toBe(false);
  });

  it("a task you let go doesn't hold up a level or a week", () => {
    const plan = toPieces(planTasks(C, settings()), settings());
    const done = new Set(plan.filter((p) => p.taskId !== "cr1").map((p) => p.id));
    expect(levelFromWork(plan, done)).toBe(0);
    expect(levelFromWork(plan, done, true, new Set(["cr1"]))).toBeGreaterThanOrEqual(1);
  });

  it("a run of weeks isn't broken by a pause week", () => {
    const counted = new Set(["2026-12-14", "2026-12-21", "2027-01-04"]);
    expect(weeksInARow(counted, "2027-01-04")).toBe(1);
    expect(weeksInARow(counted, "2027-01-04", (w) => w === "2026-12-28")).toBe(3);
  });
});

describe("the review numbers", () => {
  it("the retired count never drops, even when a failed spot check changes the marking", () => {
    const log = setup()
      .at("2026-12-05T10:05", { type: "piece.started", piece: "og1#0", mode: "desk" })
      .grid("2026-12-05T10:10", "og1#0", 1, ["b", "b", "cs", "a", "e", "a"])
      .at("2026-12-05T10:30", { type: "piece.submitted", piece: "og1#0", wrongOrUnsure: 3, answered: 6 })
      .at("2026-12-05T10:30", { type: "piece.done", piece: "og1#0" })
      .at("2026-12-08T07:50", { type: "review.answer", review: "set:og1", item: "og1|1", attempt: "retry", value: "A" })
      .at("2026-12-22T07:50", { type: "review.answer", review: "mixed:x", item: "og1|1", attempt: "mixed", value: "A" });
    expect(settle(log, "2026-12-22T08:00").reviews.retired).toBe(1);
    log.at("2026-12-23T09:00", { type: "book.check", scope: "og:PS", what: "spot", ok: false });
    expect(at(log, "2026-12-23T10:00").reviews.retired).toBe(1);
  });
});

describe("mocks and the end game", () => {
  const mock = task({ id: "mk1", section: "mock", kind: "mock", plan_week: 1, pointer: { type: "official_mock", exam: 1 } });

  it("the mock goes on Saturday, even when a Sunday block is added", () => {
    const s = settings({ saturday: { ...settings().saturday, days: [6, 0] } });
    const pieces = toPieces(planTasks(fixtureContent([mock]), s), s);
    const w = buildWeek({ weekStart: "2026-12-07", pieces, done: new Set(), settings: s });
    expect(w.mockDay).toBe("2026-12-12");
  });

  it("the sweep 'before the mock' goes once the mock is done", () => {
    const log = setup();
    const m = settle(log, "2026-12-09T19:00");
    const sweep = specToPiece({ id: "sweep:og1#0", kind: "recall", week: "2026-12-07", section: "general", topic: null, title: "Before the mock", minutes: 30,
      open: { type: "recall", sweep: "og1#0", bus: true } }, "2026-12-09");
    const ctx = cardContext(m, { bus: false, online: true }).ctx;
    expect(chooseCard({ ...ctx, extras: [sweep] })).toMatchObject({ kind: "task", piece: { id: sweep.id } });
    const done = at(log.at("2026-12-09T19:01", { type: "piece.done", piece: "og1#0" }), "2026-12-09T19:05");
    const card = chooseCard({ ...cardContext(done, { bus: false, online: true }).ctx, extras: [sweep] });
    expect(card.kind === "task" && card.piece.id === sweep.id).toBe(false);
  });

  it("in the last two weeks, a fresh official mock left in the plan comes up on the Saturday block", () => {
    const later = task({ id: "mk5", section: "mock", kind: "mock", plan_week: 9, pointer: { type: "official_mock", exam: 5 } });
    const CC = fixtureContent([later]);
    const log = setup().at("2026-12-01T09:00", { type: "booking", answer: "booked", date: "2026-12-22" });
    const m = settle(log, "2026-12-12T10:05", CC);
    expect(m.phase).toBe("taper");
    const card = chooseCard(cardContext(m, { bus: false, online: true }).ctx);
    expect(card).toMatchObject({ kind: "mock", piece: { taskId: "mk5" } });
  });
});

describe("dates", () => {
  it("Monday before 4 am shows the note for the week just gone", () => {
    expect(noteWeek(new Date("2026-12-14T01:00"), "2026-12-13")).toBe("2026-12-07");
    expect(noteWeek(new Date("2026-12-14T09:00"), "2026-12-14")).toBe("2026-12-07");
  });

  it("keeping the date never asks for more than 15 hours a week", () => {
    const s = settings({ mornings: { ...settings().mornings, days: [1, 2, 3, 4, 5] } });
    expect(keepDatePlan(s, 30)).not.toBeNull();                // without a week to check against
    expect(keepDatePlan(s, 30, 800)).toBeNull();               // 800 + a 4-hour Sunday is past 900 minutes
  });
});
