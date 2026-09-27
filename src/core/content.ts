// Shapes of the content file the importer writes (data/gmat-content-v1.json).

export type Section = "quant" | "di" | "rc" | "cr" | "mock" | "general";
export type Kind =
  | "video" | "article" | "rc_section" | "og_set" | "drill" | "di_set" | "cr_set"
  | "gmatclub_set" | "mock" | "cards" | "admin" | "test_prep";
export type Optionality = "core" | "recommended" | "optional" | "very optional" | "setting";
export type BookId = "og" | "qr" | "vr" | "dir";
export type QType = "PS" | "DS" | "TPA" | "RC" | "CR";

export interface Pointer {
  type: string;
  url?: string;
  youtube_id?: string;
  book?: BookId;
  qtype?: QType;
  numbers?: [number, number] | null;
  count?: number;
  book_pages?: [number, number] | null;
  passage_groups?: [number, number][];
  flagged?: number[];
  section?: string;          // LSAT RC section id
  set?: string;              // LSAT CR set id
  label?: string;
  lists?: Record<string, string>;
  lists_pool?: { topic: string | null; qtype: string; url: string }[];
  stand_in_for?: string;
  recipe?: { source: string; url?: string; count: number; numbers?: [number, number]; types?: string[] }[];
  exam?: number | null;
  practice_run?: boolean;
  [k: string]: unknown;
}

export interface Task {
  id: string;
  plan_week: number;
  section: Section;
  kind: Kind;
  title: string | null;
  optional: Optionality;
  est_minutes: number;
  review_minutes: number;
  needs_desk: boolean;
  bus_ok: boolean;
  offline_ok: boolean;
  bus_switch?: string;
  break_points: ({ numbers?: [number, number]; count?: number; at?: string } )[] | null;
  depends_on: string[];
  pointer: Pointer;
  target: { accuracy: number; count: number; minutes: number | null } | null;
  benchmark_week: number;
  alternatives: { title: string; url: string }[];
  source_text?: string;
  timed?: boolean;
  topic?: string;
  setting?: string;
}

export interface RcQuestion {
  id: string;
  n: number;
  stem: string;
  choices: Record<string, string>;
  answer: string;
  type: string;
  line_ref: boolean;
  line_span?: { exact: boolean; spans: { paragraph: number; start: number; end: number }[] } | null;
}
export interface RcPassage { id: string; topic: string; paragraphs: string[]; questions: RcQuestion[] }
export interface RcSection { id: string; source: string; question_count: number; passages: RcPassage[] }

export interface BookQuestion {
  n: number;
  section: QType;
  answer: string | number[] | null;
  options?: number;
  difficulty?: string;
  concept?: string;
  page?: number | null;
  flagged?: string;
}
export interface Book { meta: { book: BookId; name: string; edition: string | null }; questions: BookQuestion[] }

export interface CrSet { id: string; label: string; size: number; questions: { n: number; url: string }[] }

export interface Content {
  format: "gmat-content";
  version: string;
  plan: { tasks: Task[]; settings_defaults: Record<string, boolean>; section_text: unknown; help: unknown };
  rc_bank: { sections: RcSection[] };
  cr_bank: { default_sets: CrSet[]; reserve_sets: CrSet[]; has_official_answers: boolean };
  book_keys: { books: Record<BookId, Book> };
  links: { links: unknown[] };
  benchmarks: { rules: unknown[] };
  decks: { quant_facts: { id: string; front: string; back: string }[]; method: { id: string; front: string; back: string }[] };
}

export function isContent(x: unknown): x is Content {
  const c = x as Content;
  return !!c && c.format === "gmat-content" && Array.isArray(c.plan?.tasks) && Array.isArray(c.rc_bank?.sections);
}

export const BOOK_NAMES: Record<BookId, string> = { og: "OG", qr: "Quant Review", vr: "Verbal Review", dir: "DI Review" };
