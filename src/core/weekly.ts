// When the current week gets built or rebuilt, and when a week counts.
// The week is built the first time the app opens in it ("Sunday night", in effect); changing a
// date or a time rebuilds it from today, keeping what's done.

import { addDays, dayCapacity, parseYmd, weekCapacity, weekStartOf, ymd } from "./calendar";
import type { EventBody } from "./events";
import type { Piece } from "./pieces";
import { weekCounts } from "./progress";
import type { Settings } from "./settings";
import type { Derived } from "./state";
import { buildWeek, type WeekPlan } from "./week";

/** The settings a week's plan depends on; if these change, the week is rebuilt. */
export function planKey(s: Settings): string {
  return JSON.stringify([s.startDate, s.saturday, s.mornings, s.busCounts, s.busMinutesPerWeekday, s.pauses,
    s.practiceRun, s.verbalReviewOnBus, s.finishDate, s.testDate]);
}

export function weekPlanOf(d: Derived, weekStart: string, s: Settings): WeekPlan | null {
  const e = d.weeks.get(weekStart);
  if (!e) return null;
  return {
    weekStart, chips: e.chips, cap: weekCapacity(weekStart, s), used: { desk: 0, bus: 0 },
    pause: e.chips.length === 0 && weekCapacity(weekStart, s).desk === 0 && weekCapacity(weekStart, s).bus === 0,
    mockDay: e.mockDay,
  };
}

/** Events to add now so the current week exists and is up to date. */
export function weekEvents(pieces: Piece[], d: Derived, s: Settings, today: string): EventBody[] {
  if (today < s.startDate) return [];
  const ws = weekStartOf(today);
  const existing = d.weeks.get(ws);
  const key = planKey(s);
  if (existing && existing.key === key) return [];

  const carried = new Set<string>();
  for (const [w, e] of d.weeks) if (w < ws) e.chips.forEach((c) => !d.done.has(c.pieceId) && carried.add(c.pieceId));

  const plan = buildWeek({ weekStart: ws, pieces, done: d.done, settings: s, fromDay: today, carried });
  // A rebuild keeps this week's finished chips on the week screen.
  const keep = existing ? existing.chips.filter((c) => d.done.has(c.pieceId)) : [];
  const chips = [...keep, ...plan.chips.filter((c) => !keep.some((k) => k.pieceId === c.pieceId))];
  return [{ type: "week.built", week: ws, chips, mockDay: plan.mockDay, key }];
}

/** Weeks that now count and haven't been recorded yet (stored once, so "weeks done" never drops). */
export function countedEvents(d: Derived, s: Settings, today: string): EventBody[] {
  const out: EventBody[] = [];
  for (const [w] of d.weeks) {
    if (d.counted.has(w)) continue;
    const plan = weekPlanOf(d, w, s);
    if (plan && weekCounts(plan, d, today)) out.push({ type: "week.counted", week: w });
  }
  return out;
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
