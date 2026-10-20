// The Sunday note (spec: The Sunday note). Inside the app on Sunday evening or Monday, with a Share
// button. A week that counted: "Week 5 is done." A week that didn't: "Week 5 is closed." Never "not
// done" or "missed".

import { daysBetween, parseYmd, plusDays, weekStartOf } from "./calendar";
import { inWords } from "./grid";

export interface SundayFacts {
  weekStart: string;
  weekNumber: number;
  counted: boolean;
  minutes: number;
  retiredThisWeek: number;
  chipsMoved: number;
  nextShape: string | null;
  purchaseDue: string | null;
  deadLinks: number;
  leans: string | null;
  level: string | null;
  morningsSkipped: boolean;
}

/** Which week's note shows now, if any: Sunday from 5 pm for this week, Monday for the one just gone. */
export function noteWeek(now: Date, today: string): string | null {
  const wd = now.getDay();
  if (wd === 0 && now.getHours() >= 17) return weekStartOf(today);
  if (wd === 1) return plusDays(weekStartOf(today), -7);
  return null;
}

export function weekNumber(weekStart: string, startDate: string): number {
  return Math.floor(daysBetween(weekStartOf(startDate), weekStart) / 7) + 1;
}

export function sundayLines(f: SundayFacts): string[] {
  const hours = Math.round(f.minutes / 60);
  const h = hours >= 1 ? ` ${hours} ${hours === 1 ? "hour" : "hours"} banked.` : "";
  const out: string[] = [];
  if (f.counted) out.push(`Week ${f.weekNumber} is done.${h}${f.retiredThisWeek ? ` ${inWords(f.retiredThisWeek)} ${f.retiredThisWeek === 1 ? "error" : "errors"} retired.` : ""}`);
  else out.push(`Week ${f.weekNumber} is closed.${h}${f.chipsMoved ? ` ${inWords(f.chipsMoved)} ${f.chipsMoved === 1 ? "chip" : "chips"} moved to next week.` : ""}`);
  if (f.level) out.push(f.level);
  if (f.nextShape) out.push(f.nextShape);
  if (f.leans) out.push(f.leans);
  if (f.purchaseDue) out.push(f.purchaseDue);
  if (f.deadLinks) out.push(f.deadLinks === 1 ? "One broken link was swapped out." : `${inWords(f.deadLinks)} broken links were swapped out.`);
  if (f.morningsSkipped) out.push("Quant reviews waited for Saturday. A morning or two brings them closer.");
  return out;
}

export const weekEndMs = (weekStart: string) => parseYmd(plusDays(weekStart, 7)).getTime() + 4 * 3_600_000;
