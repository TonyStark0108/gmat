// When the current week gets built or rebuilt, and when a week counts.
// The week is built the first time the app opens in it ("Sunday night", in effect); changing a
// date, a time or "something came up" rebuilds it from today, keeping what's done.

import { addDays, dayCapacity, parseYmd, plusDays, weekCapacity, weekStartOf, ymd } from "./calendar";
import type { EventBody } from "./events";
import type { Piece } from "./pieces";
import type { Settings } from "./settings";
import type { Derived } from "./state";
import { buildWeek, type WeekPlan } from "./week";

/** The settings a week's plan depends on; if these change, the week is rebuilt. */
export function planKey(s: Settings): string {
  return JSON.stringify([s.startDate, s.saturday, s.mornings, s.busCounts, s.busMinutesPerWeekday, s.pauses,
    s.practiceRun, s.verbalReviewOnBus, s.finishDate, s.testDate, s.life, s.fitMode, s.rebuild]);
}

export function weekPlanOf(d: Derived, weekStart: string, s: Settings): WeekPlan | null {
  const e = d.weeks.get(weekStart);
  if (!e) return null;
  const cap = weekCapacity(weekStart, s);
  return { weekStart, chips: e.chips, cap, used: { desk: 0, bus: 0 }, pause: e.chips.length === 0 && cap.desk === 0 && cap.bus === 0, mockDay: e.mockDay, light: e.light };
}

/** Pieces planned in an earlier week and not done: they go to the front (spec: Carry-over first). */
export function carriedInto(d: Derived, ws: string): Set<string> {
  const carried = new Set<string>();
  for (const [w, e] of d.weeks) if (w < ws) e.chips.forEach((c) => !d.done.has(c.pieceId) && carried.add(c.pieceId));
  return carried;
}

/** Events to add now so the current week exists and is up to date. */
export function weekEvents(pieces: Piece[], d: Derived, s: Settings, today: string, busMinutes?: number, letGo: Set<string> = new Set()): EventBody[] {
  if (today < s.startDate) return [];
  const ws = weekStartOf(today);
  const existing = d.weeks.get(ws);
  const key = planKey(s);
  if (existing && existing.key === key) return [];
  const done = new Set([...d.done, ...pieces.filter((p) => letGo.has(p.taskId)).map((p) => p.id)]);
  const plan = buildWeek({ weekStart: ws, pieces, done, settings: s, fromDay: today, carried: carriedInto(d, ws), busMinutes });
  // A rebuild keeps this week's finished chips on the week screen.
  const keep = existing ? existing.chips.filter((c) => d.done.has(c.pieceId)) : [];
  const chips = [...keep, ...plan.chips.filter((c) => !keep.some((k) => k.pieceId === c.pieceId))];
  return [{ type: "week.built", week: ws, chips, mockDay: plan.mockDay, key, light: plan.light }];
}

/**
 * A week counts when every chip and every review it asked for was done by Sunday night, and the
 * rest day was taken (tapped, or a day under 15 minutes). Stored once, so "weeks done" never drops.
 */
export function weekCounts(plan: WeekPlan, d: Derived, today: string, reviewsDone: boolean): boolean {
  if (plan.pause || plan.chips.length === 0 || !reviewsDone) return false;
  const end = plusDays(plan.weekStart, 6);
  if (!plan.chips.every((c) => d.done.has(c.pieceId) && d.doneAt.get(c.pieceId)!.day <= end)) return false;
  if (d.restTapped.has(plan.weekStart)) return true;
  for (let i = 0; i < 7; i++) {
    const day = ymd(addDays(parseYmd(plan.weekStart), i));
    if (day >= today) break;             // only days that are over
    if ((d.minutesByDay.get(day) ?? 0) < 15) return true;
  }
  return false;
}

/** Share of a week's chips left when it closed (more than a third left runs the date check). */
export function leftShare(plan: WeekPlan, d: Derived, pieceMinutes: (id: string) => number): number {
  const end = plusDays(plan.weekStart, 6);
  const tot = plan.chips.reduce((s, c) => s + pieceMinutes(c.pieceId), 0);
  if (!tot) return 0;
  const left = plan.chips.filter((c) => !(d.done.has(c.pieceId) && d.doneAt.get(c.pieceId)!.day <= end)).reduce((s, c) => s + pieceMinutes(c.pieceId), 0);
  return left / tot;
}

/** Study days left in the week with time in them, today included. */
export function studyDaysLeft(today: string, s: Settings): number {
  const ws = weekStartOf(today);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const day = ymd(addDays(parseYmd(ws), i));
    if (day < today) continue;
    const c = dayCapacity(day, s);
    if (c.desk + c.bus > 0) n++;
  }
  return n;
}
