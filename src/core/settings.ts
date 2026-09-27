// Every setting, pre-filled with the spec's defaults (spec: Your dates; decisions.md).

export interface Slot { days: number[]; start: string; end: string } // days: 0 Sun … 6 Sat
export interface Pause { from: string; to: string }                   // inclusive, YYYY-MM-DD

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
};

export const PLAN_SHARE = 0.85;          // the free 15% (spec: The week)
export const WEEK_CAP_MIN = 15 * 60;     // never more than 15 hours a week
