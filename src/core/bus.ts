// Bus mode learns your rides, but only suggests (spec: Bus mode). A ride is bus mode on until you
// turn it off, or two hours, whichever comes first. The last three weeks decide how long a ride
// usually is (for the week's bus budget) and when you usually get on (for the "On the bus?" chip).

import type { Derived } from "./state";

export interface Ride { start: number; minutes: number }

const TWO_HOURS = 2 * 3_600_000;
const WINDOW_MS = 21 * 86_400_000;
export const DEFAULT_RIDE = 80;
export const CHIP_TOLERANCE_MIN = 25;

export function rides(d: Derived, nowMs: number): Ride[] {
  const out: Ride[] = [];
  let on: number | null = null;
  for (const e of d.busEvents) {
    if (e.on) { if (on === null) on = e.ts; }
    else if (on !== null) { out.push({ start: on, minutes: Math.min(e.ts - on, TWO_HOURS) / 60_000 }); on = null; }
  }
  if (on !== null && nowMs - on >= TWO_HOURS) out.push({ start: on, minutes: 120 });
  // a ride under five minutes was a misclick
  return out.filter((r) => r.minutes >= 5);
}

const recent = (rs: Ride[], nowMs: number) => rs.filter((r) => nowMs - r.start <= WINDOW_MS);

/** Typical ride length: the middle of your last three weeks' rides; 80 minutes until there are three. */
export function rideMinutes(d: Derived, nowMs: number): number {
  const r = recent(rides(d, nowMs), nowMs).map((x) => x.minutes).sort((a, b) => a - b);
  if (r.length < 3) return DEFAULT_RIDE;
  const mid = r[Math.floor(r.length / 2)];
  return Math.round(Math.max(20, Math.min(120, mid)));
}

/** "On the bus?" around the times you usually tap Bus: two or more recent rides started within 25 minutes of now. */
export function busChip(d: Derived, now: Date): boolean {
  const rs = recent(rides(d, now.getTime()), now.getTime());
  if (rs.length < 3) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const wd = now.getDay();
  const near = rs.filter((r) => {
    const t = new Date(r.start);
    const weekdayMatch = (t.getDay() >= 1 && t.getDay() <= 5) === (wd >= 1 && wd <= 5);
    return weekdayMatch && Math.abs(t.getHours() * 60 + t.getMinutes() - mins) <= CHIP_TOLERANCE_MIN;
  });
  return near.length >= 2;
}
