// How pieces describe themselves (spec: What every card shows): the subject in its colour, the task,
// the exact pointer, how many questions, about how long, and where it happens.
// Tone rules: no "behind", "overdue", "missed", "should", "must", "still", "only".

import { BOOK_NAMES, type Content, type Section } from "../core/content";
import type { Piece } from "../core/pieces";

export const SUBJECT: Record<Section, { name: string; c: string; t: string; d: string }> = {
  quant: { name: "Quant", c: "var(--q)", t: "var(--q-t)", d: "var(--q-d)" },
  di: { name: "Data Insights", c: "var(--di)", t: "var(--di-t)", d: "var(--di-d)" },
  rc: { name: "Reading", c: "var(--rc)", t: "var(--rc-t)", d: "var(--rc-d)" },
  cr: { name: "Critical Reasoning", c: "var(--cr)", t: "var(--cr-t)", d: "var(--cr-d)" },
  mock: { name: "Mock", c: "var(--mk)", t: "var(--mk-t)", d: "var(--mk-d)" },
  general: { name: "Plan", c: "var(--gen)", t: "var(--gen-t)", d: "var(--gen-d)" },
};

const QTYPE: Record<string, string> = { PS: "problem solving", DS: "data sufficiency", RC: "reading", CR: "critical reasoning", TPA: "two-part" };

export function titleOf(p: Piece): string {
  const t = p.task, ptr = t.pointer;
  switch (t.kind) {
    case "og_set": {
      const book = BOOK_NAMES[ptr.book ?? "og"];
      const what = QTYPE[ptr.qtype ?? ""] ?? "";
      const half = p.of > 1 ? (p.index === 0 ? ", first half" : ", second half") : "";
      return `${book} ${what}${half}`;
    }
    case "rc_section": return "An LSAT reading set";
    case "cr_set": return "An LSAT CR set";
    case "mock": return t.title ?? "Mock";
    case "drill": return t.title ?? "Drill";
    case "gmatclub_set": {
      const base = (t.title ?? "Practice set").replace(/ · \d+ questions$/, "");
      return p.of > 1 ? `${base}, ${p.index === 0 ? "first" : "second"} half` : base;
    }
    default: return t.title ?? "Plan task";
  }
}

/** Printed pages for a range of questions, from the book's own index. */
export function pagesFor(content: Content | null, book: string, a: number, b: number): [number, number] | null {
  const qs = content?.book_keys.books[book as keyof Content["book_keys"]["books"]]?.questions ?? [];
  const pages = qs.filter((q) => q.n >= a && q.n <= b && q.page).map((q) => q.page!) ;
  return pages.length ? [Math.min(...pages), Math.max(...pages)] : null;
}

export function pointerOf(p: Piece, content: Content | null = null): string {
  const t = p.task, ptr = t.pointer;
  if (t.kind === "og_set" && p.numbers) {
    const [a, b] = p.numbers;
    const qs = `questions ${a}–${b}`;
    const pg = pagesFor(content, ptr.book ?? "og", a, b) ?? ptr.book_pages;
    if (ptr.book === "og" && pg) return `${qs} · your book, ${pg[0] === pg[1] ? `page ${pg[0]}` : `pages ${pg[0]}–${pg[1]}`}`;
    return `${qs} · ${BOOK_NAMES[ptr.book ?? "og"]} (on screen)`;
  }
  if (t.kind === "rc_section") return `${ptr.source ?? ""} · 4 passages`.replace(/\s+/g, " ").trim();
  if (t.kind === "cr_set") return `${ptr.label ?? ""} · ${ptr.count ?? 25} questions, one sitting`;
  if (t.kind === "drill") return t.target ? `the worksheet · target ${t.target.count} at 100%${t.target.minutes ? `, under ${t.target.minutes} min` : ""}` : "the worksheet";
  if (t.kind === "gmatclub_set" && p.count) return `work down the list · ${p.count} you haven't done`;
  if (t.kind === "di_set" && ptr.recipe?.length) return ptr.recipe.map((r) => `${r.count} from ${r.source}`).join(" · ");
  return "";
}

export function whereOf(p: Piece): string {
  const t = p.task;
  switch (t.kind) {
    case "video": return "plays here";
    case "rc_section": return "reads here";
    case "og_set": return t.pointer.book === "og" ? "in the book" : "on screen";
    case "drill": return "in your notebook";
    case "cr_set": case "gmatclub_set": return "opens GMAT Club";
    case "di_set": return "book and links";
    case "mock": return t.pointer.type === "official_mock" ? "opens mba.com" : "opens GMAT Club";
    case "admin": return "opens the page";
    default: return "opens the page";
  }
}

export function metaOf(p: Piece): string {
  const n = p.count && ["og_set", "rc_section", "cr_set", "gmatclub_set", "di_set"].includes(p.task.kind) ? `${p.count} questions · ` : "";
  return `${n}about ${p.minutes} minutes`;
}

export const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
export const words = (n: number) => (n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));
