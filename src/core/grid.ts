// The answer grid: typed entry and marking against the book's key.

import type { Answer } from "./events";

export interface Typed { n: number; value: Answer; unsure: boolean }

/**
 * "77c" → question 77, C. "77cs" or "77c?" → not sure. "77 c" works too.
 * Two-Part: "415 2 4" (row per column), "415 24", with "s" or "?" at the end for not sure.
 */
export function parseTyped(input: string, opts: { twoPart?: (n: number) => number | undefined } = {}): Typed | null {
  const s = input.trim().toLowerCase();
  let m = s.match(/^(\d{1,3})\s*([a-e])\s*(s|\?)?$/);
  if (m) return { n: Number(m[1]), value: m[2].toUpperCase(), unsure: !!m[3] };
  m = s.match(/^(\d{1,3})\s+(\d)\s*(\d)\s*(s|\?)?$/) ?? s.match(/^(\d{1,3})\s+(\d)\s+(\d)\s*(s|\?)?$/);
  if (m && opts.twoPart?.(Number(m[1]))) {
    const rows = opts.twoPart(Number(m[1]))!;
    const a = Number(m[2]), b = Number(m[3]);
    if (a >= 1 && b >= 1 && a <= rows && b <= rows) return { n: Number(m[1]), value: [a, b], unsure: !!m[4] };
  }
  return null;
}

export type Mark = "right" | "wrong" | "unanswered";

export function markOne(value: Answer, key: string | number[] | null | undefined): Mark | "unknown" {
  if (value === null || value === undefined) return "unanswered";
  if (key === null || key === undefined) return "unknown";          // flagged: ask the book's key
  if (Array.isArray(key)) {
    // Two-Part counts as right only if every part is right, as on the real exam.
    return Array.isArray(value) && value.length === key.length && value.every((v, i) => v === key[i]) ? "right" : "wrong";
  }
  return value === key ? "right" : "wrong";
}

export interface SetMarks { right: number; wrong: number; unsure: number; unanswered: number; unknown: number; toLookAgain: number }

/** "Six to look at again": wrong answers and not-sure ones, so the count isn't a score. */
export function markSet(entries: { value: Answer; unsure: boolean; key: string | number[] | null | undefined }[]): SetMarks {
  const r: SetMarks = { right: 0, wrong: 0, unsure: 0, unanswered: 0, unknown: 0, toLookAgain: 0 };
  for (const e of entries) {
    const m = markOne(e.value, e.key);
    if (m === "right") r.right++;
    else if (m === "wrong") r.wrong++;
    else if (m === "unanswered") r.unanswered++;
    else r.unknown++;
    if (e.unsure) r.unsure++;
    if (m === "wrong" || m === "unanswered" || e.unsure) r.toLookAgain++;
  }
  return r;
}

export const NUMBER_WORDS = ["Nothing", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
export const inWords = (n: number) => (n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));
