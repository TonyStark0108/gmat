// Records are only ever added (build prompt: Build target). Everything on screen is computed
// from this log; a correction is a new event, never an edit.

import type { BookId, Section } from "./content";
import type { Settings } from "./settings";
import type { Budget } from "./week";

export type Answer = string | number[] | null;   // a letter, one row per part (Two-Part), or nothing

export type Tag =
  | "concept" | "process" | "careless" | "timing"                                // quant, DI
  | "contradicts the passage" | "not supported" | "out of scope" | "too narrow"   // RC, CR
  | "only half" | "too strong or weak" | "wrong comparison" | "right words, wrong meaning";

/** Work outside the plan: top-ups, help chips, the week's extra practice, drill repeats… */
export interface ExtraSpec {
  id: string;
  kind: "topup" | "extra" | "lean" | "help" | "careless" | "approach" | "keepsharp" | "rebuild" | "tutor"
    | "check" | "timing" | "recall" | "recap";
  week: string;                 // the study week it belongs to (its Monday)
  section: Section;
  topic: string | null;
  title: string;
  minutes: number;
  /** what it opens: a GMAT Club list, a video, an article, cards on a topic */
  open: { type: "list"; urls: { label: string; url: string }[]; count: number }
      | { type: "video"; youtubeId: string; url: string }
      | { type: "link"; url: string }
      | { type: "cards"; topic: string }
      | { type: "rc"; section: string }
      | { type: "book"; book: BookId; qtype: string; numbers: number[] }
      | { type: "recall"; sweep?: string; bus: boolean }      // your error log from memory (weekly, or before a mock)
      | { type: "recap"; week: string };                      // the week's cards, mixed
  refresher?: { type: "video"; youtubeId: string; url: string; title: string } | { type: "cards"; topic: string };
  hidden?: boolean;             // the week's extra chip waits until every required chip is done
  reason?: string;
}

export interface MockMiss { section: "quant" | "verbal" | "di"; topic: string; tag: Tag }

export type EventBody =
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "setup.done" }
  | { type: "dayone"; step: "persist" | "marker" | "reopened" | "folder" | "accepted"; ok: boolean; detail?: string }
  | { type: "piece.started"; piece: string; mode: "desk" | "bus" }
  | { type: "answer"; piece: string; q: number | string; value: Answer; unsure: boolean; sinceStartMs: number; fix?: boolean }
  | { type: "rc.line"; piece: string; passage: string; text: string }
  | { type: "rc.flag"; piece: string; q: string; flag: "stumped" | "guessed" | "slow" | null }
  | { type: "rc.place"; piece: string; passage: number; stage: "read" | "prompt" | "questions"; q: number }
  | { type: "video.progress"; piece: string; seconds: number; duration: number }
  | { type: "drill"; piece: string; go: number; right: number; total: number; seconds: number; met: boolean }
  | { type: "outside"; piece: string; right?: number; wrong?: number; unsure?: number; scores?: Record<string, number>; byType?: Record<string, { right: number; wrong: number; unsure: number }> }
  | { type: "piece.submitted"; piece: string; wrongOrUnsure: number; answered: number }
  | { type: "piece.done"; piece: string }
  | { type: "line"; source: string; text: string; front?: string; topic?: string; section?: Section }
  | { type: "skip"; piece: string }
  | { type: "time"; minutes: number; where: Budget; piece?: string; source: string }
  | { type: "bus"; on: boolean }
  | { type: "mix"; choice: MixChoice }
  | { type: "timechip"; minutes: number | null }
  | { type: "week.built"; week: string; chips: { pieceId: string; budget: Budget; carried: boolean }[]; mockDay: string | null; key?: string; light?: boolean }
  | { type: "week.counted"; week: string }
  | { type: "rest.tapped"; week: string }
  | { type: "level"; level: number }
  | { type: "backup"; where: "folder" | "download"; file: string }
  | { type: "backup.offsite" }
  | { type: "restored"; added: number }
  | { type: "admin"; piece: string; answer: "done" | "not now" }
  // ---- the review, redos and corrections (spec: After a set; The life of a wrong answer)
  | { type: "review.started"; review: string; items: string[] }
  | { type: "review.answer"; review: string; item: string; attempt: "retry" | "last" | "mixed" | "recall"; value: Answer; right?: boolean }
  | { type: "review.step"; review: string; step: ReviewStep }
  | { type: "review.tag"; item: string; tag: Tag; line?: string }
  | { type: "review.done"; review: string }
  | { type: "key.entered"; key: string; value: string | number[] }           // a key you typed in: "cr:<url>" or "book:og:47"
  | { type: "key.override"; book: BookId; n: number; value: string | number[] } // "My book says…"
  | { type: "book.check"; scope: string; what: "page" | "spot" | "checkmode"; ok: boolean; page?: number; n?: number }
  // ---- flashcards
  | { type: "cards.introduced"; week: string; ids: string[] }
  | { type: "card.rated"; card: string; rating: "again" | "good" }
  | { type: "card.edited"; card: string; front: string }
  | { type: "card.paused"; card: string; paused: boolean }
  | { type: "card.deleted"; card: string }
  | { type: "cards.session"; count: number; where: Budget }
  | { type: "cards.offered"; day: string; ids: string[] }                   // the day's new cards, offered once a day
  | { type: "card.kept"; card: string; keep: boolean }                       // a suggested card: keep it or skip it
  | { type: "card.drafted"; item: string; front: string; back: string }      // Claude's draft of a card from a mistake
  // ---- worth another look: a question you got right that you want back (or one the app flags)
  | { type: "look"; item: string; on: boolean }
  // ---- when life happens
  | { type: "lifeup"; kind: "tonight" | "weekend" | "week"; from: string; to: string }
  | { type: "datecheck"; week: string; result: "safe" | "risk" | "past"; projected: string | null; target: string | null; extra?: number | null; choice?: "move" | "keep" | "fit" | "later" }
  | { type: "letgo"; task: string; keep: boolean }
  // ---- extras, sharing in, links
  | { type: "extra.added"; extra: ExtraSpec }
  | { type: "offer"; offer: string; answer: "add" | "notnow" | "yes" | "no" }
  | { type: "shared"; url: string; set: string | null; topic: string | null; section: Section; note?: string }
  | { type: "qlog"; source: string; qtype: string; topic?: string | null; result: "right" | "wrong"; unsure: boolean; seconds?: number | null; ref?: string; url?: string }
  | { type: "link.dead"; url: string; why: string }
  | { type: "cr.swap"; set: string; n: number; url: string }
  | { type: "video.check"; youtubeId: string; status: number }
  // ---- mocks and the end game
  | { type: "mock.moved"; piece: string; day: string }
  | { type: "mock.misses"; piece: string; misses: MockMiss[] }
  | { type: "booking"; answer: "notyet" | "booked"; date?: string }
  | { type: "test.result"; score: number | null }
  | { type: "seen"; what: string }
  // ---- the tutor (what it learns about you, and what it costs)
  | { type: "tutor.note"; text: string }
  | { type: "tutor.usage"; thread: string; model: string; input: number; output: number; cacheRead: number; cacheWrite: number; usd: number };

export type ReviewStep = "retry" | "dots" | "last" | "key" | "answers" | "tags" | "close";
export type MixChoice = "mix" | "quant" | "verbal" | "di";

export type AppEvent = EventBody & { id: string; ts: number; day: string };
