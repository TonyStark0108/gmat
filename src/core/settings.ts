import type { Section } from "./content";

// Every setting, pre-filled with the spec's defaults (spec: Your dates; decisions.md).

export interface Slot { days: number[]; start: string; end: string } // days: 0 Sun … 6 Sat
export interface Pause { from: string; to: string }                   // inclusive, YYYY-MM-DD
/** "Something came up": days with no time ("off") or a light bus week ("light"). Set from events. */
export interface LifeBlock { from: string; to: string; mode: "off" | "light" }

export interface Settings {
  startDate: string;
  saturday: Slot & { enabled: boolean };
  mornings: Slot;
  busCounts: boolean;
  busMinutesPerWeekday: number;       // until rides teach the app (Phase 2)
  finishDate: string | null;          // null = worked out from the budgets
  pauses: Pause[];
  bookBy: string;
  hardStop: string;
  testDate: string | null;
  focusMin: number;
  breakMin: number;
  practiceRun: boolean;
  bookEdition: string;
  verbalReviewOnBus: boolean;
  lateNight: string;
  sundayNote: boolean;
  /** The finish date the plan was agreed at (setup, or the last date-check choice); the date check compares with it. */
  agreedFinish: string | null;
  /** "Keep the date, do what fits": reading and CR go to the bus only. */
  fitMode: boolean;
  /** Filled in from "something came up" events, never typed. */
  life: LifeBlock[];
  /** Rebuild weeks: that week, the section's new plan work waits while its basics come back. */
  rebuild: { week: string; section: Section }[];
}

export const DEFAULT_SETTINGS: Settings = {
  startDate: "2026-12-01",
  saturday: { enabled: true, days: [6], start: "10:00", end: "14:00" },
  mornings: { days: [2, 3, 4], start: "07:45", end: "08:30" },
  busCounts: true,
  busMinutesPerWeekday: 80,
  finishDate: null,
  pauses: [{ from: "2026-12-24", to: "2027-01-01" }],
  bookBy: "2027-07-01",
  hardStop: "2027-08-31",
  testDate: null,
  focusMin: 50,
  breakMin: 10,
  practiceRun: false,
  bookEdition: "2025–2026",
  verbalReviewOnBus: true,
  lateNight: "23:00",
  sundayNote: true,
  agreedFinish: null,
  fitMode: false,
  life: [],
  rebuild: [],
};

export const PLAN_SHARE = 0.85;          // the free 15% (spec: The week)
export const WEEK_CAP_MIN = 15 * 60;     // never more than 15 hours a week
export const LIGHT_WEEK_BUS_MIN = 270;   // a light bus week: 4–5 hours of reading, videos and cards
export const TARGET = 665;               // the score the plan aims at
