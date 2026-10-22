// A set's review, 1–3 days after it was logged (spec: After a set: log now, review later).
// Full path: retry the wrong and not-sure ones blind → dots → last try → the answers → tags → close.
// No-key path (CR, or marking against your own book): retry the not-sure ones → type the official
// letters → the answers → tags → close.

import { useEffect, useMemo, useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import { plusDays, weekStartOf } from "../../core/calendar";
import { errorFront } from "../../core/cards";
import type { Answer, ReviewStep, Tag } from "../../core/events";
import { markOne, inWords } from "../../core/grid";
import { closeOf } from "../../core/results";
import { topupOffers, type TopupOffer as Offer } from "../../core/adapt";
import { topicName } from "../../core/topics";
import type { Item, SetReview as SR } from "../../core/review";
import { record } from "../../data/db";
import { Back, Screen, useKeys } from "../bits";
import { SUBJECT, titleOf } from "../copy";
import { LinkOut } from "../LinkOut";
import { useTaskTime } from "../focus";
import { AnswerPick, Dot, KeyLine, LETTERS, TagPick, isTwoPart, showAnswer, tagsFor } from "./parts";
import { Star } from "../tasks/Grid";
import { Tip } from "../Onboarding";
import { closeRemedies } from "../../core/recall";

export function SetReviewScreen({ id }: { id: string }) {
  const { m } = useApp();
  const s = m.reviews.setById.get(id);
  if (!s) return <Screen><Back /><div className="t">This review isn't here any more.</div></Screen>;
  return <Inner s={s} />;
}

const right = (it: Item, v: Answer) => it.key !== undefined && it.key !== null && markOne(v, it.key as string | number[]) === "right";

function Inner({ s }: { s: SR }) {
  const { m, d, bus } = useApp();
  const k = SUBJECT[s.section];
  const piece = m.plan.find((p) => p.taskId === s.taskId)!;
  const time = useTaskTime(s.id, bus ? "bus" : "desk", "review");
  const att = (it: Item, kind: "retry" | "last") => (d.attempts.get(it.id) ?? []).filter((a) => a.review === s.id && a.attempt === kind).pop();
  const retryList = s.path === "full" ? s.items : s.items.filter((it) => it.firstUnsure);
  const steps: ReviewStep[] = s.path === "full" ? ["retry", "dots", "last", "answers", "tags", "close"] : ["retry", "key", "answers", "tags", "close"];
  const saved = d.reviewStep.get(s.id);
  const [step, setStepState] = useState<ReviewStep>(saved ?? "retry");
  const setStep = (st: ReviewStep) => { setStepState(st); void record({ type: "review.step", review: s.id, step: st }); time.poke(); };

  useEffect(() => {
    if (!d.reviewStarted.has(s.id)) void record({ type: "review.started", review: s.id, items: s.items.map((it) => it.id) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const next = (from: ReviewStep) => {
    let i = steps.indexOf(from) + 1;
    // skip steps with nothing in them
    while (i < steps.length) {
      const st = steps[i];
      if (st === "last" && !retryList.some((it) => !right(it, att(it, "retry")?.value ?? null))) { i++; continue; }
      if (st === "dots" && !retryList.length) { i++; continue; }
      if (st === "tags" && !s.items.some((it) => it.needsTag)) { i++; continue; }
      if (st === "answers" && !s.items.some((it) => it.entered)) { i++; continue; }
      break;
    }
    setStep(steps[Math.min(i, steps.length - 1)]);
  };

  const header = (
    <>
      <Back label="← Today · pause" onClick={() => { time.flush(); go("/"); }} />
      <div className="eyebrow" style={{ color: k.d }}>{k.name} · the review · {titleOf(piece).replace(/, (first|second) half$/, "")}</div>
    </>
  );

  if (step === "retry") return <Retry s={s} list={retryList} header={<>{header}<Tip id="review">The review: the ones you missed or weren't sure of, from scratch, with the answers hidden. Trying again before you see the answer is what makes it stick.</Tip></>} onDone={() => next("retry")} />;
  if (step === "dots") {
    const ok = retryList.filter((it) => right(it, att(it, "retry")?.value ?? null)).length;
    const left = retryList.length - ok;
    return (
      <Screen><div className="column">
        {header}
        <div className="title">{left ? `${inWords(ok)} came right. ${inWords(left)} to go.` : `${inWords(ok)} came right.`}</div>
        <div className="row wrap" style={{ gap: 10 }}>{retryList.map((it) => <Dot key={it.id} right={right(it, att(it, "retry")?.value ?? null)} />)}</div>
        <div className="muted" style={{ fontSize: 17 }}>No letters yet. {left ? "One last try on the hollow ones." : ""}</div>
        <div className="spacer" />
        <EnterButton label="Next" onClick={() => next("dots")} />
      </div></Screen>
    );
  }
  if (step === "last") {
    const hollow = retryList.filter((it) => !right(it, att(it, "retry")?.value ?? null));
    return <Retry s={s} list={hollow} header={header} kind="last" onDone={() => next("last")} />;
  }
  if (step === "key") return <KeyStep s={s} header={header} onDone={() => next("key")} />;
  if (step === "answers") return <Answers s={s} header={header} onDone={() => next("answers")} />;
  if (step === "tags") return <Tags s={s} header={header} onDone={() => next("tags")} />;
  return <Close s={s} header={header} done={() => time.flush()} />;
}

function EnterButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  useKeys({ Enter: () => { if (!disabled) onClick(); } }, [disabled, onClick]);
  return <button className="btn" disabled={disabled} onClick={onClick}>{label}</button>;
}

/** The blind retry (and the last try): from scratch, letters hidden. */
function Retry({ s, list, header, kind = "retry", onDone }: { s: SR; list: Item[]; header: React.ReactNode; kind?: "retry" | "last"; onDone: () => void }) {
  const { d, content } = useApp();
  const k = SUBJECT[s.section];
  const pending = list.filter((it) => !(d.attempts.get(it.id) ?? []).some((a) => a.review === s.id && a.attempt === kind));
  const it = pending[0];
  const [pick, setPick] = useState<Answer>(null);
  useEffect(() => setPick(null), [it?.id]);
  useEffect(() => { if (!it) onDone(); }, [it]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!it || pick === null) return;
    await record({ type: "review.answer", review: s.id, item: it.id, attempt: kind, value: pick });
  };
  useKeys(Object.fromEntries([
    ...LETTERS.map((L) => [L.toLowerCase(), () => it && !isTwoPart(it) && setPick(L)]),
    ["Enter", () => void submit()],
  ]), [it?.id, pick]);
  if (!it) return null;

  const n = list.length, at = n - pending.length + 1;
  const passage = it.source === "rc" ? content?.rc_bank.sections.flatMap((x) => x.passages).find((p) => p.id === it.passageId) : null;
  const rcq = passage?.questions.find((q) => q.id === it.q);
  const lead = kind === "last" ? "Last try." : s.path === "fallback" ? "The not-sure ones, from scratch." : `${inWords(n)} to look at again.`;

  const question = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontSize: 19 }}>{lead}</span><span className="tiny">{at} of {n} · letters hidden</span>
      </div>
      {it.source === "book" && <div className="ptr" style={{ background: k.t }}>{it.label}</div>}
      {it.source === "cr" && <LinkOut url={it.url!} label={`Open question ${it.n}`} color={{ c: k.c, d: k.d }} />}
      {rcq ? (
        <>
          <div className="qtext">{rcq.stem}</div>
          {Object.entries(rcq.choices).map(([L, text]) => (
            <button key={L} className={`choice${pick === L ? " on" : ""}`} onClick={() => setPick(L)}><span className="l">{L}</span><span>{text}</span></button>
          ))}
        </>
      ) : (
        <AnswerPick it={it} value={pick} onPick={setPick} color={k.c} />
      )}
      <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={pick === null || (Array.isArray(pick) && pick.some((x) => !x))} onClick={() => void submit()}>Next</button>
      <div className="tiny">From scratch: as if you'd never seen it. A–E to choose, Enter for next.</div>
    </div>
  );
  return (
    <Screen wide={!!passage}>
      {header}
      {passage ? (
        <div className="split">
          <div className="left reading">{passage.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
          <div className="right">{question}</div>
        </div>
      ) : <div className="column">{question}</div>}
    </Screen>
  );
}

/** No key in the file: reveal the official answers on GMAT Club (or your book's key) and type them in one line. */
function KeyStep({ s, header, onDone }: { s: SR; header: React.ReactNode; onDone: () => void }) {
  const save = async (letters: string[]) => {
    for (let i = 0; i < s.all.length; i++) {
      const it = s.all[i];
      const key = it.source === "cr" ? `cr:${it.url}` : `book:${it.book}:${it.n}`;
      await record({ type: "key.entered", key, value: letters[i] });
    }
    onDone();
  };
  const cr = s.task.kind === "cr_set";
  return (
    <Screen><div className="column">
      {header}
      <div className="title">Now the official answers.</div>
      <div className="muted" style={{ fontSize: 17, lineHeight: 1.4 }}>
        {cr ? "Open each question's thread on GMAT Club, reveal the official answer, and type them all in one line, in order. Later redos are marked from these."
          : "Open your book's answer key and type the letters for this block in one line, in order."}
      </div>
      {cr && <div className="row wrap" style={{ gap: 6 }}>{s.all.map((it) => <LinkOut key={it.id} url={it.url!} label={`${it.n}`} />)}</div>}
      <KeyLine count={s.all.length} onDone={(l) => void save(l)} hint={`${s.all.length} letters, question 1 first.`} />
    </div></Screen>
  );
}

/** "Here they are." Your letter beside the right one, and where the explanation is. Every mark can be corrected. */
function Answers({ s, header, onDone }: { s: SR; header: React.ReactNode; onDone: () => void }) {
  const { d } = useApp();
  const shown = s.items.filter((it) => it.entered);
  const [fixing, setFixing] = useState<{ it: Item; what: "book" | "mine" } | null>(null);
  return (
    <Screen><div className="column">
      {header}
      <div className="title">Here they are.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((it) => {
          const retry = (d.attempts.get(it.id) ?? []).filter((a) => a.review === s.id && a.attempt === "retry").pop();
          return (
            <div key={it.id} className="box" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: 13 }}>{it.label}</span>
                {it.firstUnsure && it.firstMark === "right" && <span className="tiny">right, not sure</span>}
              </div>
              <div style={{ fontSize: 18 }}>
                Yours: <b>{showAnswer(it.first)}</b>{retry ? <> · on the retry: <b>{showAnswer(retry.value)}</b></> : null} · the answer: <b>{showAnswer(it.key)}</b>
              </div>
              {it.explanation && <div className="tiny">Where it's explained: {it.explanation}.</div>}
              {it.source === "book" && (
                <div className="row">
                  <button className="back" onClick={() => setFixing({ it, what: "book" })}>My book says…</button>
                  <button className="back" onClick={() => setFixing({ it, what: "mine" })}>I entered it wrong</button>
                  <button className="back" style={{ color: "var(--link)" }} onClick={() => go(`/tutor?ctx=${encodeURIComponent(`item:${it.id}`)}`)}>Ask the tutor</button>
                </div>
              )}
              {it.source !== "book" && <button className="back" style={{ color: "var(--link)" }} onClick={() => go(`/tutor?ctx=${encodeURIComponent(`item:${it.id}`)}`)}>Ask the tutor about this one</button>}
              {fixing?.it.id === it.id && (
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="small">{fixing.what === "book" ? "Your book's answer:" : "What you meant to enter:"}</span>
                  <AnswerPick it={it} value={null} color="var(--ink)" onPick={async (v) => {
                    if (v === null || (Array.isArray(v) && v.some((x) => !x))) return;
                    if (fixing.what === "book") await record({ type: "key.override", book: it.book!, n: it.n!, value: v as string | number[] });
                    else await record({ type: "answer", piece: it.pieceId, q: it.n!, value: v, unsure: it.firstUnsure, sinceStartMs: 0, fix: true });
                    setFixing(null);
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!shown.length && <div className="muted" style={{ fontSize: 17 }}>Every one came out right.</div>}
      {s.all.some((it) => !it.entered && it.firstMark === "right") && (
        <div className="box" style={{ gap: 6 }}>
          <div style={{ fontSize: 17 }}>Right ones worth another look? Star them and they come back in a week, then two weeks later.</div>
          <div className="row wrap" style={{ gap: 4 }}>
            {s.all.filter((it) => !it.entered && it.firstMark === "right").map((it) => <Star key={it.id} item={it.id} auto={it.look === "slow"} label={it.n !== undefined ? String(it.n) : it.label.replace(/^.*?(passage \d+, question \d+)$/, "$1")} />)}
          </div>
          {s.all.some((it) => it.look === "slow") && <div className="tiny">Starred already: right, but slower than the plan's time. Unstar any you'd rather not see.</div>}
        </div>
      )}
      <div className="spacer" />
      <EnterButton label="Next" onClick={onDone} />
    </div></Screen>
  );
}

/** Tag and one line for every question that was wrong on the first try (fixed later or not). */
function Tags({ s, header, onDone }: { s: SR; header: React.ReactNode; onDone: () => void }) {
  const { d } = useApp();
  const need = s.items.filter((it) => it.needsTag);
  const [tags, setTags] = useState<Record<string, Tag | null>>(() => Object.fromEntries(need.map((it) => [it.id, d.tags.get(it.id)?.tag ?? null])));
  const [lines, setLines] = useState<Record<string, string>>(() => Object.fromEntries(need.map((it) => [it.id, d.tags.get(it.id)?.line ?? ""])));
  const all = need.every((it) => tags[it.id]);
  // keyboard: 1–8 tags the first one without a tag; Enter goes on once all are tagged
  useKeys(Object.fromEntries([
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), () => {
      const it = need.find((x) => !tags[x.id]);
      const t = it && tagsFor(it)[n - 1];
      if (it && t) setTags((x) => ({ ...x, [it.id]: t }));
    }]),
    ["Enter", () => { if (all) void save(); }],
  ]), [tags, lines, all]);
  const save = async (later = false) => {
    for (const it of need) {
      if (!tags[it.id]) continue;            // the ones without a reason wait for later
      const tag = tags[it.id]!, line = lines[it.id].trim();
      const prev = d.tags.get(it.id);
      if (prev?.tag !== tag || (prev?.line ?? "") !== line) await record({ type: "review.tag", item: it.id, tag, line: line || undefined });
      if (line && (prev?.line ?? "") !== line) await record({ type: "line", source: `review:${it.id}`, text: line, front: errorFront(it.section, it.topic, tag), topic: it.topic, section: it.section });
    }
    if (later) { await record({ type: "review.step", review: s.id, step: "tags" }); go("/"); return; }
    onDone();
  };
  return (
    <Screen><div className="column">
      {header}
      <div className="title">Why each one went wrong.</div>
      <div className="muted" style={{ fontSize: 16 }}>Tap a reason for each (or press 1–{need[0] ? tagsFor(need[0]).length : 4}). The line is optional; anything you write becomes a card.</div>
      {need.map((it) => (
        <div key={it.id} className="box" style={{ gap: 8 }}>
          <span className="mono" style={{ fontSize: 13 }}>{it.label}</span>
          <TagPick it={it} value={tags[it.id]} line={lines[it.id]} onTag={(t) => setTags((x) => ({ ...x, [it.id]: t }))} onLine={(v) => setLines((x) => ({ ...x, [it.id]: v }))} />
        </div>
      ))}
      <div className="spacer" />
      <div className="row">
        <button className="btn" style={{ flex: 1 }} disabled={!all} onClick={() => void save()}>Next</button>
        <button className="btn ghost" disabled={all || !need.some((it) => tags[it.id])} onClick={() => void save(true)}>Save these, finish later</button>
      </div>
    </div></Screen>
  );
}

function Close({ s, header, done }: { s: SR; header: React.ReactNode; done: () => void }) {
  const { m, d, content, today } = useApp();
  const items = s.items;
  const linesWritten = items.filter((it) => d.tags.get(it.id)?.line).length;
  const sum = useMemo(() => closeOf(content!, s, items, linesWritten, d.settings, today, plusDays(weekStartOf(today), 7)), [s, items, linesWritten]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = m.adapt.history(weekStartOf(today));
  const offers = useMemo(() => topupOffers(s.all, m.reviews, hist), [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rem = useMemo(() => closeRemedies(s, m), [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = async (home = true) => {
    if (sum.add && !d.extras.has(sum.add.id)) await record({ type: "extra.added", extra: sum.add });
    for (const x of rem.add) if (!d.extras.has(x.id)) await record({ type: "extra.added", extra: x });
    if (!d.reviewDone.has(s.id)) await record({ type: "review.done", review: s.id });
    done();
    if (home) go("/");
  };
  return (
    <Screen><div className="column">
      {header}
      <div className="eyebrow">Done</div>
      {sum.diagnosis && <div className="title" style={{ fontSize: 28 }}>{sum.diagnosis}</div>}
      {sum.rc && (
        <div className="box">
          <Bars title="By question type" rows={sum.rc.byType} />
          <Bars title="By passage topic" rows={sum.rc.byTopic} />
        </div>
      )}
      {sum.careless && <div style={{ fontSize: 18 }}>{sum.careless}</div>}
      {sum.scheduled && <div style={{ fontSize: 18 }}>{sum.scheduled}</div>}
      {sum.cards && <div style={{ fontSize: 18 }}>{sum.cards}</div>}
      {sum.add && <div className="small">Added to next week: {sum.add.title}.</div>}
      {rem.lines.map((l) => <div key={l} style={{ fontSize: 17 }}>{l}</div>)}
      {offers.map((o) => <TopupOffer key={o.id} offer={o} />)}
      {!offers.length && (rem.teach || rem.walk) && (
        <div className="row wrap" style={{ gap: 8 }}>
          {rem.teach && <button className="btn small outline" onClick={async () => { await finish(false); go(`/tutor?ctx=${encodeURIComponent(`topic:${rem.teach}`)}`); }}>Learn {topicName(rem.teach).toLowerCase()} again with the tutor</button>}
          {rem.walk && <button className="btn small outline" onClick={async () => { await finish(false); go(`/tutor?ctx=${encodeURIComponent(`topic:${rem.walk}`)}`); }}>Walk through a {topicName(rem.walk).toLowerCase()} question with the tutor</button>}
        </div>
      )}
      {(rem.teach || rem.walk) && <div className="tiny">A week from now, six new questions on it check that it's stuck.</div>}
      {!offers.length && !rem.teach && !rem.walk && items.some((it) => it.firstMark === "wrong") && (
        <button className="btn small outline" style={{ alignSelf: "flex-start" }} onClick={async () => { await finish(false); go(`/tutor?ctx=${encodeURIComponent(`review:${s.id}`)}`); }}>Go through these with the tutor</button>
      )}
      <div className="spacer" />
      <EnterButton label="Back to today" onClick={() => void finish()} />
    </div></Screen>
  );
}

function Bars({ title, rows }: { title: string; rows: { name: string; right: number; total: number }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="eyebrow">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="row" style={{ gap: 10 }}>
          <span style={{ width: 150, fontSize: 15 }}>{r.name}</span>
          <div className="bar" style={{ flex: 1, height: 8 }}><div style={{ width: `${r.total ? (100 * r.right) / r.total : 0}%`, background: "var(--rc)" }} /></div>
          <span className="tiny" style={{ width: 50, textAlign: "right" }}>{r.right} of {r.total}</span>
        </div>
      ))}
    </div>
  );
}

/** "Number properties is shaky: 7 of 12 wrong, mostly concept. Here are 8 more, easier ones first." */
export function TopupOffer({ offer }: { offer: Offer }) {
  const { m, d, today } = useApp();
  const ws = weekStartOf(today);
  const answered = d.offers.get(offer.id);
  if (answered) return answered === "add" ? <div className="small">Added to this week.</div> : null;
  return (
    <div className="note">
      <div style={{ fontSize: 18 }}>{m.adapt.topupLine(offer)}</div>
      <div className="row">
        <button className="btn small outline" style={{ flex: 1 }} onClick={async () => {
          const spec = m.adapt.topupSpec(offer, ws);
          if (spec) await record({ type: "extra.added", extra: spec });
          await record({ type: "offer", offer: offer.id, answer: "add" });
        }}>Add to this week</button>
        <button className="btn ghost small" onClick={() => void record({ type: "offer", offer: offer.id, answer: "notnow" })}>Not now</button>
      </div>
    </div>
  );
}
