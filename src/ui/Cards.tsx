// Cards (spec: Flashcards). A session is 10–15 cards: front → Show → back → Again or Got it.
// Space shows the back, 1 is Again, 2 is Got it. No count of what's due, no target, no streak.
// Managing cards is a list (edit, pause, delete), never a study mode.

import { useMemo, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { dueCards, sessionCards, type StudyCard } from "../core/cards";
import { recapCards } from "../core/recall";
import { record } from "../data/db";
import { Back, Screen, useKeys } from "./bits";
import { useTaskTime } from "./focus";

export const WARMUP_SIZE = 5;
export const WARMUP_MIN = 3;      // with fewer due than this, a sitting starts straight away

/**
 * A session. `warm`: a few due cards before the first piece of a sitting, then on to `then`.
 * `recap`: the week's own cards, mixed (the Saturday recap).
 */
export function CardSession({ topic, piece, recap, warm, then }: { topic?: string; piece?: string; recap?: string; warm?: boolean; then?: string }) {
  const { m, bus, now, today } = useApp();
  const list = useMemo(() => (recap ? recapCards(m.cards, recap) : warm ? dueCards(m.cards, now.getTime()).slice(0, WARMUP_SIZE) : sessionCards(m.cards, now.getTime(), m.adapt.weight, topic)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [queue, setQueue] = useState<StudyCard[]>(list);
  const [again, setAgain] = useState<Set<string>>(new Set());
  const [back, setBack] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const time = useTaskTime(piece ?? "cards", bus ? "bus" : "desk", "cards");
  const c = queue[0];
  const front = c ? m.cards.find((x) => x.id === c.id)?.front ?? c.front : "";

  const rate = async (r: "again" | "good") => {
    if (!c) return;
    await record({ type: "card.rated", card: c.id, rating: r });
    setBack(false);
    setEditing(null);
    setDone((x) => x + 1);
    // an Again comes round once more at the end of the session
    setQueue((q) => (r === "again" && !again.has(c.id) ? [...q.slice(1), c] : q.slice(1)));
    if (r === "again") setAgain((s) => new Set(s).add(c.id));
    time.poke();
  };
  const finish = async () => {
    if (done || !warm) await record({ type: "cards.session", count: done, where: bus ? "bus" : "desk" });
    if (piece && !m.d.done.has(piece)) await record({ type: "piece.done", piece });
    if (warm) await record({ type: "seen", what: `warmup:${today}` });
    time.flush();
    go(then ?? "/");
  };
  useKeys({
    " ": () => { if (c && !editing) setBack(true); },
    "1": () => { if (back && !editing) void rate("again"); },
    "2": () => { if (back && !editing) void rate("good"); },
    Enter: () => { if (!c) void finish(); },
  }, [c?.id, back, editing, done]);

  if (!list.length && warm) { void finish(); return null; }
  if (!list.length) {
    return <Screen><div className="column"><Back /><div className="title">No cards yet.</div>
      <div className="muted" style={{ fontSize: 17 }}>They come from the starter decks and from the lines you write after a review or a video.</div></div></Screen>;
  }
  if (!c) {
    return (
      <Screen><div className="column">
        <div className="eyebrow">Cards</div>
        <div className="title">{warm ? "Warmed up." : recap ? "That's the week's recap." : "That's the session."}</div>
        <div className="spacer" />
        <button className="btn" autoFocus onClick={() => void finish()}>{warm ? "On to the next thing" : "Back to today"}</button>
      </div></Screen>
    );
  }
  return (
    <Screen>
      <div className="column">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Back label={warm ? "Skip the warm-up" : "← Today · pause"} onClick={() => void finish()} />
          {(warm || recap) && <span className="tiny">{list.length - queue.length + 1} of {list.length}</span>}
        </div>
        <div className="eyebrow" style={{ color: "var(--rc-d)" }}>{warm ? "Warm-up · " : recap ? "This week's recap · " : ""}Cards{c.source === "error" ? " · from a review" : c.source === "video" ? " · from a video" : c.source === "method" ? " · method" : c.source === "topic" ? " · a rule" : ""}</div>
        <div className="card" style={{ border: "2px dashed var(--rc)", boxShadow: "6px 6px 0 var(--rc-t)", minHeight: 260, justifyContent: "center" }}>
          <div className="reading" style={{ fontSize: 24, fontFamily: c.source === "quant facts" ? "var(--mono)" : "var(--read)" }}>{front}</div>
          {back && <div className="reading" style={{ fontSize: 21, borderTop: "1.5px solid var(--line)", paddingTop: 12, color: "var(--ink-2)" }}>{c.back}</div>}
        </div>
        {back && editing !== c.id && <button className="back" onClick={() => setEditing(c.id)}>Edit the front</button>}
        {editing === c.id && <EditFront card={c} current={front} onDone={() => setEditing(null)} />}
        <div className="spacer" />
        {!back ? (
          <button className="btn" onClick={() => setBack(true)}>Show <span className="tiny" style={{ marginLeft: 8, color: "inherit" }}>space</span></button>
        ) : (
          <div className="row">
            <button className="btn ghost" style={{ flex: 1 }} onClick={() => void rate("again")}>Again <span className="tiny" style={{ marginLeft: 8 }}>1</span></button>
            <button className="btn" style={{ flex: 1, background: "var(--rc)", borderColor: "var(--rc)" }} onClick={() => void rate("good")}>Got it <span className="tiny" style={{ marginLeft: 8, color: "inherit" }}>2</span></button>
          </div>
        )}
      </div>
    </Screen>
  );
}

function EditFront({ card, current, onDone }: { card: StudyCard; current: string; onDone: () => void }) {
  const [v, setV] = useState(current);
  return (
    <div className="row">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} style={{ flex: 1, height: 44, border: "1.5px solid var(--line-2)", borderRadius: 9, padding: "0 10px", fontSize: 16 }}
        onKeyDown={async (e) => { if (e.key === "Enter" && v.trim()) { await record({ type: "card.edited", card: card.id, front: v.trim() }); onDone(); } if (e.key === "Escape") onDone(); }} />
      <button className="btn small" onClick={async () => { if (v.trim()) await record({ type: "card.edited", card: card.id, front: v.trim() }); onDone(); }}>Save</button>
    </div>
  );
}

export function ManageCards() {
  const { m } = useApp();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const shown = m.cards.filter((c) => !q || `${c.front} ${c.back}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.source === "error" || b.source === "video") - Number(a.source === "error" || a.source === "video") || b.createdTs - a.createdTs);
  return (
    <Screen>
      <div className="column">
        <Back to="/settings" label="← Settings" />
        <div className="title">Your cards</div>
        <div className="muted" style={{ fontSize: 16 }}>Edit, pause or delete. Studying happens in a session, not here.</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a card"
          style={{ height: 44, border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "0 12px", fontSize: 16, background: "#fff" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.slice(0, 200).map((c) => (
            <div key={c.id} className="box" style={{ gap: 4, opacity: c.paused ? 0.55 : 1 }}>
              {editing === c.id ? <EditFront card={c} current={c.front} onDone={() => setEditing(null)} /> : <div style={{ fontSize: 17 }}>{c.front}</div>}
              <div className="small">{c.back}</div>
              <div className="row">
                <button className="back" onClick={() => setEditing(c.id)}>edit</button>
                <button className="back" onClick={() => void record({ type: "card.paused", card: c.id, paused: !c.paused })}>{c.paused ? "unpause" : "pause"}</button>
                <button className="back" onClick={() => void record({ type: "card.deleted", card: c.id })}>delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}
