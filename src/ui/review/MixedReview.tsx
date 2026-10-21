// Mixed review: returns and second tries, about 6–8 questions, no two neighbours on the same topic
// (spec: Mixed review chips; What a redo looks like, by source). Returning ones aren't marked as such.

import { useEffect, useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import { shortDate } from "../../core/calendar";
import { errorFront } from "../../core/cards";
import type { Answer, Tag } from "../../core/events";
import { inWords, markOne } from "../../core/grid";
import type { Item } from "../../core/review";
import { topicName } from "../../core/topics";
import { record } from "../../data/db";
import { Back, Screen, useKeys } from "../bits";
import { SUBJECT } from "../copy";
import { LinkOut } from "../LinkOut";
import { useTaskTime } from "../focus";
import { AnswerPick, LETTERS, TagPick, isTwoPart, showAnswer, tagsFor } from "./parts";

export function MixedReviewScreen({ id }: { id: string }) {
  const { m, d, bus } = useApp();
  const started = d.reviewStarted.get(id);
  const time = useTaskTime(id, bus ? "bus" : "desk", "mixed review");
  if (!started) return <Screen><Back /><div className="t">This review isn't here any more.</div></Screen>;
  const items = started.items.map((x) => m.reviews.items.get(x)).filter(Boolean) as Item[];
  const answered = (it: Item) => (d.attempts.get(it.id) ?? []).some((a) => a.review === id && a.attempt === "mixed");
  const cur = items.find((it) => !answered(it) || !closedHere(it, id, d));
  if (!cur) return <Finished id={id} items={items} onLeave={() => time.flush()} />;
  return (
    <Screen wide={cur.source === "rc"}>
      <div className="column" style={cur.source === "rc" ? { maxWidth: "none" } : undefined}>
        <Back label="← Today · pause" onClick={() => { time.flush(); go("/"); }} />
        <div className="eyebrow">Mixed review · {items.indexOf(cur) + 1} of {items.length}</div>
        <One key={cur.id} it={cur} review={id} />
      </div>
    </Screen>
  );
}

/** An item is finished here once it's answered and you've moved past its answer. */
function closedHere(it: Item, review: string, d: ReturnType<typeof useApp>["d"]): boolean {
  return d.seen.has(`mixed-next:${review}:${it.id}`);
}

function One({ it, review }: { it: Item; review: string }) {
  const { d, m, content } = useApp();
  const k = SUBJECT[it.section];
  const [pick, setPick] = useState<Answer>(null);
  const [needKey, setNeedKey] = useState(false);
  const [tag, setTag] = useState<Tag | null>(it.tag ?? null);
  const [line, setLine] = useState("");
  const att = (d.attempts.get(it.id) ?? []).filter((x) => x.review === review && x.attempt === "mixed").pop();
  const wasRight = att ? (att.right ?? (it.key !== undefined && it.key !== null && markOne(att.value, it.key as string | number[]) === "right")) : null;
  useEffect(() => { setPick(null); setNeedKey(false); }, [it.id]);

  const answer = async (value: Answer, right?: boolean) => {
    if (it.key === undefined && it.source !== "share" && it.source !== "log" && right === undefined) { setPick(value); setNeedKey(true); return; }
    await record({ type: "review.answer", review, item: it.id, attempt: "mixed", value, right });
  };
  const next = async () => {
    if (wasRight === false && !tag) return;
    if (wasRight === false && tag) {
      await record({ type: "review.tag", item: it.id, tag, line: line.trim() || undefined });
      if (line.trim()) await record({ type: "line", source: `review:${it.id}`, text: line.trim(), front: errorFront(it.section, it.topic, tag), topic: it.topic, section: it.section });
    }
    await record({ type: "seen", what: `mixed-next:${review}:${it.id}` });
  };
  useKeys(Object.fromEntries([
    ...LETTERS.map((L) => [L.toLowerCase(), () => !att && !isTwoPart(it) && setPick(L)]),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), () => { if (att && wasRight === false) { const t = tagsFor(it)[n - 1]; if (t) setTag(t); } }]),
    ["Enter", () => { if (!att && pick !== null && !needKey) void answer(pick); else if (att) void next(); }],
  ]), [att, pick, needKey, tag, line]);

  // after the answer: a dot, then the answer and a tag if it was wrong, or the retire line
  if (att) {
    const now = m.reviews.items.get(it.id)!;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ptr" style={{ background: k.t }}>{it.label}</div>
        {wasRight ? (
          now.state === "retired"
            ? <div className="title" style={{ fontSize: 28 }}>{m.reviews.retired} retired. {topicName(it.topic)}, the one from {shortDate(it.setDay)}. Right twice, a week or more apart.</div>
            : <div className="title" style={{ fontSize: 28 }}>Right.</div>
        ) : (
          <>
            {now.state === "stubborn" && <div style={{ fontSize: 18 }}>Three goes now. It joins the stubborn ones and comes back in ten days, in its own short session.</div>}
            <div className="title" style={{ fontSize: 28 }}>{now.key !== undefined ? <>Here it is: {showAnswer(now.key)}.</> : "Check the source's answer and explanation."}</div>
            {it.explanation && <div className="tiny">Where it's explained: {it.explanation}.</div>}
            <button className="back" style={{ color: "var(--link)" }} onClick={() => go(`/tutor?ctx=${encodeURIComponent(`item:${it.id}`)}`)}>Ask the tutor about this one</button>
            <TagPick it={it} value={tag} line={line} onTag={setTag} onLine={setLine} />
          </>
        )}
        <button className="btn" disabled={wasRight === false && !tag} onClick={() => void next()}>Next</button>
      </div>
    );
  }

  // a single reading question comes back with its passage, in the reader's plain font
  const passage = it.source === "rc" ? content?.rc_bank.sections.flatMap((x) => x.passages).find((p) => p.id === it.passageId) : null;
  const rcq = passage?.questions.find((q) => q.id === it.q);
  if (passage && rcq) {
    return (
      <div className="split" style={{ minHeight: 420 }}>
        <div className="left reading">{passage.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
        <div className="right">
          <div className="eyebrow" style={{ color: k.d }}>Reading · one question again</div>
          <div className="qtext">{rcq.stem}</div>
          {Object.entries(rcq.choices).map(([L, text]) => (
            <button key={L} className={`choice${pick === L ? " on" : ""}`} onClick={() => setPick(L)}><span className="l">{L}</span><span>{text}</span></button>
          ))}
          <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={pick === null} onClick={() => void answer(pick)}>Check it</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="eyebrow" style={{ color: k.d }}>{k.name}{it.state === "stubborn" ? " · a stubborn one" : ""}</div>
      {(it.source === "book" || it.source === "log" || (it.source === "share" && !it.url)) && <div className="ptr" style={{ background: k.t, fontSize: 14 }}>{it.label}</div>}
      {(it.source === "cr" || ((it.source === "share" || it.source === "log") && it.url)) && <LinkOut url={it.url!} label={it.source === "cr" ? `Open CR question ${it.n}` : "Open the question"} color={{ c: k.c, d: k.d }} />}
      <div className="muted" style={{ fontSize: 16 }}>From scratch, as if you'd never seen it.</div>
      {it.source === "share" || it.source === "log" ? (
        <div className="row">
          <button className="btn" style={{ flex: 1 }} onClick={() => void answer(null, true)}>Got it right</button>
          <button className="btn ghost" onClick={() => void answer(null, false)}>Wrong again</button>
        </div>
      ) : needKey ? (
        <div className="box">
          <div style={{ fontSize: 17 }}>{it.source === "cr" ? "Reveal the official answer on GMAT Club. What is it?" : "Your book's answer for this one?"}</div>
          <AnswerPick it={it} value={null} color={k.c} onPick={async (v) => {
            if (v === null) return;
            await record({ type: "key.entered", key: it.source === "cr" ? `cr:${it.url}` : `book:${it.book}:${it.n}`, value: v as string | number[] });
            setNeedKey(false);
            await record({ type: "review.answer", review, item: it.id, attempt: "mixed", value: pick });
          }} />
        </div>
      ) : (
        <>
          <AnswerPick it={it} value={pick} onPick={setPick} color={k.c} />
          <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={pick === null} onClick={() => void answer(pick)}>Check it</button>
        </>
      )}
    </div>
  );
}

function Finished({ id, items, onLeave }: { id: string; items: Item[]; onLeave: () => void }) {
  const { d, m } = useApp();
  useEffect(() => { if (!d.reviewDone.has(id)) void record({ type: "review.done", review: id }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const right = items.filter((it) => (d.attempts.get(it.id) ?? []).some((a) => a.review === id && (a.right ?? (it.key != null && markOne(a.value, it.key as string | number[]) === "right")))).length;
  const retiredHere = items.filter((it) => m.reviews.items.get(it.id)?.state === "retired" && m.reviews.items.get(it.id)?.retiredDay === m.today).length;
  useKeys({ Enter: () => { onLeave(); go("/"); } });
  return (
    <Screen><div className="column">
      <div className="eyebrow">Done</div>
      <div className="title">{inWords(right)} of {items.length} right.</div>
      {retiredHere > 0 && <div style={{ fontSize: 19 }}>{inWords(retiredHere)} retired today.</div>}
      <div className="spacer" />
      <button className="btn" autoFocus onClick={() => { onLeave(); go("/"); }}>Back to today</button>
    </div></Screen>
  );
}
