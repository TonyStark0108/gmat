import { describe, expect, it } from "vitest";
import { weekCapacity } from "../src/core/calendar";
import { planTasks, toPieces } from "../src/core/pieces";
import { WEEK_CAP_MIN } from "../src/core/settings";
import { buildWeek, extraDeskFor, projectFinish } from "../src/core/week";
import { realContent, settings, task } from "./helpers";

const S = settings();
const FIRST_WEEK = "2026-11-30"; // Monday; the plan starts Tuesday 1 Dec

describe("test 1 · two budgets", () => {
  it("quant, DI, OG sets, drills and mocks only ever land in desk time", () => {
    const tasks = [
      task({ section: "quant", kind: "og_set", plan_week: 1 }),
      task({ section: "di", kind: "og_set", plan_week: 1 }),
      task({ section: "quant", kind: "drill", plan_week: 1, est_minutes: 15 }),
      task({ section: "rc", kind: "rc_section", plan_week: 1 }),
      task({ section: "cr", kind: "cr_set", plan_week: 1 }),
      task({ section: "mock", kind: "mock", plan_week: 1, est_minutes: 135 }),
    ];
    const pieces = toPieces(tasks, S);
    const plan = buildWeek({ weekStart: "2026-12-07", pieces, done: new Set(), settings: S });
    for (const c of plan.chips) {
      const p = pieces.find((x) => x.id === c.pieceId)!;
      if (p.deskOnly) expect(c.budget).toBe("desk");
    }
    expect(plan.chips.find((c) => c.pieceId.startsWith(tasks[3].id))?.budget).toBe("bus");
  });

  it("with the default times, desk time sets the finish date", () => {
    const c = realContent();
    if (!c) return;                          // needs the imported plan
    const pieces = toPieces(planTasks(c, S), S);
    const withRides = projectFinish({ pieces, done: new Set(), settings: S, fromWeek: FIRST_WEEK });
    const moreRides = projectFinish({ pieces, done: new Set(), settings: S, fromWeek: FIRST_WEEK, busMinutes: 200 });
    // more bus time changes nothing: the desk is the constraint
    expect(moreRides.finish).toBe(withRides.finish);
    expect(withRides.finish! > "2027-05-01").toBe(true);
  });

  it("when bus work runs ahead, rides never take next week's plan tasks", () => {
    const tasks = [
      task({ section: "quant", kind: "og_set", plan_week: 1, est_minutes: 250 }),
      task({ section: "quant", kind: "og_set", plan_week: 2, est_minutes: 250 }),
      task({ section: "rc", kind: "rc_section", plan_week: 1, est_minutes: 30 }),
      task({ section: "rc", kind: "rc_section", plan_week: 2, est_minutes: 30 }),
      task({ section: "rc", kind: "rc_section", plan_week: 3, est_minutes: 30 }),
    ];
    const pieces = toPieces(tasks, S);
    const plan = buildWeek({ weekStart: "2026-12-07", pieces, done: new Set(), settings: S });
    const weeks = plan.chips.map((c) => pieces.find((p) => p.id === c.pieceId)!.planWeek);
    // the desk only reaches plan week 2, so the week-3 reading waits
    expect(weeks).not.toContain(3);
    expect(plan.used.bus).toBeLessThan(plan.cap.bus);
  });
});

describe("test 5 · pieces", () => {
  it("OG sets split into halves; LSAT RC and CR sets and mocks never do", () => {
    const og = task({ section: "quant", kind: "og_set", pointer: { type: "og_block", count: 25, numbers: [1, 25] },
      break_points: [{ numbers: [1, 12] }, { numbers: [13, 25] }] });
    const rc = task({ section: "rc", kind: "rc_section", break_points: [{ count: 13 }, { count: 14 }] });
    const cr = task({ section: "cr", kind: "cr_set", break_points: [{ count: 12 }, { count: 13 }] });
    const mock = task({ section: "mock", kind: "mock", break_points: [{ count: 1 }, { count: 1 }] });
    const pieces = toPieces([og, rc, cr, mock], S);
    expect(pieces.filter((p) => p.taskId === og.id).map((p) => p.numbers)).toEqual([[1, 12], [13, 25]]);
    for (const t of [rc, cr, mock]) expect(pieces.filter((p) => p.taskId === t.id)).toHaveLength(1);
  });

  it("the real plan: every OG set of 16+ questions has two halves", () => {
    const c = realContent();
    if (!c) return;
    const pieces = toPieces(planTasks(c, S), S);
    for (const t of c.plan.tasks.filter((t) => t.kind === "og_set" && (t.pointer.count ?? 0) >= 16)) {
      expect(pieces.filter((p) => p.taskId === t.id).length).toBe(2);
    }
    for (const t of planTasks(c, S).filter((t) => ["rc_section", "cr_set", "mock"].includes(t.kind))) {
      expect(pieces.filter((p) => p.taskId === t.id).length).toBe(1);
    }
  });
});

describe("test 10 · dates", () => {
  it("never plans above 15 hours a week, however much time you give it", () => {
    const s = settings({ busMinutesPerWeekday: 400, mornings: { days: [1, 2, 3, 4, 5], start: "06:00", end: "09:00" } });
    const cap = weekCapacity("2026-12-07", s);
    expect(cap.rawDesk + cap.rawBus).toBeLessThanOrEqual(WEEK_CAP_MIN);
  });

  it("changing a date re-spreads only the work that's left", () => {
    const tasks = Array.from({ length: 20 }, (_, i) => task({ section: "quant", kind: "og_set", plan_week: 1 + Math.floor(i / 2) }));
    const pieces = toPieces(tasks, S);
    const done = new Set(pieces.slice(0, 6).map((p) => p.id));
    const a = projectFinish({ pieces, done, settings: S, fromWeek: "2026-12-14" });
    const later = settings({ pauses: [...S.pauses, { from: "2027-01-04", to: "2027-01-17" }] });
    const b = projectFinish({ pieces, done, settings: later, fromWeek: "2026-12-14" });
    expect(b.finish! > a.finish!).toBe(true);
    // done work stays done: the projection only packs what's left
    const plan = buildWeek({ weekStart: "2026-12-14", pieces, done, settings: later });
    for (const c of plan.chips) expect(done.has(c.pieceId)).toBe(false);
  });

  it("a pause week has no plan work", () => {
    const pieces = toPieces([task({ section: "rc", kind: "rc_section" })], S);
    const s = settings({ pauses: [{ from: "2027-02-01", to: "2027-02-07" }] });
    expect(buildWeek({ weekStart: "2027-02-01", pieces, done: new Set(), settings: s }).pause).toBe(true);
  });

  it("picking an earlier finish shows the extra desk time it needs", () => {
    const tasks = Array.from({ length: 90 }, (_, i) => task({ section: "quant", kind: "og_set", plan_week: 1 + Math.floor(i / 7) }));
    const pieces = toPieces(tasks, S);
    const base = projectFinish({ pieces, done: new Set(), settings: S, fromWeek: FIRST_WEEK });
    const need = extraDeskFor("2027-02-01", { pieces, done: new Set(), settings: S, fromWeek: FIRST_WEEK });
    expect(base.finish! > "2027-02-01").toBe(true);
    expect(need?.extraPerWeek).toBeGreaterThan(0);
  });
});
