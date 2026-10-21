// Your error log, from memory (weekly, and before an official mock). For each of your biggest groups of
// mistakes: say your own rule for them first, then see what you wrote and the deck's rule. Then a few of
// those questions again, from scratch. Those goes are practice and never move the redo ladder.

import { useMemo, useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import { errorFront } from "../../core/cards";
import type { Piece } from "../../core/pieces";
import { recallGroups, type RecallGroup } from "../../core/recall";
import { record } from "../../data/db";
import { Back, Screen, useKeys } from "../bits";
import { SUBJECT } from "../copy";

export function RecallTask({ piece }: { piece: Piece }) {
  const { m, d, today, bus, online } = useApp();
  const sweep = !!piece.task.pointer.sweep;
  const reviewId = `recall:${piece.id}`;
  // the groups are fixed when you start, so a pause resumes on the same ones
  const groups = useMemo(() => recallGroups(m.reviews, d, today, { online, bus }, sweep ? 8 : 5), []); // eslint-disable-line react-hooks/exhaustive-deps
  const doneKeys = (g: RecallGroup) => d.seen.has(`recall-group:${piece.id}:${g.key}`);
  const cur = groups.find((g) => !doneKeys(g));
  const questions = groups.flatMap((g) => g.questions);

  const finishGroups = async () => {
    if (d.reviewStarted.has(reviewId) || !questions.length) {
      if (!questions.length) { await record({ type: "piece.done", piece: piece.id }); go("/"); return; }
    } else await record({ type: "review.started", review: reviewId, items: questions.map((q) => q.id) });
    go(`/review/${encodeURIComponent(reviewId)}`);
  };

  if (!groups.length) {
    return (
      <Screen><div className="column">
        <Back />
        <div className="title">Nothing open in your error log right now.</div>
        <button className="btn" onClick={async () => { await record({ type: "piece.done", piece: piece.id }); go("/"); }}>Done</button>
      </div></Screen>
    );
  }
  if (!cur) {
    return (
      <Screen><div className="column">
        <Back label="← Today · pause" />
        <div className="eyebrow">Your error log, from memory</div>
        <div className="title">{questions.length ? `Now ${questions.length === 1 ? "one of these" : `${questions.length} of these`} again, from scratch.` : "That's every group."}</div>
        {questions.length > 0 && <div className="muted" style={{ fontSize: 17 }}>Practice: whatever happens here, the regular review keeps its dates.</div>}
        <div className="spacer" />
        <EnterButton label={questions.length ? "Start the questions" : "Done"} onClick={() => void finishGroups()} />
      </div></Screen>
    );
  }
  return <Group key={cur.key} g={cur} piece={piece} at={groups.indexOf(cur) + 1} of={groups.length} sweep={sweep} />;
}

function Group({ g, piece, at, of, sweep }: { g: RecallGroup; piece: Piece; at: number; of: number; sweep: boolean }) {
  const [shown, setShown] = useState(false);
  const [rule, setRule] = useState("");
  const k = SUBJECT[g.section];
  const next = async () => {
    // a rule you wrote from memory that you hadn't written before becomes a card
    const text = rule.trim();
    if (text && !g.lines.includes(text) && g.tag) await record({ type: "line", source: `recall:${g.key}`, text, front: errorFront(g.section, g.topic, g.tag), topic: g.topic, section: g.section });
    await record({ type: "seen", what: `recall-group:${piece.id}:${g.key}` });
  };
  useKeys({ Enter: () => { if (document.activeElement?.tagName === "TEXTAREA") return; if (!shown) setShown(true); else void next(); } }, [shown, rule]);
  return (
    <Screen><div className="column">
      <Back label="← Today · pause" />
      <div className="eyebrow" style={{ color: k.d }}>{sweep ? "Before the mock" : "Your error log, from memory"} · {at} of {of}</div>
      <div className="title" style={{ fontSize: 26 }}>{g.heading}</div>
      <div className="small">{g.count} {g.count === 1 ? "question" : "questions"} in this group</div>
      <div style={{ fontSize: 18 }}>{g.key.startsWith("look|") ? "What made these worth another look? Say it, or write it." : "What's your rule for these? Say it, or write it, before you look."}</div>
      <textarea value={rule} onChange={(e) => setRule(e.target.value)} rows={3} placeholder="From memory (optional)"
        style={{ border: "1.5px solid var(--line-2)", borderRadius: 10, padding: 10, font: "400 16px var(--read)", resize: "vertical" }} />
      {!shown ? (
        <button className="btn outline" onClick={() => setShown(true)}>Show my notes</button>
      ) : (
        <div className="box" style={{ gap: 10 }}>
          {g.lines.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="eyebrow">What you wrote</div>
              {g.lines.map((l) => <div key={l} className="reading" style={{ fontSize: 18 }}>“{l}”</div>)}
            </div>
          )}
          {g.rules.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="eyebrow">The rule</div>
              {g.rules.map((c) => <div key={c.id} style={{ fontSize: 16 }}><b>{c.front}.</b> {c.back}</div>)}
            </div>
          )}
          {!g.lines.length && !g.rules.length && <div className="small">No notes for these yet. Anything you wrote above becomes a card.</div>}
        </div>
      )}
      <div className="spacer" />
      <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={!shown} onClick={() => void next()}>Next</button>
    </div></Screen>
  );
}

function EnterButton({ label, onClick }: { label: string; onClick: () => void }) {
  useKeys({ Enter: onClick }, [onClick]);
  return <button className="btn" autoFocus onClick={onClick}>{label}</button>;
}
