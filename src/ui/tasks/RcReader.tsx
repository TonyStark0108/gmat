// The RC reader (spec: RC section). One passage at a time: read, one line on what it argues and where
// the author stands, then the questions beside the passage. Pauses after any passage; resumes exactly
// there. The clock depends on the plan stage and never submits for you.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../app/store";
import { now } from "../../core/clock";
import type { RcPassage, RcQuestion, RcSection } from "../../core/content";
import { markSet } from "../../core/grid";
import type { Piece } from "../../core/pieces";
import type { AnswerRec } from "../../core/state";
import { record } from "../../data/db";
import { Back, Screen, useKeys } from "../bits";
import { useFocus, useTaskTime } from "../focus";
import type { Logged } from "./TaskRunner";

const FLAGS = [null, "stumped", "guessed", "slow"] as const;
const SET_MINUTES = 60;           // the plan measures a full LSAT set at about an hour

/** Timer mode by plan stage: untimed early, then timed with the clock hidden, then visible. */
function timerMode(planWeek: number): "untimed" | "hidden" | "visible" {
  if (planWeek <= 5) return "untimed";
  if (planWeek <= 9) return "hidden";
  return "visible";
}

export function RcReader({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { content } = useApp();
  const section = useMemo(() => content?.rc_bank.sections.find((s) => s.id === piece.task.pointer.section), [content, piece]);
  if (!section) return <Screen><Back /><div className="t">This reading set isn't in the content file.</div></Screen>;
  return <RcInner piece={piece} onDone={onDone} section={section} />;
}

function RcInner({ piece, onDone, section }: { piece: Piece; onDone: (l: Logged | null) => void; section: RcSection }) {
  const { d, bus } = useApp();
  const focus = useFocus();
  const place = d.rcPlace.get(piece.id) ?? { passage: 0, stage: "read" as const, q: 0 };
  const [pi, setPi] = useState(place.passage);
  const [stage, setStage] = useState<"read" | "prompt" | "questions">(place.stage);
  const [qi, setQi] = useState(place.q);
  const time = useTaskTime(piece.id, bus ? "bus" : "desk", "rc");
  const startedAt = d.started.get(piece.id) ?? now().getTime();
  const mode = timerMode(piece.planWeek);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(t); }, []);

  const passage: RcPassage = section.passages[pi];
  const q: RcQuestion | undefined = passage.questions[qi];
  const typedNow = useRef(new Map<string, AnswerRec>());
  const [, bump] = useState(0);
  const answers = new Map<string, AnswerRec>([...(d.answers.get(piece.id) ?? new Map<string, AnswerRec>()), ...typedNow.current]);
  const flags = d.rcFlags.get(piece.id) ?? new Map();
  const line = d.rcLines.get(passage.id) ?? "";
  const [lineDraft, setLineDraft] = useState(line);
  useEffect(() => setLineDraft(d.rcLines.get(passage.id) ?? ""), [passage.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePlace = (p: number, s: typeof stage, qq: number) => void record({ type: "rc.place", piece: piece.id, passage: p, stage: s, q: qq });
  const move = (p: number, s: typeof stage, qq: number) => { setPi(p); setStage(s); setQi(qq); savePlace(p, s, qq); time.poke(); };

  async function choose(letter: string) {
    if (!q) return;
    const sinceStartMs = now().getTime() - startedAt;
    typedNow.current.set(q.id, { value: letter, unsure: false, sinceStartMs, ts: now().getTime() });
    bump((x) => x + 1);
    await record({ type: "answer", piece: piece.id, q: q.id, value: letter, unsure: false, sinceStartMs });
    time.poke();
  }
  async function cycleFlag() {
    if (!q) return;
    const curF = flags.get(q.id) ?? null;
    const next = FLAGS[(FLAGS.indexOf(curF) + 1) % FLAGS.length];
    await record({ type: "rc.flag", piece: piece.id, q: q.id, flag: next });
  }
  async function next() {
    if (stage === "read") return move(pi, "prompt", 0);
    if (stage === "prompt") {
      if (lineDraft.trim() && lineDraft !== line) await record({ type: "rc.line", piece: piece.id, passage: passage.id, text: lineDraft.trim() });
      return move(pi, "questions", 0);
    }
    if (!q || !answers.get(q.id)) return;
    if (qi + 1 < passage.questions.length) return move(pi, "questions", qi + 1);
    // end of a passage: a boundary (breaks and pauses happen here)
    focus.boundary((now().getTime() - startedAt) / 60_000, false);
    if (pi + 1 < section.passages.length) return move(pi + 1, "read", 0);
    return finish();
  }
  async function finish() {
    const all = section.passages.flatMap((p) => p.questions);
    const m = markSet(all.map((qq) => ({ value: answers.get(qq.id)?.value ?? null, unsure: !!flags.get(qq.id), key: qq.answer })));
    await record({ type: "piece.submitted", piece: piece.id, wrongOrUnsure: m.toLookAgain, answered: all.filter((qq) => answers.get(qq.id)).length });
    await record({ type: "piece.done", piece: piece.id });
    time.flush();
    focus.boundary(0, true);
    onDone({ toLookAgain: m.toLookAgain, note: "Reading questions don't come back one by one. How you did by question type and topic shows at the review." });
  }

  useKeys({
    a: () => stage === "questions" && void choose("A"), b: () => stage === "questions" && void choose("B"),
    c: () => stage === "questions" && void choose("C"), d: () => stage === "questions" && void choose("D"),
    e: () => stage === "questions" && void choose("E"), f: () => stage === "questions" && void cycleFlag(),
    Enter: () => void next(), ArrowLeft: () => stage === "questions" && qi > 0 && move(pi, "questions", qi - 1),
    p: () => { time.flush(); history.back(); },
  }, [pi, stage, qi, answers, flags, lineDraft]);

  const elapsed = Math.floor((now().getTime() - startedAt) / 60_000);
  const clock = mode === "visible" ? `${Math.max(0, SET_MINUTES - elapsed)} min left` : mode === "hidden" ? "timed · clock hidden" : "untimed";
  const warn = mode === "visible" && SET_MINUTES - elapsed <= 5 && SET_MINUTES - elapsed > 0;

  const marks = q?.line_span?.spans ?? [];
  const paragraphs = passage.paragraphs.map((text, i) => {
    const mine = stage === "questions" ? marks.filter((s) => s.paragraph === i).sort((x, y) => x.start - y.start) : [];
    if (!mine.length) return <p key={i}>{text}</p>;
    const bits: React.ReactNode[] = [];
    let at = 0;
    mine.forEach((s, j) => {
      if (s.start > at) bits.push(text.slice(at, s.start));
      bits.push(<mark key={j}>{text.slice(Math.max(s.start, at), s.end)}</mark>);
      at = Math.max(at, s.end);
    });
    bits.push(text.slice(at));
    return <p key={i}>{bits}</p>;
  });

  const passageLabel = `Passage ${pi + 1} of ${section.passages.length}`;
  return (
    <Screen wide right={focus.sitting ? `focus ${focus.focusMinutes} min` : ""}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Back label="← Today · pause" onClick={() => { time.flush(); history.back(); }} />
        <span className="tiny" style={warn ? { color: "var(--ink)", fontWeight: 700 } : undefined}>{warn ? "Five minutes left · " : ""}{clock}</span>
      </div>
      <div className="eyebrow" style={{ color: "var(--rc-d)" }}>Reading · {passageLabel}</div>
      <div className="split">
        <div className="left reading">{paragraphs}</div>
        <div className="right">
          {stage === "read" && (
            <>
              <div className="muted" style={{ fontSize: 18 }}>Read the passage. The questions come next.</div>
              <div className="spacer" />
              <button className="btn" style={{ background: "var(--rc)", borderColor: "var(--rc)" }} onClick={() => void next()}>I've read it</button>
            </>
          )}
          {stage === "prompt" && (
            <>
              <div style={{ border: "2px solid var(--rc)", background: "var(--rc-t)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 19, lineHeight: 1.3 }}>In one line: what is it arguing, and where does the author stand?</div>
                <input autoFocus value={lineDraft} onChange={(e) => setLineDraft(e.target.value)} placeholder="Not graded"
                  onKeyDown={(e) => { if (e.key === "Enter") void next(); }}
                  style={{ height: 44, border: "none", borderBottom: "1.5px solid var(--rc)", background: "transparent", fontSize: 17, outline: "none" }} />
              </div>
              <div className="spacer" />
              <button className="btn" style={{ background: "var(--rc)", borderColor: "var(--rc)" }} onClick={() => void next()}>Questions</button>
            </>
          )}
          {stage === "questions" && q && (
            <>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: 11, color: "var(--faint)" }}>Question {qi + 1} of {passage.questions.length}</span>
                <button onClick={() => void cycleFlag()} className="mono" title="F"
                  style={{ fontSize: 11, border: "1.5px solid var(--line-2)", background: flags.get(q.id) ? "var(--rc-t)" : "transparent", borderRadius: 14, padding: "6px 12px", cursor: "pointer" }}>
                  {flags.get(q.id) ?? "flag"}
                </button>
              </div>
              <div className="qtext">{q.stem}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {Object.entries(q.choices).map(([L, text]) => {
                  const on = answers.get(q.id)?.value === L;
                  return (
                    <button key={L} className={`choice${on ? " on" : ""}`} onClick={() => void choose(L)}>
                      <span className="l">{L}</span><span>{text}</span>
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ flex: "none", marginTop: 4 }}>
                {qi > 0 && <button className="btn ghost small" style={{ width: 90 }} onClick={() => move(pi, "questions", qi - 1)}>Back</button>}
                <button className="btn small" style={{ flex: 1, background: "var(--rc)", borderColor: "var(--rc)", opacity: answers.get(q.id) ? 1 : 0.35 }}
                  disabled={!answers.get(q.id)} onClick={() => void next()}>
                  {qi + 1 < passage.questions.length ? "Next" : pi + 1 < section.passages.length ? "Next passage" : "Done"}
                </button>
              </div>
              <div className="tiny">A–E to choose · Enter for next · F to flag · P to pause</div>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
