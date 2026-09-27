import { describe, expect, it } from "vitest";
import { chooseCard, type CardCtx } from "../src/core/card";
import type { AppEvent, EventBody } from "../src/core/events";
import { toPieces } from "../src/core/pieces";
import { derive } from "../src/core/state";
import { buildWeek } from "../src/core/week";
import { settings, task } from "./helpers";

const S = settings();
const tasks = [
  task({ id: "q1", section: "quant", kind: "og_set", est_minutes: 25 }),
  task({ id: "rc1", section: "rc", kind: "rc_section", est_minutes: 60, offline_ok: true }),
  task({ id: "v1", section: "general", kind: "video", est_minutes: 20 }),
  task({ id: "q2", section: "quant", kind: "gmatclub_set", est_minutes: 60 }),
  task({ id: "m1", section: "mock", kind: "mock", est_minutes: 135 }),
];
const pieces = toPieces(tasks, S);
const byId = new Map(pieces.map((p) => [p.id, p]));
const week = buildWeek({ weekStart: "2026-12-07", pieces, done: new Set(), settings: S });

let i = 0;
function ctx(when: string, extra: Partial<CardCtx> = {}, evs: EventBody[] = []): CardCtx {
  const events = evs.map((b) => ({ ...b, id: `e${i++}`, ts: i, day: when.slice(0, 10) }) as AppEvent);
  return { now: new Date(when), today: when.slice(0, 10), settings: S, pieces, byId, week, d: derive(events), bus: false,
    online: true, mix: "mix", timeBudget: null, ...extra };
}
const pick = (c: CardCtx) => { const r = chooseCard(c); return "piece" in r ? r.piece.taskId : r.kind; };

describe("step 1 · what fits right now", () => {
  it("on the bus: reading, videos, CR and cards; never quant, DI, drills or mocks", () => {
    expect(["rc1", "v1"]).toContain(pick(ctx("2026-12-07T18:45", { bus: true })));
  });

  it("with no signal: only what works offline", () => {
    expect(pick(ctx("2026-12-07T20:00", { online: false }))).toBe("rc1");
  });

  it("a morning slot: quant or DI that ends before the slot does", () => {
    expect(pick(ctx("2026-12-08T07:50"))).toBe("q1");          // 40 minutes left: the 25-minute set, not the hour
  });

  it("with 10 minutes left in a morning slot, no new piece starts", () => {
    expect(chooseCard(ctx("2026-12-08T08:21")).kind).toBe("nothing");
  });

  it("after 11 pm: nothing new", () => {
    expect(chooseCard(ctx("2026-12-07T23:15")).kind).toBe("late");
  });
});

describe("step 2 · the priority list", () => {
  it("anything unfinished comes first", () => {
    expect(pick(ctx("2026-12-09T20:00", {}, [{ type: "piece.started", piece: "q2#0", mode: "desk" }]))).toBe("q2");
  });

  it("the mock is today's card on its day, off the bus", () => {
    expect(week.mockDay).toBe("2026-12-12");
    expect(chooseCard(ctx("2026-12-12T10:05")).kind).toBe("mock");
    expect(chooseCard(ctx("2026-12-12T10:05", { bus: true })).kind).not.toBe("mock");
  });

  it("a week with every chip done says so", () => {
    const all = week.chips.map((c) => ({ type: "piece.done", piece: c.pieceId }) as EventBody);
    expect(chooseCard(ctx("2026-12-10T20:00", {}, all)).kind).toBe("weekdone");
  });

  it("before the start date: the warm-up", () => {
    expect(chooseCard(ctx("2026-10-01T20:00")).kind).toBe("warmup");
  });
});
