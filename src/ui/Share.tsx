// Sending a question to the app (spec: Sending a question to the app). The "Send to GMAT app"
// bookmark opens #/share?u=<the page> here; the link is saved with the topic of the set you're in,
// "Saved — it'll come back on Thursday", and the little window closes. Outside a set, one row of
// topic chips: the only picker in the app.

import { useEffect, useRef, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { DAY_NAMES, nextDeskSlot, parseYmd, plusDays } from "../core/calendar";
import type { Section } from "../core/content";
import { groupOf } from "../core/pieces";
import { DI_TYPES, QUANT_TOPICS, listTopic } from "../core/topics";
import { record } from "../data/db";
import { Screen } from "./bits";

const SET_KINDS = new Set(["gmatclub_set", "di_set", "cr_set"]);

export function ShareIn({ params }: { params: URLSearchParams }) {
  const { m, d, now } = useApp();
  const raw = params.get("u") || (params.get("t") ?? "").match(/https?:\/\/\S+/)?.[0] || "";
  const url = raw.trim();
  const [saved, setSaved] = useState<string | null>(null);
  const once = useRef(false);

  // the set you're in: a GMAT Club set started in the last three hours
  const current = [...d.started.entries()]
    .filter(([id, ts]) => now.getTime() - ts < 3 * 3_600_000 && SET_KINDS.has(m.byId.get(id)?.task.kind ?? ""))
    .sort((a, b) => b[1] - a[1]).map(([id]) => m.byId.get(id)!)[0];

  const when = (section: Section) => {
    const day = groupOf(section) === "Q" ? nextDeskSlot(now, d.settings, 7)?.day ?? plusDays(m.today, 1) : plusDays(m.today, 1);
    return DAY_NAMES[parseYmd(day).getDay()];
  };
  const save = async (topic: string | null, section: Section, set: string | null) => {
    await record({ type: "shared", url, set, topic, section });
    setSaved(`Saved — it'll come back on ${when(section)}.`);
    setTimeout(() => { window.close(); go("/"); }, 1600);
  };

  useEffect(() => {
    if (once.current || !url || !current) return;
    once.current = true;
    void save(current.task.topic ? listTopic(current.task.topic) : null, current.section, current.taskId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!/^https?:\/\//.test(url)) {
    return <Screen><div className="column"><div className="title">Nothing to save.</div><div className="muted">The bookmark sends the page you're on. Open a GMAT Club question first.</div>
      <button className="btn" onClick={() => go("/")}>Back to today</button></div></Screen>;
  }
  if (saved) return <Screen><div className="column"><div className="title">{saved}</div><div className="small">Your GMAT Club tab is where it was.</div></div></Screen>;
  if (current) return <Screen><div className="column"><div className="title">Saving…</div></div></Screen>;
  const chips: { label: string; topic: string | null; section: Section }[] = [
    ...QUANT_TOPICS.map((t) => ({ label: t, topic: t as string, section: "quant" as Section })),
    ...DI_TYPES.map((t) => ({ label: t, topic: t as string, section: "di" as Section })),
    { label: "CR", topic: "cr", section: "cr" }, { label: "reading", topic: "rc", section: "rc" },
  ];
  return (
    <Screen>
      <div className="column">
        <div className="eyebrow">Send to GMAT app</div>
        <div className="title">What's it about?</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {chips.map((c) => <button key={c.label} className="chip" style={{ border: "1.5px solid var(--line-2)" }} onClick={() => void save(c.topic, c.section, null)}>{c.label}</button>)}
        </div>
      </div>
    </Screen>
  );
}

/** The button to drag to the bookmarks bar once, during setup. */
export function Bookmarklet() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const base = `${location.origin}${import.meta.env.BASE_URL}`;
    const code = `javascript:(function(){window.open('${base}#/share?u='+encodeURIComponent(location.href),'gmatshare','width=480,height=380')})()`;
    ref.current?.setAttribute("href", code);   // set directly: React won't render javascript: links
  }, []);
  return (
    <div className="box">
      <div className="row" style={{ gap: 14 }}>
        <a ref={ref} onClick={(e) => e.preventDefault()} draggable
          style={{ border: "2px solid var(--ink)", borderRadius: 10, padding: "10px 14px", fontSize: 17, color: "var(--ink)", textDecoration: "none", cursor: "grab", background: "#fff" }}>
          Send to GMAT app
        </a>
        <div className="small">Drag this to your bookmarks bar, once. On GMAT Club, click it for each question you got wrong.</div>
      </div>
      <div className="tiny">If the office browser won't allow it, the counters screen has a box to paste the link instead.</div>
    </div>
  );
}
