// The numbers on home. None of them can go down (spec: Progress; test 9):
// % and hours are sums over an add-only log; weeks and levels are stored once reached.

import { addDays, parseYmd, ymd } from "./calendar";
import type { Piece } from "./pieces";
import type { Derived } from "./state";
import type { WeekPlan } from "./week";

export function percentDone(pieces: Piece[], done: Set<string>): number {
  const total = pieces.reduce((s, p) => s + p.minutes, 0);
  const got = pieces.reduce((s, p) => s + (done.has(p.id) ? p.minutes : 0), 0);
  return total ? Math.floor((100 * got) / total) : 0;
}

export function hoursLogged(d: Derived): number {
  return Math.floor(d.totalMinutes / 60);
}

export function weeksInARow(counted: Set<string>, currentWeek: string): number {
  // count back from the current week if it has counted, otherwise from the week before
  let w = counted.has(currentWeek) ? currentWeek : ymd(addDays(parseYmd(currentWeek), -7));
  let n = 0;
  while (counted.has(w)) {
    n++;
    w = ymd(addDays(parseYmd(w), -7));
  }
  return n;
}

/** A week counts when every chip is done and the rest day is taken (tapped, or a day under 15 minutes). */
export function weekCounts(plan: WeekPlan, d: Derived, today: string): boolean {
  if (plan.pause || plan.chips.length === 0) return false;
  if (!plan.chips.every((c) => d.done.has(c.pieceId))) return false;
  if (d.restTapped.has(plan.weekStart)) return true;
  for (let i = 0; i < 7; i++) {
    const day = ymd(addDays(parseYmd(plan.weekStart), i));
    if (day >= today) break;             // only days that are over
    if ((d.minutesByDay.get(day) ?? 0) < 15) return true;
  }
  return false;
}

export const LEVELS = [
  { n: 1, name: "Starting line", weeks: [1, 1] },
  { n: 2, name: "Groundwork", weeks: [1, 3] },
  { n: 3, name: "Building", weeks: [1, 6] },
  { n: 4, name: "Halfway", weeks: [1, 8] },
  { n: 5, name: "Sharpening", weeks: [1, 10] },
  { n: 6, name: "Plan complete", weeks: [1, 13] },
  { n: 7, name: "Ready", weeks: null },   // mocks only (Phase 3)
] as const;

/** The highest level the work so far unlocks (levels 1–6 count plan weeks done). */
export function levelFromWork(pieces: Piece[], done: Set<string>, errorsHalfRetired = true): number {
  let level = 0;
  for (const L of LEVELS) {
    if (!L.weeks) break;
    const [a, b] = L.weeks;
    const inRange = pieces.filter((p) => p.planWeek >= a && p.planWeek <= b);
    if (!inRange.length || !inRange.every((p) => done.has(p.id))) break;
    if (L.n === 5 && !errorsHalfRetired) break;
    level = L.n;
  }
  return level;
}

export function levelView(level: number, pieces: Piece[], done: Set<string>) {
  const cur = LEVELS.find((L) => L.n === level);
  const next = LEVELS.find((L) => L.n === level + 1);
  let frac = 0;
  if (next?.weeks) {
    const [a, b] = next.weeks;
    const prevB = cur?.weeks ? cur.weeks[1] : 0;
    const span = pieces.filter((p) => p.planWeek > prevB && p.planWeek >= a && p.planWeek <= b);
    const tot = span.reduce((s, p) => s + p.minutes, 0);
    frac = tot ? span.reduce((s, p) => s + (done.has(p.id) ? p.minutes : 0), 0) / tot : 0;
  }
  return {
    label: cur ? `Level ${cur.n} · ${cur.name}` : "Starting out",
    next: next ? `Level ${next.n} · ${next.name}` : "",
    frac,
  };
}
