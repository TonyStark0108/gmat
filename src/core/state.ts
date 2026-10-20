// One pass over the event log gives the facts the screens and the models need.

import type { AppEvent, Answer, ExtraSpec, MixChoice, ReviewStep, Tag } from "./events";
import { DEFAULT_SETTINGS, type LifeBlock, type Settings } from "./settings";
import type { Section } from "./content";
import { addDays, parseYmd, ymd } from "./calendar";

export interface AnswerRec { value: Answer; unsure: boolean; sinceStartMs: number; ts: number; fixed?: boolean }
export interface RcPlace { passage: number; stage: "read" | "prompt" | "questions"; q: number }
export interface ReviewAttempt { attempt: "retry" | "last" | "mixed"; value: Answer; right?: boolean; ts: number; day: string; review: string }
type Of<T extends AppEvent["type"]> = Extract<AppEvent, { type: T }>;

export interface Derived {
  settings: Settings;
  setupDone: boolean;
  setupDay: string | null;
  dayOne: Partial<Record<Of<"dayone">["step"], { ok: boolean; detail?: string; ts: number }>>;
  done: Set<string>;
  doneAt: Map<string, { ts: number; day: string }>;
  started: Map<string, number>;
  startedMode: Map<string, "desk" | "bus">;
  submitted: Map<string, Of<"piece.submitted"> & { day: string }>;
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
  busEvents: { on: boolean; ts: number }[];
  minutesByDay: Map<string, number>;
  minutesBySection: Map<string, number>;
  lateSessions: Set<string>;             // study days with time logged after 23:30
  morningDays: Set<string>;              // days with time logged before 10:00 (a morning slot used)
  totalMinutes: number;
  skipsByDay: Map<string, Set<string>>;
  skips: { piece: string; day: string }[];
  mixByDay: Map<string, MixChoice>;
  timechipByDay: Map<string, number | null>;
  lastSeen: Map<Section, string>;        // last study day a section's piece was worked on
  lastActiveDay: string | null;          // last day you actually did something
  activeDays: string[];                  // every day you did something, in order
  lastBackup: number | null;
  offsiteAt: number | null;
  admin: Map<string, Of<"admin">>;
  lines: Of<"line">[];
  // review and redos
  reviewStarted: Map<string, { items: string[]; ts: number; day: string }>;
  reviewDone: Map<string, { ts: number; day: string }>;
  reviewStep: Map<string, ReviewStep>;
  attempts: Map<string, ReviewAttempt[]>;   // item -> attempts in reviews
  tags: Map<string, { tag: Tag; line?: string; ts: number }>;
  keysEntered: Map<string, string | number[]>;
  keyOverrides: Map<string, string | number[]>;   // "og:47" -> book's answer
  bookChecks: Of<"book.check">[];
  // cards
  introduced: Map<string, { week: string; ts: number }>;
  introWeeks: Set<string>;
  cardRatings: Map<string, { rating: "again" | "good"; ts: number }[]>;
  cardFront: Map<string, string>;
  cardPaused: Set<string>;
  cardDeleted: Set<string>;
  cardSessions: { ts: number; day: string; count: number }[];
  // life
  datechecks: Of<"datecheck">[];
  letgo: Map<string, boolean>;           // task -> keep?
  extras: Map<string, ExtraSpec & { addedTs: number; addedDay: string }>;
  offers: Map<string, Of<"offer">["answer"]>;
  offersAt: Map<string, number>;
  shared: Of<"shared">[];
  deadLinks: Map<string, { why: string; ts: number }>;
  crSwaps: Of<"cr.swap">[];
  videoChecks: Map<string, { status: number; ts: number }>;
  mockMoved: Map<string, string>;
  mockMisses: Map<string, Of<"mock.misses">["misses"]>;
  booking: Of<"booking">[];
  testResult: { score: number | null; ts: number } | null;
  seen: Map<string, number>;
  eventCount: number;
}

const ACTIVE = new Set<AppEvent["type"]>(["answer", "piece.done", "time", "card.rated", "review.answer", "drill", "outside", "piece.started"]);

export function derive(events: AppEvent[], sectionOf: (pieceId: string) => Section | undefined = () => undefined): Derived {
  const d: Derived = {
    settings: structuredClone(DEFAULT_SETTINGS), setupDone: false, setupDay: null, dayOne: {}, done: new Set(), doneAt: new Map(),
    started: new Map(), startedMode: new Map(), submitted: new Map(), answers: new Map(), rcPlace: new Map(), rcLines: new Map(), rcFlags: new Map(),
    video: new Map(), drills: new Map(), outside: new Map(), weeks: new Map(), counted: new Set(), restTapped: new Set(), level: 0,
    bus: { on: false, since: null }, busEvents: [], minutesByDay: new Map(), minutesBySection: new Map(), lateSessions: new Set(), morningDays: new Set(),
    totalMinutes: 0, skipsByDay: new Map(), skips: [], mixByDay: new Map(), timechipByDay: new Map(), lastSeen: new Map(),
    lastActiveDay: null, activeDays: [], lastBackup: null, offsiteAt: null, admin: new Map(), lines: [],
    reviewStarted: new Map(), reviewDone: new Map(), reviewStep: new Map(), attempts: new Map(), tags: new Map(),
    keysEntered: new Map(), keyOverrides: new Map(), bookChecks: [],
    introduced: new Map(), introWeeks: new Set(), cardRatings: new Map(), cardFront: new Map(), cardPaused: new Set(),
    cardDeleted: new Set(), cardSessions: [],
    datechecks: [], letgo: new Map(), extras: new Map(), offers: new Map(), offersAt: new Map(), shared: [], deadLinks: new Map(),
    crSwaps: [], videoChecks: new Map(), mockMoved: new Map(), mockMisses: new Map(), booking: [], testResult: null,
    seen: new Map(), eventCount: events.length,
  };
  const life: LifeBlock[] = [];
  const seen = (piece: string, day: string) => {
    const s = sectionOf(piece);
    if (s && (!d.lastSeen.get(s) || d.lastSeen.get(s)! < day)) d.lastSeen.set(s, day);
  };
  for (const e of events) {
    if (ACTIVE.has(e.type) && (!d.lastActiveDay || e.day > d.lastActiveDay)) { d.lastActiveDay = e.day; d.activeDays.push(e.day); }
    switch (e.type) {
      case "settings": d.settings = { ...d.settings, ...e.patch }; break;
      case "setup.done": d.setupDone = true; d.setupDay ??= e.day; break;
      case "dayone": d.dayOne[e.step] = { ok: e.ok, detail: e.detail, ts: e.ts }; break;
      case "piece.started":
        if (!d.started.has(e.piece)) { d.started.set(e.piece, e.ts); d.startedMode.set(e.piece, e.mode); }
        seen(e.piece, e.day);
        break;
      case "answer": {
        const m = d.answers.get(e.piece) ?? new Map<string, AnswerRec>();
        const prev = m.get(String(e.q));
        // "I entered it wrong" keeps the original timing
        m.set(String(e.q), { value: e.value, unsure: e.unsure, sinceStartMs: e.fix && prev ? prev.sinceStartMs : e.sinceStartMs, ts: e.fix && prev ? prev.ts : e.ts, fixed: e.fix || prev?.fixed });
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
      case "piece.submitted": d.submitted.set(e.piece, { ...e }); break;
      case "piece.done":
        if (!d.done.has(e.piece)) d.doneAt.set(e.piece, { ts: e.ts, day: e.day });
        d.done.add(e.piece); seen(e.piece, e.day);
        break;
      case "line": d.lines.push(e); break;
      case "skip": {
        const s = d.skipsByDay.get(e.day) ?? new Set();
        s.add(e.piece);
        d.skipsByDay.set(e.day, s);
        d.skips.push({ piece: e.piece, day: e.day });
        break;
      }
      case "time": {
        d.minutesByDay.set(e.day, (d.minutesByDay.get(e.day) ?? 0) + e.minutes);
        const sec = e.piece ? sectionOf(e.piece) : undefined;
        if (sec) d.minutesBySection.set(sec, (d.minutesBySection.get(sec) ?? 0) + e.minutes);
        d.totalMinutes += e.minutes;
        const t = new Date(e.ts);
        const mins = t.getHours() * 60 + t.getMinutes();
        if (mins >= 23 * 60 + 30 || mins < 4 * 60) d.lateSessions.add(e.day);
        else if (mins >= 5 * 60 && mins < 10 * 60 && e.where === "desk") d.morningDays.add(e.day);
        break;
      }
      case "bus": d.bus = { on: e.on, since: e.on ? e.ts : null }; d.busEvents.push({ on: e.on, ts: e.ts }); break;
      case "mix": d.mixByDay.set(e.day, e.choice); break;
      case "timechip": d.timechipByDay.set(e.day, e.minutes); break;
      case "week.built": d.weeks.set(e.week, e); break;
      case "week.counted": d.counted.add(e.week); break;
      case "rest.tapped": d.restTapped.add(e.week); break;
      case "level": d.level = Math.max(d.level, e.level); break;
      case "backup": d.lastBackup = e.ts; break;
      case "backup.offsite": d.offsiteAt = e.ts; break;
      // A restore brings in another device's history: week plans are working copies, so they're
      // rebuilt from the restored answers rather than kept from either device.
      case "restored": d.weeks.clear(); break;
      case "admin": d.admin.set(e.piece, e); break;
      // ---- review
      case "review.started": if (!d.reviewStarted.has(e.review)) d.reviewStarted.set(e.review, { items: e.items, ts: e.ts, day: e.day }); break;
      case "review.answer": {
        const a = d.attempts.get(e.item) ?? [];
        a.push({ attempt: e.attempt, value: e.value, right: e.right, ts: e.ts, day: e.day, review: e.review });
        d.attempts.set(e.item, a);
        break;
      }
      case "review.step": d.reviewStep.set(e.review, e.step); break;
      case "review.tag": d.tags.set(e.item, { tag: e.tag, line: e.line, ts: e.ts }); break;
      case "review.done": if (!d.reviewDone.has(e.review)) d.reviewDone.set(e.review, { ts: e.ts, day: e.day }); break;
      case "key.entered": d.keysEntered.set(e.key, e.value); break;
      case "key.override": d.keyOverrides.set(`${e.book}:${e.n}`, e.value); break;
      case "book.check": d.bookChecks.push(e); break;
      // ---- cards
      case "cards.introduced":
        d.introWeeks.add(e.week);
        for (const id of e.ids) if (!d.introduced.has(id)) d.introduced.set(id, { week: e.week, ts: e.ts });
        break;
      case "card.rated": {
        const r = d.cardRatings.get(e.card) ?? [];
        r.push({ rating: e.rating, ts: e.ts });
        d.cardRatings.set(e.card, r);
        break;
      }
      case "card.edited": d.cardFront.set(e.card, e.front); break;
      case "card.paused": if (e.paused) d.cardPaused.add(e.card); else d.cardPaused.delete(e.card); break;
      case "card.deleted": d.cardDeleted.add(e.card); break;
      case "cards.session": d.cardSessions.push({ ts: e.ts, day: e.day, count: e.count }); break;
      // ---- life
      case "lifeup": life.push({ from: e.from, to: e.to, mode: e.kind === "week" ? "light" : "off" }); break;
      case "datecheck": d.datechecks.push(e); break;
      case "letgo": d.letgo.set(e.task, e.keep); break;
      case "extra.added": if (!d.extras.has(e.extra.id)) d.extras.set(e.extra.id, { ...e.extra, addedTs: e.ts, addedDay: e.day }); break;
      case "offer": d.offers.set(e.offer, e.answer); d.offersAt.set(e.offer, e.ts); break;
      case "shared": d.shared.push(e); break;
      case "link.dead": d.deadLinks.set(e.url, { why: e.why, ts: e.ts }); break;
      case "cr.swap": d.crSwaps.push(e); break;
      case "video.check": d.videoChecks.set(e.youtubeId, { status: e.status, ts: e.ts }); break;
      case "mock.moved": d.mockMoved.set(e.piece, e.day); break;
      case "mock.misses": d.mockMisses.set(e.piece, e.misses); break;
      case "booking": d.booking.push(e); if (e.answer === "booked" && e.date) d.settings = { ...d.settings, testDate: e.date }; break;
      case "test.result": d.testResult = { score: e.score, ts: e.ts }; break;
      case "seen": if (!d.seen.has(e.what)) d.seen.set(e.what, e.ts); break;
    }
  }
  if (life.length) d.settings = { ...d.settings, life: [...(d.settings.life ?? []), ...life] };
  return d;
}

/** Bus mode turns itself off after two hours, in case you forget (spec: Bus mode). */
export function busOn(d: Derived, nowMs: number): boolean {
  return d.bus.on && d.bus.since !== null && nowMs - d.bus.since < 2 * 3_600_000;
}

/** Days with nothing done before today, counting back from yesterday (for "Back. That's the whole game."). */
export function gapDays(d: Derived, today: string): number {
  const before = d.activeDays.filter((x) => x < today);
  const last = before[before.length - 1];
  if (!last) return 0;
  let n = 0;
  for (let t = addDays(parseYmd(today), -1); ymd(t) > last; t = addDays(t, -1)) n++;
  return n;
}
