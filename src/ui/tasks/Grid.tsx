// The answer grid for book sets (spec: OG book set; Making sure the book and the PDF agree).
// Letters (or one pick per part for Two-Part), "not sure", typed "77c" / "77cs". Every entry is
// saved the moment it's made. Entering as you go times each question without a visible clock.

import { useMemo, useRef, useState } from "react";
import type { AnswerRec } from "../../core/state";
import { useApp } from "../../app/store";
import { now } from "../../core/clock";
import { BOOK_NAMES, type BookQuestion } from "../../core/content";
import { markSet, parseTyped } from "../../core/grid";
import type { Answer } from "../../core/events";
import type { Piece } from "../../core/pieces";
import { record } from "../../data/db";
import { Back, Screen, useKeys } from "../bits";
import { SUBJECT, pointerOf, titleOf } from "../copy";
import { useFocus, useTaskTime } from "../focus";
import type { Logged } from "./TaskRunner";

const LETTERS = ["A", "B", "C", "D", "E"];

export function BookGrid({ piece, onDone, numbers, bookId, embedded, onSubmitted }: {
  piece: Piece; onDone?: (l: Logged | null) => void;
  numbers?: [number, number]; bookId?: string; embedded?: boolean; onSubmitted?: () => void;
}) {
  const { content, d, pieces } = useApp();
  const focus = useFocus();
  const k = SUBJECT[piece.section];
  const book = (bookId ?? piece.task.pointer.book ?? "og") as keyof typeof BOOK_NAMES;
  const [a, b] = numbers ?? piece.numbers ?? [1, 1];
  const keys = useMemo(() => new Map<number, BookQuestion>((content?.book_keys.books[book]?.questions ?? []).map((q) => [q.n, q])), [content, book]);
  const nums = useMemo(() => Array.from({ length: b - a + 1 }, (_, i) => a + i), [a, b]);
  // What's typed shows at once; the saved log catches up a moment later (fast typing must never
  // land on a stale "next blank" question).
  const typedNow = useRef(new Map<string, AnswerRec>());
  const [, bump] = useState(0);
  const saved = d.answers.get(piece.id) ?? new Map<string, AnswerRec>();
  const answers = new Map<string, AnswerRec>([...saved, ...typedNow.current]);
  const startedAt = d.started.get(piece.id) ?? now().getTime();
  const time = useTaskTime(piece.id, "desk", "book set", 15);
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState("");
  const [confirm, setConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isTPA = (n: number) => keys.get(n)?.section === "TPA";
  const rowsOf = (n: number) => keys.get(n)?.options ?? 6;
  const cur = (n: number) => answers.get(String(n));

  async function put(n: number, value: Answer, unsure: boolean) {
    time.poke();
    const sinceStartMs = now().getTime() - startedAt;
    typedNow.current.set(String(n), { value, unsure, sinceStartMs, ts: now().getTime() });
    bump((x) => x + 1);
    await record({ type: "answer", piece: piece.id, q: n, value, unsure, sinceStartMs });
    const minutesIn = (now().getTime() - startedAt) / 60_000;
    focus.boundary(minutesIn, false);     // a long set offers the break at the next question
  }

  function nextBlank(): number | undefined {
    return nums.find((n) => !cur(n)?.value);
  }

  async function onTyped(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const raw = typed.trim();
    if (!raw) {
      // Enter on an empty box finishes: straight away when every question has an answer
      if (answered === nums.length) void submit(); else setConfirm(true);
      return;
    }
    // a letter on its own answers the next blank question
    const bare = raw.match(/^([a-e])\s*(s|\?)?$/i);
    const target = bare ? nextBlank() : undefined;
    const t = bare && target ? { n: target, value: bare[1].toUpperCase() as Answer, unsure: !!bare[2] } : parseTyped(raw, { twoPart: (n) => (isTPA(n) ? rowsOf(n) : undefined) });
    if (!t || t.n < a || t.n > b) { setHint(`Try "${a}c", or "${a}cs" for not sure.`); return; }
    setHint("");
    setTyped("");
    await put(t.n, t.value, t.unsure);
  }

  const answered = nums.filter((n) => cur(n)?.value).length;

  async function submit() {
    const entries = nums.map((n) => ({ value: cur(n)?.value ?? null, unsure: !!cur(n)?.unsure, key: keys.get(n)?.answer }));
    const m = markSet(entries);
    await record({ type: "piece.submitted", piece: piece.id, wrongOrUnsure: m.toLookAgain, answered });
    time.flush();
    if (onSubmitted) { onSubmitted(); return; }      // part of a bigger task: that screen finishes it
    await record({ type: "piece.done", piece: piece.id });
    focus.boundary(0, true);
    // the set is logged once, after its last piece: the count covers every half
    const siblings = pieces.filter((p) => p.taskId === piece.taskId);
    const total = siblings.reduce((s, p) => s + (p.id === piece.id ? m.toLookAgain : (d.submitted.get(p.id)?.wrongOrUnsure ?? 0)), 0);
    onDone?.(piece.last ? { toLookAgain: total } : { toLookAgain: 0, firstHalf: true });
  }

  useKeys({ Escape: () => inputRef.current?.focus() });

  const body = (
    <>
      <input ref={inputRef} autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={onTyped}
        placeholder={`Type ${a}c, or ${a}cs for not sure, then Enter. A letter on its own answers the next one.`}
        style={{ height: 46, border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "0 12px", font: "400 13px var(--mono)", background: "#fff" }} />
      {hint && <div className="small">{hint}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: "6px 22px" }}>
        {nums.map((n) => {
          const c = cur(n);
          return (
            <div key={n} className="row" style={{ gap: 6, minHeight: 56, borderBottom: "1.5px solid #f0ebe2" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 12, width: 34, flex: "none" }}>{n}</span>
              {isTPA(n) ? (
                <TwoPartPicker rows={rowsOf(n)} value={Array.isArray(c?.value) ? c!.value : null} color={k.c}
                  onPick={(v) => void put(n, v, !!c?.unsure)} />
              ) : (
                LETTERS.map((L) => {
                  const on = c?.value === L;
                  return (
                    <button key={L} className="letter" aria-pressed={on} onClick={() => void put(n, L, !!c?.unsure)}
                      style={{ background: on ? k.c : "#fff", color: on ? "var(--paper)" : "var(--ink)", borderColor: on ? k.c : "var(--line-2)" }}>{L}</button>
                  );
                })
              )}
              <button onClick={() => void put(n, c?.value ?? null, !c?.unsure)}
                style={{ marginLeft: "auto", height: 48, minWidth: 64, padding: "0 8px", borderRadius: 9, border: "1.5px solid #e2ddd2", font: "400 10px var(--mono)", cursor: "pointer",
                  background: c?.unsure ? "var(--ink)" : "transparent", color: c?.unsure ? "var(--paper)" : "var(--muted)", whiteSpace: "nowrap" }}>
                {c?.unsure ? "not sure" : "sure"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small">{answered} of {nums.length} entered</span>
        <span className="tiny" title="Solve it from the PDF on screen instead, or leave it: it won't count against you.">Can't find one? Solve it from the PDF, or leave it blank.</span>
      </div>
      {confirm && answered < nums.length ? (
        <div className="note">
          <div style={{ fontSize: 18 }}>{nums.length - answered} left blank. Log it anyway?</div>
          <div className="row">
            <button className="btn small" style={{ flex: 1 }} autoFocus onClick={() => void submit()}>Log it</button>
            <button className="btn ghost small" onClick={() => { setConfirm(false); inputRef.current?.focus(); }}>Keep going</button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ background: k.c, borderColor: k.c, opacity: answered ? 1 : 0.35, flex: "none" }} disabled={!answered}
          onClick={() => (answered < nums.length ? setConfirm(true) : void submit())}>
          {piece.last && !embedded ? "Done: log it" : "Done with this half"}
        </button>
      )}
    </>
  );

  if (embedded) return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{body}</div>;
  return (
    <Screen right={focus.sitting ? `focus ${focus.focusMinutes} min` : ""}>
      <div className="column" style={{ gap: 12 }}>
        <Back label="← Today · pause" onClick={() => { time.flush(); history.back(); }} />
        <div className="eyebrow" style={{ color: k.d }}>{k.name}</div>
        <div style={{ fontSize: 25, lineHeight: 1.12 }}>{titleOf(piece)}</div>
        <div className="ptr" style={{ background: k.t }}>{pointerOf(piece, content)}</div>
        <div style={{ fontSize: 15, color: "var(--muted)" }}>
          {book === "og" ? "Work in the book. Enter each answer as you go." : `Work from the ${BOOK_NAMES[book]} on screen. Enter each answer as you go.`}
        </div>
        {body}
      </div>
    </Screen>
  );
}

function TwoPartPicker({ rows, value, color, onPick }: { rows: number; value: number[] | null; color: string; onPick: (v: number[]) => void }) {
  const [c1, c2] = value ?? [0, 0];
  const col = (which: 0 | 1) => (
    <div className="row" style={{ gap: 3 }}>
      <span className="tiny" style={{ width: 14 }}>{which + 1}</span>
      {Array.from({ length: rows }, (_, i) => i + 1).map((r) => {
        const on = (which === 0 ? c1 : c2) === r;
        return (
          <button key={r} className="letter" style={{ width: 30, height: 48, fontSize: 14, background: on ? color : "#fff", color: on ? "var(--paper)" : "var(--ink)" }}
            onClick={() => onPick(which === 0 ? [r, c2 || 0] : [c1 || 0, r])}>{r}</button>
        );
      })}
    </div>
  );
  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }} title="Row of the option you chose, for each column">{col(0)}{col(1)}</div>;
}
