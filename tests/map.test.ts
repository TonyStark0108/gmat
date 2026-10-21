// The map: every plan task once, grouped by plan week, with done / half / next / open / later.

import { describe, expect, it } from "vitest";
import { buildMap } from "../src/core/map";
import { buildModel } from "../src/core/model";
import { fixtureContent, Log } from "./fixture";
import { realContent, task } from "./helpers";

const setup = () => new Log().at("2026-11-20T10:00", { type: "setup.done" });

describe("the map", () => {
  it("counts every task once, by plan week, and opens the first week with anything left", () => {
    const C = fixtureContent();
    const m = buildModel(C, setup().events, new Date("2026-12-07T08:00"));
    const map = buildMap(m, null);
    expect(map.totalTasks).toBe(new Set(m.plan.map((p) => p.taskId)).size);
    expect(map.doneTasks).toBe(0);
    expect(map.units.map((u) => u.week)).toEqual([...new Set(m.plan.map((p) => p.task.plan_week))].sort((a, b) => a - b));
    expect(map.currentWeek).toBe(map.units[0].week);
    expect(map.units[0].state).toBe("current");
    expect(map.hoursLeft).toBe(Math.round(m.plan.reduce((s, p) => s + p.minutes, 0) / 60));
  });

  it("marks done, half done, next and this week's tasks; a finished week folds", () => {
    const C = fixtureContent([
      { ...task({ id: "two", section: "quant", kind: "og_set", plan_week: 1, est_minutes: 40, pointer: { type: "og_block", book: "og", qtype: "PS", numbers: [7, 26], count: 20 } }),
        break_points: [{ numbers: [7, 16] }, { numbers: [17, 26] }] } as never,
      task({ id: "wk2", section: "rc", kind: "rc_section", plan_week: 2, pointer: { type: "lsat_rc", section: "s2", count: 3 } }),
    ]);
    const m0 = buildModel(C, setup().events, new Date("2026-12-07T08:00"));
    const two = m0.plan.filter((p) => p.taskId === "two");
    expect(two.length).toBeGreaterThan(1);
    const week1 = m0.plan.filter((p) => p.task.plan_week === 1 && p.taskId !== "two");
    const log = setup().at("2026-12-07T08:00", { type: "week.built", week: "2026-12-07", chips: m0.plan.filter((p) => p.task.plan_week === 1).map((p) => ({ pieceId: p.id, budget: "desk" as const, carried: false })), mockDay: null, key: "x" });
    log.at("2026-12-07T09:00", { type: "piece.done", piece: two[0].id });
    for (const p of week1) log.at("2026-12-07T10:00", { type: "piece.done", piece: p.id });
    const m = buildModel(C, log.events, new Date("2026-12-08T19:00"));
    const map = buildMap(m, null);
    const u1 = map.units.find((u) => u.week === 1)!;
    expect(u1.nodes.find((n) => n.taskId === "two")!.status).toBe("half");
    expect(u1.nodes.filter((n) => n.taskId !== "two").every((n) => n.status === "done")).toBe(true);
    expect(u1.state).toBe("current");
    expect(buildMap(m, two[1].id).units[0].nodes.find((n) => n.taskId === "two")!.status).toBe("next");

    for (const p of two.slice(1)) log.at("2026-12-08T20:00", { type: "piece.done", piece: p.id });
    const after = buildMap(buildModel(C, log.events, new Date("2026-12-08T21:00")), null);
    expect(after.units.find((u) => u.week === 1)!.state).toBe("done");
    expect(after.currentWeek).toBe(2);
    expect(after.units.find((u) => u.week === 2)!.state).toBe("current");
    expect(after.doneTasks).toBe(u1.total);
  });

  it("later weeks stay closed and can't be started; levels sit after the weeks that unlock them", () => {
    // without the content file (CI), a fixture with a later week
    const C = realContent() ?? fixtureContent([task({ id: "wk3", section: "cr", kind: "cr_set", plan_week: 3, pointer: { type: "lsat_cr", set: "c1", count: 5 } })]);
    const map = buildMap(buildModel(C, setup().events, new Date("2026-12-07T08:00")), null);
    const later = map.units.filter((u) => u.week > map.currentWeek);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((u) => u.state === "later" && u.nodes.every((n) => !n.inThisWeek))).toBe(true);
    expect(map.units.every((u) => u.about.length > 0)).toBe(true);
    const lv = Object.fromEntries(map.units.filter((u) => u.levelAfter).map((u) => [u.week, u.levelAfter!.n]));
    if (realContent()) expect(lv).toEqual({ 1: 1, 3: 2, 6: 3, 8: 4, 10: 5, 13: 6 });
  });
});
