// One pass over the event log gives everything the screens need.

import type { AppEvent, Answer, MixChoice } from "./events";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import type { Section } from "./content";

export interface AnswerRec { value: Answer; unsure: boolean; sinceStartMs: number; ts: number }
export interface RcPlace { passage: number; stage: "read" | "prompt" | "questions"; q: number }
type Of<T extends AppEvent["type"]> = Extract<AppEvent, { type: T }>;

export interface Derived {
  settings: Settings;
  setupDone: boolean;
  dayOne: Partial<Record<Of<"dayone">["step"], { ok: boolean; detail?: string; ts: number }>>;
  done: Set<string>;
  started: Map<string, number>;
  submitted: Map<string, Of<"piece.submitted">>;
  answers: Map<string, Map<string, AnswerRec>>;
  rcPlace: Map<string, RcPlace>;
  rcLines: Map<string, string>;          // passage id -> the one line
  rcFlags: Map<string, Map<string, Of<"rc.flag">["flag"]>>;
  video: Map<string, { seconds: number; duration: number }>;
  drills: Map<string, Of<"drill">[]>;
  outside: Map<string, Of<"outside">>;
  weeks: Map<string, Of<"week.built">>;
  counted: Set<string>;
  restTapped: Set<string>;
  level: number;
  bus: { on: boolean; since: number | null };
  minutesByDay: Map<string, number>;
  totalMinutes: number;
  skipsByDay: Map<string, Set<string>>;
  mixByDay: Map<string, MixChoice>;
  timechipByDay: Map<string, number | null>;
  lastSeen: Map<Section, string>;        // last study day a section's piece was worked on
  lastBackup: number | null;
  offsiteAt: number | null;
  admin: Map<string, Of<"admin">>;
  lines: Of<"line">[];
  eventCount: number;
}

export function derive(events: AppEvent[], sectionOf: (pieceId: string) => Section | undefined = () => undefined): Derived {
  const d: Derived = {
    settings: structuredClone(DEFAULT_SETTINGS), setupDone: false, dayOne: {}, done: new Set(), started: new Map(),
    submitted: new Map(), answers: new Map(), rcPlace: new Map(), rcLines: new Map(), rcFlags: new Map(), video: new Map(),
    drills: new Map(), outside: new Map(), weeks: new Map(), counted: new Set(), restTapped: new Set(), level: 0,
    bus: { on: false, since: null }, minutesByDay: new Map(), totalMinutes: 0, skipsByDay: new Map(),
    mixByDay: new Map(), timechipByDay: new Map(), lastSeen: new Map(), lastBackup: null, offsiteAt: null,
    admin: new Map(), lines: [], eventCount: events.length,
  };
  const seen = (piece: string, day: string) => {
    const s = sectionOf(piece);
    if (s && (!d.lastSeen.get(s) || d.lastSeen.get(s)! < day)) d.lastSeen.set(s, day);
  };
  for (const e of events) {
    switch (e.type) {
      case "settings": d.settings = { ...d.settings, ...e.patch }; break;
      case "setup.done": d.setupDone = true; break;
      case "dayone": d.dayOne[e.step] = { ok: e.ok, detail: e.detail, ts: e.ts }; break;
      case "piece.started": if (!d.started.has(e.piece)) d.started.set(e.piece, e.ts); seen(e.piece, e.day); break;
      case "answer": {
        const m = d.answers.get(e.piece) ?? new Map<string, AnswerRec>();
        m.set(String(e.q), { value: e.value, unsure: e.unsure, sinceStartMs: e.sinceStartMs, ts: e.ts });
        d.answers.set(e.piece, m);
        break;
      }
      case "rc.line": d.rcLines.set(e.passage, e.text); break;
      case "rc.flag": {
        const m = d.rcFlags.get(e.piece) ?? new Map();
        m.set(e.q, e.flag);
        d.rcFlags.set(e.piece, m);
        break;
      }
      case "rc.place": d.rcPlace.set(e.piece, { passage: e.passage, stage: e.stage, q: e.q }); break;
      case "video.progress": d.video.set(e.piece, { seconds: e.seconds, duration: e.duration }); break;
      case "drill": d.drills.set(e.piece, [...(d.drills.get(e.piece) ?? []), e]); break;
      case "outside": d.outside.set(e.piece, e); break;
      case "piece.submitted": d.submitted.set(e.piece, e); break;
      case "piece.done": d.done.add(e.piece); seen(e.piece, e.day); break;
      case "line": d.lines.push(e); break;
      case "skip": {
        const s = d.skipsByDay.get(e.day) ?? new Set();
        s.add(e.piece);
        d.skipsByDay.set(e.day, s);
        break;
      }
      case "time":
        d.minutesByDay.set(e.day, (d.minutesByDay.get(e.day) ?? 0) + e.minutes);
        d.totalMinutes += e.minutes;
        break;
      case "bus": d.bus = { on: e.on, since: e.on ? e.ts : null }; break;
      case "mix": d.mixByDay.set(e.day, e.choice); break;
      case "timechip": d.timechipByDay.set(e.day, e.minutes); break;
      case "week.built": d.weeks.set(e.week, e); break;
      case "week.counted": d.counted.add(e.week); break;
      case "rest.tapped": d.restTapped.add(e.week); break;
      case "level": d.level = Math.max(d.level, e.level); break;
      case "backup": d.lastBackup = e.ts; break;
      case "backup.offsite": d.offsiteAt = e.ts; break;
      case "admin": d.admin.set(e.piece, e); break;
    }
  }
  return d;
}

/** Bus mode turns itself off after two hours, in case you forget (spec: Bus mode). */
export function busOn(d: Derived, nowMs: number): boolean {
  return d.bus.on && d.bus.since !== null && nowMs - d.bus.since < 2 * 3_600_000;
}
