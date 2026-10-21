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
    s.practiceRun, s.verbalReviewOnBus, s.finishDate, s.testDate, s.life, s.fitMode, s.rebuild, s.exams36, s.practiceRunKind]);
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
  // a restore brings in another device's history: the current week is rebuilt around it (past weeks stay)
  const restoredSince = existing && d.restoredAt !== null && d.restoredAt > existing.ts;
  if (existing && existing.key === key && !restoredSince) return [];
  const done = new Set([...d.done, ...pieces.filter((p) => letGo.has(p.taskId)).map((p) => p.id)]);
  // first built: the whole week from Monday, even if the app first opens on a Thursday; rebuilt: from today
  const fromDay = existing ? today : (ws > s.startDate ? ws : s.startDate);
  const plan = buildWeek({ weekStart: ws, pieces, done, settings: s, fromDay, carried: carriedInto(d, ws), busMinutes });
  // A rebuild keeps this week's finished chips on the week screen.
  // ...only chips finished this week (after a restore, the other device's earlier work stays in its own week)
  const keep = existing ? existing.chips.filter((c) => d.done.has(c.pieceId) && d.doneAt.get(c.pieceId)!.day >= ws) : [];
  const chips = [...keep, ...plan.chips.filter((c) => !keep.some((k) => k.pieceId === c.pieceId))];
  return [{ type: "week.built", week: ws, chips, mockDay: plan.mockDay, key, light: plan.light }];
}

/**
 * A week counts when every chip and every review it asked for was done by Sunday night. A rest day is
 * suggested, not required (see restTaken). Stored once, so "weeks done" never drops.
 */
export function weekCounts(plan: WeekPlan, d: Derived, _today: string, reviewsDone: boolean): boolean {
  if (plan.pause || plan.chips.length === 0 || !reviewsDone) return false;
  const end = plusDays(plan.weekStart, 6);
  return plan.chips.every((c) => d.done.has(c.pieceId) && d.doneAt.get(c.pieceId)!.day <= end);
}

/** Was a rest day taken this week (tapped, or a day under 15 minutes)? Only for the gentle suggestion. */
export function restTaken(weekStart: string, d: Derived, today: string): boolean {
  if (d.restTapped.has(weekStart)) return true;
  for (let i = 0; i < 7; i++) {
    const day = ymd(addDays(parseYmd(weekStart), i));
    if (day >= today) break;
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
