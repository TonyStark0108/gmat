// An official mock (spec: Mock): a plum card on its weekend day with Open mba.com and Move it.
// Afterwards: the four scores, the verdict against that week's own gap, and up to ten misses tagged.

import { useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import { longDate, plusDays, weekStartOf } from "../../core/calendar";
import type { MockMiss, Tag } from "../../core/events";
import { moveMockDay, rehearsal, scoreProblem } from "../../core/mocks";
import type { Piece } from "../../core/pieces";
import { mockVerdict } from "../../core/results";
import { QUANT_TOPICS } from "../../core/topics";
import { record } from "../../data/db";
import { Back, Screen } from "../bits";
import { setSetting } from "../Settings";
import { SUBJECT } from "../copy";
import { useFocus } from "../focus";
import { LinkOut } from "../LinkOut";
import { QUANT_TAGS, VERBAL_TAGS } from "../review/parts";
import { TopupOffer } from "../review/SetReview";
import type { Logged } from "./TaskRunner";

const MBA_URL = "https://www.mba.com/";   // link catalogue L153

export function MockTask({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { m, d, today } = useApp();
  const focus = useFocus();
  const k = SUBJECT.mock;
  const ptr = piece.task.pointer;
  const [scores, setScores] = useState({ total: "", quant: "", verbal: "", di: "" });
  const [saved, setSaved] = useState(d.done.has(piece.id));
  const [toast, setToast] = useState("");
  const lastMock = m.mocks[m.mocks.length - 1]?.day ?? null;
  const noteboard = d.admin.get("w06-general-01#0")?.answer === "done" || piece.planWeek >= 6;

  const problem = scoreProblem(scores, !!ptr.practice_run);
  const save = async () => {
    if (problem) return;
    const n = Object.fromEntries(Object.entries(scores).filter(([, v]) => v).map(([kk, v]) => [kk, Number(v)]));
    await record({ type: "outside", piece: piece.id, scores: n });
    await record({ type: "time", minutes: 135, where: "desk", piece: piece.id, source: "mock" });
    await record({ type: "piece.done", piece: piece.id });
    focus.boundary(0, true);
    setSaved(true);
  };
  const move = async (day: string, why: string) => {
    await record({ type: "mock.moved", piece: piece.id, day });
    setToast(why);
    setTimeout(() => go("/"), 1800);
  };

  if (saved) return <MockAfter piece={piece} onDone={onDone} />;
  return (
    <Screen>
      <div className="column" style={{ gap: 12 }}>
        <Back label="← Today" />
        <div className="eyebrow" style={{ color: k.d }}>Mock · opens mba.com</div>
        <div style={{ fontSize: 27 }}>{piece.task.title}</div>
        {ptr.practice_run && <div className="note"><div style={{ fontSize: 17 }}>This measures where you start, not where you'll finish. It changes one thing: how your first weeks' hours are split.</div></div>}
        <div className="muted" style={{ fontSize: 17, lineHeight: 1.4 }}>
          Answer every question; blanks cost more than guesses.{noteboard ? " Noteboard, not paper." : ""}
        </div>
        {rehearsal(piece, m.plan) && <div className="box"><div style={{ fontSize: 17 }}>A test rehearsal: somewhere other than home (a library or a co-working space), at the time of day you'd book, with the real test's breaks.</div></div>}
        <LinkOut url={MBA_URL} label="Open mba.com" small={false} color={{ c: k.c, d: k.d }}
          fallback={() => ({ label: "Move it to tomorrow", run: () => void move(plusDays(today, 1), "mba.com isn't loading. The mock moves to tomorrow.") })} />
        <button className="btn ghost small" style={{ alignSelf: "flex-start" }} onClick={() => { const day = moveMockDay(today, lastMock); void move(day, `Moved to ${longDate(day)}.`); }}>Move it</button>
        {toast && <div className="note"><div style={{ fontSize: 17 }}>{toast}</div></div>}
        <div className="box">
          <div className="small">When you're back: your scores</div>
          {(["total", "quant", "verbal", "di"] as const).map((key) => (
            <div className="field" key={key}><span>{key === "di" ? "Data Insights" : key[0].toUpperCase() + key.slice(1)}</span>
              <input inputMode="numeric" aria-label={key} value={scores[key]} onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value.replace(/\D/g, "") }))} style={{ width: 80 }} /></div>
          ))}
          <div className="tiny">{ptr.practice_run ? "The three section scores are enough; the total isn't needed." : "Total 205–805, ending in 5; sections 60–90."}</div>
          {problem && Object.values(scores).some(Boolean) && <div className="small" role="alert">{problem}</div>}
        </div>
        <div className="spacer" />
        <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={!!problem} onClick={() => void save()}>Save the scores</button>
      </div>
    </Screen>
  );
}

function MockAfter({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { m, d, content } = useApp();
  const res = m.mocks.find((x) => x.pieceId === piece.id);
  const ptr = piece.task.pointer;
  const [misses, setMisses] = useState<MockMiss[]>(d.mockMisses.get(piece.id) ?? []);
  const [row, setRow] = useState<{ section: MockMiss["section"]; topic: string; tag: Tag | null }>({ section: "quant", topic: "algebra", tag: null });
  const [saved, setSaved] = useState(d.mockMisses.has(piece.id));
  if (ptr.practice_run) {
    // a week-1 practice run gets no review, so it can be retaken
    return <Screen><div className="column"><div className="eyebrow">Logged</div><div className="title">Saved. That's your starting point; nothing else changes yet.</div>
      <div className="spacer" /><button className="btn" autoFocus onClick={() => onDone(null)}>Back to today</button></div></Screen>;
  }
  const verdict = res?.total ? mockVerdict(content!, piece.planWeek, res.total, d.settings.target) : null;
  const seenBefore = res && !res.fresh;
  const topics = row.section === "quant" ? [...QUANT_TOPICS] : row.section === "di" ? ["data sufficiency", "graphs & tables", "two-part analysis", "multi-source reasoning"] : ["rc", "cr"];
  const weakSection = res && res.quant !== null && res.verbal !== null && res.di !== null
    ? (Object.entries({ quant: res.quant, verbal: res.verbal, di: res.di }).sort((a, b) => a[1]! - b[1]!)[0][0] as MockMiss["section"]) : null;
  const weakTopics = weakSection ? [...new Set(misses.filter((x) => x.section === weakSection).map((x) => x.topic))].slice(0, 2) : [];
  return (
    <Screen>
      <div className="column" style={{ gap: 12 }}>
        <div className="eyebrow">Mock · done</div>
        {verdict && <div className="title" style={{ fontSize: 28 }}>{verdict.line}</div>}
        {seenBefore && <div style={{ fontSize: 17 }}>Expect this one a bit high; you've seen it.</div>}
        {verdict && !verdict.onTrack && weakSection && <RebuildOffer section={weakSection === "verbal" ? "rc" : weakSection} />}
        {!saved ? (
          <div className="box">
            <div style={{ fontSize: 18 }}>Up to ten misses, tagged (about 15 minutes). They're the best signal for what comes next.</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {(["quant", "verbal", "di"] as const).map((s) => (
                <button key={s} className="chip" onClick={() => setRow({ section: s, topic: s === "quant" ? "algebra" : s === "di" ? "data sufficiency" : "rc", tag: null })}
                  style={{ border: `1.5px solid ${row.section === s ? "var(--ink)" : "var(--line-2)"}` }}>{s === "di" ? "DI" : s}</button>
              ))}
            </div>
            <select value={row.topic} onChange={(e) => setRow((r) => ({ ...r, topic: e.target.value }))} style={{ height: 44 }}>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="row wrap" style={{ gap: 6 }}>
              {(row.section === "verbal" ? VERBAL_TAGS : QUANT_TAGS).map((t) => (
                <button key={t} className="chip" onClick={() => setRow((r) => ({ ...r, tag: t }))} style={{ border: `1.5px solid ${row.tag === t ? "var(--ink)" : "var(--line-2)"}`, background: row.tag === t ? "var(--ink)" : "transparent", color: row.tag === t ? "var(--paper)" : "inherit" }}>{t}</button>
              ))}
            </div>
            <div className="row">
              <button className="btn small outline" disabled={!row.tag || misses.length >= 10} onClick={() => { setMisses((x) => [...x, { section: row.section, topic: row.topic, tag: row.tag! }]); setRow((r) => ({ ...r, tag: null })); }}>Add this miss</button>
              <span className="small">{misses.length} of 10</span>
            </div>
            {misses.map((x, i) => <div key={i} className="small">{x.section} · {x.topic} · {x.tag}</div>)}
            <button className="btn small" onClick={async () => { await record({ type: "mock.misses", piece: piece.id, misses }); setSaved(true); }}>{misses.length ? "Save the misses" : "Skip the misses"}</button>
          </div>
        ) : (
          weakTopics.map((t) => <TopupOffer key={t} offer={{ id: `topup:mock:${piece.id}:${t}`, topic: t, section: weakSection === "di" ? "di" : weakSection === "quant" ? "quant" : t === "cr" ? "cr" : "rc", wrong: misses.filter((x) => x.topic === t).length, total: misses.length, cause: "concept", line: "" }} />)
        )}
        <div className="spacer" />
        {res?.official && <button className="btn small outline" onClick={() => go(`/tutor?ctx=${encodeURIComponent(`mock:${piece.id}`)}`)}>Debrief with your tutor</button>}
        <button className="btn" onClick={() => onDone(null)}>Back to today</button>
      </div>
    </Screen>
  );
}

/** Beyond the week's gap: a rebuild week before the next official mock, so one isn't used up too early. */
function RebuildOffer({ section }: { section: "quant" | "di" | "rc" }) {
  const { d, today } = useApp();
  const ws = plusDays(weekStartOf(today), 7);
  const id = `rebuild:${section}:${ws}`;
  if (d.offers.has(id)) return d.offers.get(id) === "yes" ? <div className="small">Next week is a rebuild week.</div> : null;
  const name = section === "di" ? "DI" : section === "quant" ? "quant" : "verbal";
  return (
    <div className="note">
      <div style={{ fontSize: 18 }}>A rebuild week on {name} before the next official mock: its new plan work pauses for a week of basics, and the finish date moves a week.</div>
      <div className="row">
        <button className="btn small" style={{ flex: 1 }} onClick={async () => {
          await record({ type: "offer", offer: id, answer: "yes" });
          await setSetting({ rebuild: [...(d.settings.rebuild ?? []), { week: ws, section }] });
        }}>Take a rebuild week</button>
        <button className="btn ghost small" onClick={() => void record({ type: "offer", offer: id, answer: "no" })}>Keep going</button>
      </div>
    </div>
  );
}

