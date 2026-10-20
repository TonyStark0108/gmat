// CR set (spec: CR set): done in one go on GMAT Club, 25 questions in under an hour. Open each, answer it
// there, jot your letter (a ? if unsure), come back, open the next. At the end, all the letters go into
// one grid. If the signal drops mid-set, the set waits.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../app/store";
import { now } from "../../core/clock";
import { crReplacement } from "../../core/links";
import type { Piece } from "../../core/pieces";
import { record } from "../../data/db";
import { Back, Screen } from "../bits";
import { SUBJECT, pointerOf, titleOf } from "../copy";
import { useFocus } from "../focus";
import { LinkOut } from "../LinkOut";
import type { Logged } from "./TaskRunner";

/** "AB?CD" → letters with not-sure marks. */
export function parseLine(s: string): { value: string; unsure: boolean }[] {
  const out: { value: string; unsure: boolean }[] = [];
  for (const ch of s.toUpperCase()) {
    if (/[A-E]/.test(ch)) out.push({ value: ch, unsure: false });
    else if ((ch === "?" || ch === "S") && out.length) out[out.length - 1].unsure = true;
  }
  return out;
}

export function CrSet({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { content, d, online, bus } = useApp();
  const focus = useFocus();
  const k = SUBJECT.cr;
  const set = useMemo(() => [...(content?.cr_bank.default_sets ?? []), ...(content?.cr_bank.reserve_sets ?? [])].find((s) => s.id === piece.task.pointer.set), [content, piece]);
  const swaps = d.crSwaps.filter((x) => x.set === set?.id);
  const qs = (set?.questions ?? []).map((q) => ({ n: q.n, url: swaps.filter((x) => x.n === q.n).pop()?.url ?? q.url }));
  const [line, setLine] = useState("");
  const [stage, setStage] = useState<"links" | "grid">(d.answers.get(piece.id)?.size ? "grid" : "links");
  const opened = useRef<number[]>([]);
  const away = useRef(0);
  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    const on = () => {
      if (document.hidden) { if (leftAt.current === null) leftAt.current = Date.now(); }
      else if (leftAt.current !== null) { away.current += (Date.now() - leftAt.current) / 60_000; leftAt.current = null; }
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const letters = parseLine(line);
  const save = async () => {
    const startedAt = d.started.get(piece.id) ?? now().getTime();
    for (let i = 0; i < qs.length; i++) {
      const l = letters[i];
      await record({ type: "answer", piece: piece.id, q: qs[i].n, value: l?.value ?? null, unsure: !!l?.unsure, sinceStartMs: (opened.current[i] ?? now().getTime()) - startedAt });
    }
    const minutes = Math.min(qs.length * 6, Math.round(away.current));     // 6 minutes a question at most
    if (minutes > 0) await record({ type: "time", minutes, where: bus ? "bus" : "desk", piece: piece.id, source: "cr" });
    const unsure = letters.filter((l) => l.unsure).length + Math.max(0, qs.length - letters.length);
    await record({ type: "piece.submitted", piece: piece.id, wrongOrUnsure: unsure, answered: letters.length });
    await record({ type: "piece.done", piece: piece.id });
    focus.boundary(0, true);
    onDone({ toLookAgain: unsure, note: "The official answers go in at the review, and from then on redos are marked for you." });
  };

  return (
    <Screen>
      <div className="column" style={{ gap: 12 }}>
        <Back label="← Today · pause" />
        <div className="eyebrow" style={{ color: k.d }}>Critical reasoning · opens GMAT Club</div>
        <div style={{ fontSize: 25 }}>{titleOf(piece)}</div>
        <div className="ptr" style={{ background: k.t }}>{pointerOf(piece, content)}</div>
        {!online && <div className="note"><div style={{ fontSize: 17 }}>No signal. The set waits here; your place is kept.</div></div>}
        {stage === "links" ? (
          <>
            <div className="muted" style={{ fontSize: 16, lineHeight: 1.4 }}>All in one go, under an hour. Open a question, answer it on GMAT Club, jot your letter in your notebook (a ? if unsure), come back, open the next.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 8, opacity: online ? 1 : 0.4, pointerEvents: online ? "auto" : "none" }}>
              {qs.map((q, i) => (
                <LinkOut key={q.n} compact url={q.url} label={`Question ${q.n}`} color={{ c: k.c, d: k.d }} onOpen={() => { opened.current[i] = now().getTime(); }}
                  fallback={() => {
                    const rep = content ? crReplacement(content, d) : null;
                    return rep ? { label: "Swap in another question", run: () => void record({ type: "cr.swap", set: set!.id, n: q.n, url: rep }) } : null;
                  }} />
              ))}
            </div>
            <div className="spacer" />
            <button className="btn" style={{ background: k.c, borderColor: k.c }} onClick={() => setStage("grid")}>I've done all {qs.length}: enter my letters</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 19 }}>Your letters, in order. Put a ? after any you weren't sure of.</div>
            <input autoFocus value={line} onChange={(e) => setLine(e.target.value)} placeholder="ABD?CE…" onKeyDown={(e) => { if (e.key === "Enter" && letters.length === qs.length) void save(); }}
              style={{ height: 52, border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "0 12px", font: "400 18px var(--mono)", letterSpacing: ".18em", background: "#fff" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))", gap: 6 }}>
              {qs.map((q, i) => (
                <div key={q.n} className="box" style={{ padding: 6, alignItems: "center", gap: 2, borderColor: letters[i]?.unsure ? "var(--ink)" : undefined }}>
                  <span className="tiny">{q.n}</span><span className="mono" style={{ fontWeight: 700 }}>{letters[i]?.value ?? "·"}{letters[i]?.unsure ? "?" : ""}</span>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="small">{letters.length} of {qs.length}</span>
              <button className="back" onClick={() => setStage("links")}>← the questions</button>
            </div>
            <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={!letters.length} onClick={() => void save()}>
              {letters.length < qs.length ? `Log it with ${qs.length - letters.length} blank` : "Done: log it"}
            </button>
          </>
        )}
      </div>
    </Screen>
  );
}
