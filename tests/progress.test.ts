import { describe, expect, it } from "vitest";
import { weekStartOf } from "../src/core/calendar";
import type { AppEvent, EventBody } from "../src/core/events";
import { toPieces } from "../src/core/pieces";
import { hoursLogged, levelFromWork, percentDone } from "../src/core/progress";
import { derive } from "../src/core/state";
import { markSet, parseTyped } from "../src/core/grid";
import { settings, task } from "./helpers";

let i = 0;
const ev = (b: EventBody, day = "2026-12-05"): AppEvent => ({ ...b, id: `e${i++}`, ts: i, day } as AppEvent);

describe("test 9 · numbers only go up", () => {
  const S = settings();
  const tasks = Array.from({ length: 12 }, (_, k) => task({ section: k % 2 ? "rc" : "quant", kind: k % 2 ? "rc_section" : "og_set", plan_week: 1 + Math.floor(k / 4) }));
  const pieces = toPieces(tasks, S);

  it("% done, hours, weeks and level never drop, whatever happens to the schedule", () => {
    const log: AppEvent[] = [];
    let last = { pct: 0, hours: 0, weeks: 0, level: 0 };
    const steps: EventBody[] = [
      { type: "piece.done", piece: pieces[0].id }, { type: "time", minutes: 70, where: "desk", source: "t" },
      { type: "settings", patch: { finishDate: "2027-09-01" } },                        // a date moves
      { type: "week.built", week: "2026-11-30", chips: [], mockDay: null },              // the week is rebuilt
      { type: "piece.done", piece: pieces[1].id }, { type: "week.counted", week: "2026-11-30" },
      { type: "skip", piece: pieces[2].id }, { type: "settings", patch: { pauses: [{ from: "2026-12-07", to: "2026-12-31" }] } },
      { type: "piece.done", piece: pieces[2].id }, { type: "piece.done", piece: pieces[3].id }, { type: "level", level: 1 },
      { type: "time", minutes: 50, where: "bus", source: "t" },
    ];
    for (const s of steps) {
      log.push(ev(s));
      const d = derive(log);
      const now = { pct: percentDone(pieces, d.done), hours: hoursLogged(d), weeks: d.counted.size,
        level: Math.max(d.level, levelFromWork(pieces, d.done)) };
      expect(now.pct).toBeGreaterThanOrEqual(last.pct);
      expect(now.hours).toBeGreaterThanOrEqual(last.hours);
      expect(now.weeks).toBeGreaterThanOrEqual(last.weeks);
      expect(now.level).toBeGreaterThanOrEqual(last.level);
      last = now;
    }
    expect(last.level).toBe(1);
  });

  it("a week counted is never un-counted", () => {
    const d = derive([ev({ type: "week.counted", week: "2026-11-30" }), ev({ type: "week.counted", week: "2026-11-30" })]);
    expect(d.counted.size).toBe(1);
  });
});

describe("the week runs Monday to Sunday", () => {
  it("Sunday belongs to the week that started the Monday before", () => {
    expect(weekStartOf("2026-12-06")).toBe("2026-11-30");
    expect(weekStartOf("2026-12-07")).toBe("2026-12-07");
  });
});

describe("the answer grid", () => {
  it("reads 77c, 77cs and 77 c", () => {
    expect(parseTyped("77c")).toEqual({ n: 77, value: "C", unsure: false });
    expect(parseTyped("77cs")).toEqual({ n: 77, value: "C", unsure: true });
    expect(parseTyped("77 c?")).toEqual({ n: 77, value: "C", unsure: true });
    expect(parseTyped("77f")).toBeNull();
  });
  it("reads a Two-Part row per column", () => {
    expect(parseTyped("415 2 4", { twoPart: () => 6 })).toEqual({ n: 415, value: [2, 4], unsure: false });
    expect(parseTyped("415 24s", { twoPart: () => 6 })).toEqual({ n: 415, value: [2, 4], unsure: true });
    expect(parseTyped("415 2 9", { twoPart: () => 6 })).toBeNull();
  });
  it("counts wrong and not-sure together, so the number isn't a score", () => {
    const m = markSet([
      { value: "A", unsure: false, key: "A" }, { value: "B", unsure: false, key: "C" },
      { value: "D", unsure: true, key: "D" }, { value: [1, 2], unsure: false, key: [1, 3] },
    ]);
    expect(m.toLookAgain).toBe(3);
    expect(m.right).toBe(2);
  });
});
