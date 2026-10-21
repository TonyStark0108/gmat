// New cards from your work: a few a day, from the topics you worked on and the mistakes you tagged.
// Keep or skip each with one tap; anything you don't get to is kept for you the day after next.
// With your Claude key and signal, cards for reading mistakes are drafted by Claude first (a few cents).

import { useEffect, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import type { Suggestion } from "../core/recall";
import { record } from "../data/db";
import { Back, Screen } from "./bits";
import { SUBJECT } from "./copy";

export function NewCards() {
  const { m, online } = useApp();
  const list = m.sugg.pending;
  const [drafting, setDrafting] = useState<"idle" | "busy" | "done">("idle");
  useEffect(() => {
    const need = list.filter((s) => s.source === "error" && !s.drafted).map((s) => m.reviews.items.get(s.item!)).filter((it) => it && it.source === "rc");
    if (!online || !need.length || drafting !== "idle") return;
    setDrafting("busy");
    // the Claude library loads only when it's needed
    void import("../data/drafts").then(({ draftCards }) => draftCards(m, need as NonNullable<(typeof need)[number]>[])).finally(() => setDrafting("done"));
  }, [online, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = (s: Suggestion, keep: boolean) => record({ type: "card.kept", card: s.id, keep });
  const keepAll = async () => { for (const s of list) await decide(s, true); go("/"); };

  return (
    <Screen><div className="column">
      <Back />
      <div className="eyebrow">New cards</div>
      <div className="title">{list.length ? `${list.length} new ${list.length === 1 ? "card" : "cards"} from your work` : "No new cards right now."}</div>
      <div className="muted" style={{ fontSize: 16 }}>
        {list.length ? "Keep the ones worth remembering. Any you leave are kept for you the day after tomorrow." : m.sugg.waiting.length ? `${m.sugg.waiting.length} more come in a few at a time, as you go.` : "They come from the topics you work on and the mistakes you tag."}
      </div>
      {drafting === "busy" && <div className="small">Claude is drafting the cards for your reading mistakes…</div>}
      {list.map((s) => {
        const k = s.section ? SUBJECT[s.section] : SUBJECT.general;
        return (
          <div key={s.id} className="box" style={{ gap: 8 }}>
            <div className="eyebrow" style={{ color: k.d }}>{s.source === "error" ? "From a mistake" : k.name}{s.drafted ? " · drafted by Claude" : ""}</div>
            <div style={{ fontSize: 19 }}>{s.front}</div>
            <div className="reading" style={{ fontSize: 17, color: "var(--ink-2)" }}>{s.back}</div>
            <div className="row">
              <button className="btn small" style={{ flex: 1 }} onClick={() => void decide(s, true)}>Keep</button>
              <button className="btn ghost small" onClick={() => void decide(s, false)}>Skip</button>
            </div>
          </div>
        );
      })}
      <div className="spacer" />
      {list.length > 1 ? <button className="btn outline" onClick={() => void keepAll()}>Keep them all</button> : <button className="btn" onClick={() => go("/")}>Back to today</button>}
    </div></Screen>
  );
}
