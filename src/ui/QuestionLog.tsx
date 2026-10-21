// Log a question from another official source: the OG online question banks, Official Practice
// Questions, the Starter Kit, or anywhere else. One question at a time: type, topic, right or wrong,
// not sure, time. Wrong and not-sure ones join the redo ladder; all of them count toward your topics.

import { useState } from "react";
import { useApp } from "../app/store";
import { QTYPES, SOURCE_NAMES } from "../core/qlog";
import { QUANT_TOPICS } from "../core/topics";
import { record } from "../data/db";
import { Back, Screen, useToast } from "./bits";

export function QuestionLog() {
  const { d } = useApp();
  const [source, setSource] = useState("og_online");
  const [qtype, setQtype] = useState<string>("PS");
  const [topic, setTopic] = useState("");
  const [ref, setRef] = useState("");
  const [url, setUrl] = useState("");
  const [time, setTime] = useState("");
  const [unsure, setUnsure] = useState(false);
  const [toast, say] = useToast();
  const recent = [...d.qlogs].reverse().slice(0, 8);
  const seconds = (() => { const m = time.match(/^(\d{1,2})(?::(\d{2}))?$/); return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null; })();
  const save = async (result: "right" | "wrong") => {
    if (url && !/^https?:\/\//i.test(url.trim())) { say("A link starts with https://"); return; }
    await record({ type: "qlog", source, qtype, topic: topic || null, result, unsure, seconds, ref: ref.trim() || undefined, url: url.trim() || undefined });
    setRef(""); setUrl(""); setTime(""); setUnsure(false);
    say(result === "wrong" || unsure ? "Logged. It comes back as a redo in a day or two." : "Logged.");
  };
  const showTopic = qtype === "PS" || qtype === "DS";
  return (
    <Screen>
      <div className="column" style={{ gap: 10 }}>
        <Back to="/errors" label="← What to work on" />
        <div className="title">Log a question</div>
        <div className="muted" style={{ fontSize: 16 }}>From the OG online question banks, Official Practice Questions or anywhere else. It goes into your error log and your topic accuracy like any other.</div>
        <div className="field"><span>Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>{Object.entries(SOURCE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><span>Question type</span>
          <div className="row wrap" style={{ gap: 4 }}>{QTYPES.map((q) => (
            <button key={q} className="chip" onClick={() => setQtype(q)} style={{ border: `1.5px solid ${qtype === q ? "var(--ink)" : "var(--line-2)"}`, background: qtype === q ? "var(--ink)" : "transparent", color: qtype === q ? "var(--paper)" : "inherit", minHeight: 40 }}>{q}</button>
          ))}</div></div>
        {showTopic && <div className="field"><span>Topic</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">not sure</option>{QUANT_TOPICS.map((t) => <option key={t}>{t}</option>)}</select></div>}
        <div className="field"><span>Which question</span><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. DI Review online #212" style={{ width: 230 }} /></div>
        <div className="field"><span>Link (optional)</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={{ width: 230 }} /></div>
        <div className="field"><span>Time (min or m:ss)</span><input inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value.replace(/[^\d:]/g, ""))} placeholder="2:10" style={{ width: 90 }} /></div>
        <div className="field"><span>Not sure</span><button className="toggle" onClick={() => setUnsure((x) => !x)}>{unsure ? "yes" : "no"}</button></div>
        <div className="row">
          <button className="btn" style={{ flex: 1 }} onClick={() => void save("right")}>Right</button>
          <button className="btn outline" style={{ flex: 1 }} onClick={() => void save("wrong")}>Wrong</button>
        </div>
        {recent.length > 0 && <div className="eyebrow" style={{ marginTop: 8 }}>Recently logged</div>}
        {recent.map((q) => <div key={q.id} className="small">{SOURCE_NAMES[q.source] ?? q.source} · {q.qtype}{q.topic ? ` · ${q.topic}` : ""}{q.ref ? ` · ${q.ref}` : ""} · {q.result}{q.unsure ? ", not sure" : ""}</div>)}
      </div>
      {toast}
    </Screen>
  );
}
