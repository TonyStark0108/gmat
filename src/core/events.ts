// Records are only ever added (build prompt: Build target). Everything on screen is computed
// from this log; a correction is a new event, never an edit.

import type { Settings } from "./settings";
import type { Budget } from "./week";

export type Answer = string | number[] | null;   // a letter, one row per part (Two-Part), or nothing

export type EventBody =
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "setup.done" }
  | { type: "dayone"; step: "persist" | "marker" | "reopened" | "folder" | "accepted"; ok: boolean; detail?: string }
  | { type: "piece.started"; piece: string; mode: "desk" | "bus" }
  | { type: "answer"; piece: string; q: number | string; value: Answer; unsure: boolean; sinceStartMs: number }
  | { type: "rc.line"; piece: string; passage: string; text: string }
  | { type: "rc.flag"; piece: string; q: string; flag: "stumped" | "guessed" | "slow" | null }
  | { type: "rc.place"; piece: string; passage: number; stage: "read" | "prompt" | "questions"; q: number }
  | { type: "video.progress"; piece: string; seconds: number; duration: number }
  | { type: "drill"; piece: string; go: number; right: number; total: number; seconds: number; met: boolean }
  | { type: "outside"; piece: string; right?: number; wrong?: number; unsure?: number; scores?: Record<string, number> }
  | { type: "piece.submitted"; piece: string; wrongOrUnsure: number; answered: number }
  | { type: "piece.done"; piece: string }
  | { type: "line"; source: string; text: string }
  | { type: "skip"; piece: string }
  | { type: "time"; minutes: number; where: Budget; piece?: string; source: string }
  | { type: "bus"; on: boolean }
  | { type: "mix"; choice: MixChoice }
  | { type: "timechip"; minutes: number | null }
  | { type: "week.built"; week: string; chips: { pieceId: string; budget: Budget; carried: boolean }[]; mockDay: string | null; key?: string }
  | { type: "week.counted"; week: string }
  | { type: "rest.tapped"; week: string }
  | { type: "level"; level: number }
  | { type: "backup"; where: "folder" | "download"; file: string }
  | { type: "backup.offsite" }
  | { type: "admin"; piece: string; answer: "done" | "not now" };

export type MixChoice = "mix" | "quant" | "verbal" | "di";

export type AppEvent = EventBody & { id: string; ts: number; day: string };
