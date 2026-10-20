// Pieces shared by the review screens: picking an answer, the dots, the tags.

import { useState } from "react";
import type { Answer, Tag } from "../../core/events";
import type { Item } from "../../core/review";
import { TwoPartPicker } from "../tasks/Grid";

export const QUANT_TAGS: Tag[] = ["concept", "process", "careless", "timing"];
export const VERBAL_TAGS: Tag[] = ["contradicts the passage", "not supported", "out of scope", "too narrow", "only half", "too strong or weak", "wrong comparison", "right words, wrong meaning"];
export const tagsFor = (it: Item) => (it.group === "Q" ? QUANT_TAGS : VERBAL_TAGS);

export const LETTERS = ["A", "B", "C", "D", "E"];

export function showAnswer(a: Answer | undefined): string {
  if (a === null || a === undefined) return "—";
  if (Array.isArray(a)) return `column 1: row ${a[0]}, column 2: row ${a[1]}`;
  return a;
}

export function isTwoPart(it: Item): boolean {
  return Array.isArray(it.key) || Array.isArray(it.first);
}

/** A–E (or one row per column for Two-Part). The parent handles the keyboard. */
export function AnswerPick({ it, value, onPick, color }: { it: Item; value: Answer; onPick: (v: Answer) => void; color: string }) {
  if (isTwoPart(it)) {
    return <TwoPartPicker rows={6} value={Array.isArray(value) ? value : null} color={color} onPick={(v) => onPick(v)} />;
  }
  return (
    <div className="row" style={{ gap: 6 }}>
      {LETTERS.map((L) => {
        const on = value === L;
        return <button key={L} className="letter" aria-pressed={on} onClick={() => onPick(L)}
          style={{ background: on ? color : "#fff", color: on ? "var(--paper)" : "var(--ink)", borderColor: on ? color : "var(--line-2)" }}>{L}</button>;
      })}
    </div>
  );
}

export function Dot({ right }: { right: boolean }) {
  return <span aria-label={right ? "right" : "look again"} style={{ display: "inline-block", width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--ink)", background: right ? "var(--ink)" : "transparent" }} />;
}

export function TagPick({ it, value, line, onTag, onLine }: { it: Item; value: Tag | null; line: string; onTag: (t: Tag) => void; onLine: (s: string) => void }) {
  const tags = tagsFor(it);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        {tags.map((t, i) => (
          <button key={t} className="chip" onClick={() => onTag(t)} title={`${i + 1}`}
            style={{ border: `1.5px solid ${value === t ? "var(--ink)" : "var(--line-2)"}`, background: value === t ? "var(--ink)" : "transparent", color: value === t ? "var(--paper)" : "var(--ink-2)", minHeight: 40 }}>
            {t}
          </button>
        ))}
      </div>
      <input value={line} onChange={(e) => onLine(e.target.value)} placeholder="Next time I'll… (optional; it becomes a card)"
        style={{ height: 44, border: "none", borderBottom: "1.5px solid var(--line-3)", background: "transparent", fontSize: 17, outline: "none" }} />
    </div>
  );
}

/** "BDACE…": one line of letters for a whole set. */
export function KeyLine({ count, onDone, hint }: { count: number; onDone: (letters: string[]) => void; hint: string }) {
  const [v, setV] = useState("");
  const letters = v.toUpperCase().replace(/[^A-E]/g, "").split("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="small">{hint}</div>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={"BDACE".repeat(Math.ceil(count / 5)).slice(0, count)}
        onKeyDown={(e) => { if (e.key === "Enter" && letters.length === count) onDone(letters); }}
        style={{ height: 48, border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "0 12px", font: "400 16px var(--mono)", letterSpacing: ".2em", background: "#fff" }} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="tiny">{letters.length} of {count}</span>
        <button className="btn small" disabled={letters.length !== count} onClick={() => onDone(letters)}>Mark it</button>
      </div>
    </div>
  );
}
