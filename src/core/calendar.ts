// Days, weeks, slots and how much time each holds. All local time.

import { PLAN_SHARE, WEEK_CAP_MIN, type Settings } from "./settings";

const DAY_MS = 86_400_000;
// A session that starts late on Sunday still belongs to that week until 4:00 on Monday.
const DAY_ROLLOVER_H = 4;

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** The calendar day a moment belongs to (before 4 am counts as the day before). */
export function studyDay(t: Date): string {
  return ymd(new Date(t.getTime() - DAY_ROLLOVER_H * 3_600_000));
}

/** Monday (YYYY-MM-DD) of the study week containing a day. */
export function weekStartOf(day: string): string {
  const d = parseYmd(day);
  const back = (d.getDay() + 6) % 7; // Mon 0 … Sun 6
  return ymd(addDays(d, -back));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / DAY_MS);
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function inPause(day: string, s: Settings): boolean {
  return s.pauses.some((p) => day >= p.from && day <= p.to);
}

export interface DayCapacity { desk: number; bus: number }

/** Raw minutes of desk and bus time on a day (before the 85% plan share). */
export function dayCapacity(day: string, s: Settings, busMinutes = s.busMinutesPerWeekday): DayCapacity {
  if (day < s.startDate || inPause(day, s)) return { desk: 0, bus: 0 };
  const wd = parseYmd(day).getDay();
  let desk = 0;
  if (s.saturday.enabled && s.saturday.days.includes(wd)) desk += minutesOf(s.saturday.end) - minutesOf(s.saturday.start);
  if (s.mornings.days.includes(wd)) desk += minutesOf(s.mornings.end) - minutesOf(s.mornings.start);
  const bus = s.busCounts && wd >= 1 && wd <= 5 ? busMinutes : 0;
  return { desk, bus };
}

export interface WeekCapacity { desk: number; bus: number; rawDesk: number; rawBus: number }

/** Plan minutes a week can hold: 85% of each budget, never more than 15 hours in total. */
export function weekCapacity(weekStart: string, s: Settings, busMinutes?: number, fromDay?: string): WeekCapacity {
  let rawDesk = 0, rawBus = 0;
  for (let i = 0; i < 7; i++) {
    const day = ymd(addDays(parseYmd(weekStart), i));
    if (fromDay && day < fromDay) continue;
    const c = dayCapacity(day, s, busMinutes);
    rawDesk += c.desk;
    rawBus += c.bus;
  }
  // The 15-hour ceiling applies to the whole week; rides give way first.
  if (rawDesk + rawBus > WEEK_CAP_MIN) rawBus = Math.max(0, WEEK_CAP_MIN - rawDesk);
  rawDesk = Math.min(rawDesk, WEEK_CAP_MIN);
  return { desk: rawDesk * PLAN_SHARE, bus: rawBus * PLAN_SHARE, rawDesk, rawBus };
}

export type SlotKind = "saturday" | "morning";
export interface SlotNow { kind: SlotKind; endsAt: Date; minutesLeft: number }

/** Is this moment inside one of the desk slots? */
export function slotAt(t: Date, s: Settings): SlotNow | null {
  const day = ymd(t);
  if (day < s.startDate || inPause(day, s)) return null;
  const wd = t.getDay();
  const mins = t.getHours() * 60 + t.getMinutes();
  const check = (slot: { days: number[]; start: string; end: string }, kind: SlotKind): SlotNow | null => {
    if (!slot.days.includes(wd)) return null;
    const a = minutesOf(slot.start), b = minutesOf(slot.end);
    if (mins < a || mins >= b) return null;
    const endsAt = new Date(t);
    endsAt.setHours(Math.floor(b / 60), b % 60, 0, 0);
    return { kind, endsAt, minutesLeft: b - mins };
  };
  return (s.saturday.enabled ? check(s.saturday, "saturday") : null) ?? check(s.mornings, "morning");
}

export function isLateNight(t: Date, s: Settings): boolean {
  const mins = t.getHours() * 60 + t.getMinutes();
  return mins >= minutesOf(s.lateNight) || mins < DAY_ROLLOVER_H * 60;
}

/** The next desk slot that starts after a moment (used for "back on Thursday"). */
export function nextDeskSlot(t: Date, s: Settings, withinDays = 14): { day: string; kind: SlotKind } | null {
  for (let i = 1; i <= withinDays; i++) {
    const day = ymd(addDays(t, i));
    if (day < s.startDate || inPause(day, s)) continue;
    const wd = parseYmd(day).getDay();
    if (s.mornings.days.includes(wd)) return { day, kind: "morning" };
    if (s.saturday.enabled && s.saturday.days.includes(wd)) return { day, kind: "saturday" };
  }
  return null;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function longDate(day: string): string {
  const d = parseYmd(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function shortDate(day: string): string {
  const d = parseYmd(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
