// Home: the level line, % with hours under it, weeks done and errors retired, at most one note, then
// one card with Start and Skip (spec: Progress; How the app decides what's on the card).

import { useEffect, useMemo, useRef, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { alternativeFor, chooseCard, type Card } from "../core/card";
import { longDate } from "../core/calendar";
import type { MixChoice } from "../core/events";
import { inWords } from "../core/grid";
import { restTaken } from "../core/weekly";
import { moveMockDay } from "../core/mocks";
import { MIX_NAMES } from "../core/mix";
import { cardContext } from "../core/model";
import type { Piece } from "../core/pieces";
import { hoursLogged, levelView, weeksInARow } from "../core/progress";
import { record } from "../data/db";
import { Screen, openOut, useKeys, useToast } from "./bits";
import { SUBJECT, metaOf, pointerOf, titleOf, whereOf } from "./copy";
import { useFocus } from "./focus";
import { NoteStack } from "./Notes";
import { WARMUP_MIN } from "./Cards";

const MBA_URL = "https://www.mba.com/";   // link catalogue L153

export function useCardCtx() {
  const { m, bus, online } = useApp();
  return useMemo(() => cardContext(m, { bus, online }), [m, bus, online]);
}

export function Home() {
  const a = useApp();
  const { m, d, today, week, bus } = a;
  const focus = useFocus();
  const [toast, say] = useToast();
  const [skipFor, setSkipFor] = useState<{ skipped: Piece | null; alt: Piece | null } | null>(null);
  const { ctx, rec, chosen } = useCardCtx();
  const card = chooseCard(ctx);

  const lv = levelView(m.level, m.plan, d.done);
  const inRow = weeksInARow(d.counted, week?.weekStart ?? today);

  async function start(p: Piece, warmup = false) {
    if (!d.mixByDay.has(today) && !bus) await record({ type: "mix", choice: chosen });
    if (!d.started.has(p.id)) await record({ type: "piece.started", piece: p.id, mode: bus ? "bus" : "desk" });
    if (!bus) focus.startSitting();
    const path = `/task/${encodeURIComponent(p.id)}`;
    // the first piece of the day at a desk starts with a few due cards (skip it any time)
    if (warmup && !bus && !d.seen.has(`warmup:${today}`) && m.cardsDue >= WARMUP_MIN) go(`/cards?warm=1&then=${encodeURIComponent(path)}`);
    else go(path);
  }
  async function startMixed(items: { id: string }[]) {
    const id = `mixed:${Date.now().toString(36)}`;
    await record({ type: "review.started", review: id, items: items.map((x) => x.id) });
    if (!bus) focus.startSitting();
    go(`/review/${encodeURIComponent(id)}`);
  }
  async function skip(id: string, p: Piece | null) {
    await record({ type: "skip", piece: id });
    setSkipFor({ skipped: p, alt: p ? alternativeFor(p, ctx) : null });
  }

  const primary = (): (() => void) | null => {
    switch (card.kind) {
      case "task": return () => void start(card.piece, card.piece.task.kind !== "cards" && card.piece.task.kind !== "recall");
      case "resume": case "mock": case "redo": return () => void start(card.piece);
      case "review": return () => go(`/review/${encodeURIComponent(card.set.id)}`);
      case "resumeReview": return () => go(`/review/${encodeURIComponent(card.review)}`);
      case "mixed": return () => void startMixed(card.items);
      case "cards": case "back": return () => { if (card.kind === "back") void record({ type: "seen", what: `back:${today}` }); go("/cards"); };
      default: return null;
    }
  };
  useKeys({
    Enter: () => { if (skipFor) return; primary()?.(); },
    s: () => {
      if (card.kind === "task") void skip(card.piece.id, card.piece);
      else if (card.kind === "review") void skip(card.set.id, null);
      else if (card.kind === "mixed") void skip("mixed", null);
    },
    b: () => void record({ type: "bus", on: !bus }),
    w: () => go("/week"),
  }, [card, bus, skipFor]);

  // the retired count is the only number that animates
  const lastRetired = useRef(m.reviews.retired);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (m.reviews.retired > lastRetired.current) { setPulse(true); const t = setTimeout(() => setPulse(false), 1600); lastRetired.current = m.reviews.retired; return () => clearTimeout(t); }
    lastRetired.current = m.reviews.retired;
  }, [m.reviews.retired]);

  return (
    <Screen right={card.kind === "task" || card.kind === "resume" ? `plan week ${card.piece.planWeek || ""}`.trim() : ""}>
      <div className="column">
        <button onClick={() => go("/progress")} style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }} title="The journey">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 16 }}>{lv.label}</span><span className="tiny" style={{ fontSize: 10 }}>{lv.next}</span>
          </div>
          <div className="bar"><div style={{ width: `${Math.round(lv.frac * 100)}%`, background: "var(--ink)" }} /></div>
        </button>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 66, lineHeight: 0.9 }}>{m.pct}%</div>
            <div className="small" style={{ marginTop: 4 }}>{hoursLogged(d)} hours</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
            <div style={{ fontSize: 17, color: "var(--ink-2)" }}>{d.counted.size} {d.counted.size === 1 ? "week" : "weeks"}{inRow >= 2 ? ` · ${inRow} in a row` : ""}</div>
            <button className="row" style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }} onClick={() => go("/errors")} title="What to work on">
              <span className="dot" style={{ width: 7, height: 7, background: "var(--rc)", animation: "breathe 4.6s ease-in-out infinite" }} />
              <span className={pulse ? "pulse" : undefined} style={{ fontSize: 19, color: "var(--rc-d)" }}>{m.reviews.retired} retired</span>
            </button>
          </div>
        </div>

        <NoteStack />

        {!bus && card.kind === "task" && (
          <MixSwitch chosen={chosen} rec={rec.choice} reason={d.mixByDay.has(today) ? null : rec.reason} />
        )}

        <CardView card={card} onPrimary={primary()} onSkip={
          card.kind === "task" ? () => void skip(card.piece.id, card.piece)
            : card.kind === "review" ? () => void skip(card.set.id, null)
              : card.kind === "mixed" ? () => void skip("mixed", null) : undefined} />

        {skipFor && (
          <div className="note">
            {skipFor.alt ? (
              <>
                <div style={{ fontSize: 19 }}>Instead: {titleOf(skipFor.alt)}</div>
                <div className="small">{metaOf(skipFor.alt)}</div>
                <div className="row">
                  <button className="btn small outline" style={{ flex: 1 }} onClick={() => { setSkipFor(null); void start(skipFor.alt!); }}>Do this</button>
                  <button className="btn ghost small" onClick={() => { setSkipFor(null); say("It's here when you are."); }}>Neither, later</button>
                </div>
              </>
            ) : (
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ fontSize: 18 }}>It's here when you are.</span>
                <button className="btn ghost small" onClick={() => setSkipFor(null)}>OK</button>
              </div>
            )}
          </div>
        )}

        <div className="spacer" />
        <div className="row">
          {bus ? (
            <button className="btn small" style={{ width: 150, background: "var(--rc)", borderColor: "var(--rc)" }} onClick={() => void record({ type: "bus", on: false })}>Off the bus</button>
          ) : (
            <button className="btn small outline" style={{ width: 110, borderColor: "var(--rc)", color: "var(--rc-d)" }} onClick={() => void record({ type: "bus", on: true })} title="B">Bus</button>
          )}
          {m.busChip && !bus && (
            <button className="chip" style={{ border: "1.5px dashed var(--rc)", color: "var(--rc-d)" }} onClick={() => void record({ type: "bus", on: true })}>On the bus?</button>
          )}
          <div className="spacer" />
          <button className="back" onClick={() => go("/life")}>Something came up</button>
        </div>
        <nav className="row" style={{ justifyContent: "space-between", borderTop: "1.5px solid var(--line)", paddingTop: 4 }}>
          <NavLink to="/week" label="This week" />
          <NavLink to="/map" label="Map" />
          <NavLink to="/progress" label="Progress" />
          <NavLink to="/errors" label="What to work on" />
          <NavLink to="/tutor" label="Tutor" />
          <NavLink to="/settings" label="Settings" />
          {import.meta.env.DEV && <NavLink to="/dev" label="Time machine" />}
        </nav>
      </div>
      {toast}
    </Screen>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return <button className="back" style={{ padding: "12px 4px", color: "var(--ink)" }} onClick={() => go(to)}>{label}</button>;
}

function MixSwitch({ chosen, rec, reason }: { chosen: MixChoice; rec: MixChoice; reason: string | null }) {
  const opts: { v: MixChoice; label: string }[] = [
    { v: "mix", label: "Bit of everything" }, { v: "quant", label: `Just ${MIX_NAMES.quant.toLowerCase()}` },
    { v: "verbal", label: `Just ${MIX_NAMES.verbal.toLowerCase()}` }, { v: "di", label: "Just DI" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="row" style={{ gap: 6, paddingBottom: 12, overflowX: "auto" }}>
        {opts.map((o) => {
          const on = o.v === chosen;
          return (
            <button key={o.v} onClick={() => void record({ type: "mix", choice: o.v })}
              style={{ position: "relative", flex: "none", border: `1.5px solid ${on ? "var(--ink)" : "var(--line-2)"}`, background: on ? "var(--ink)" : "transparent",
                color: on ? "var(--paper)" : "var(--ink-2)", borderRadius: 18, padding: "6px 12px", fontSize: 14, cursor: "pointer", minHeight: 36 }}>
              {o.label}
              {o.v === rec && <span style={{ position: "absolute", left: "50%", bottom: -14, transform: "translateX(-50%)", font: "700 7.5px var(--mono)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--faint)" }}>recommended</span>}
            </button>
          );
        })}
      </div>
      {reason && <div className="tiny" style={{ color: "var(--muted)" }}>{reason}</div>}
    </div>
  );
}

interface View {
  col: string; t: string; dk: string; eb: string; title: string; ptr?: string; meta?: string; body?: string; where?: string;
  start?: string; skip?: string; onStart?: () => void; onSkip?: () => void; prog?: { w: number; t: string }; next?: string; time?: boolean;
  border?: string; second?: { label: string; run: () => void };
}

function CardView({ card, onPrimary, onSkip }: { card: Card; onPrimary: (() => void) | null; onSkip?: () => void }) {
  const a = useApp();
  const { d, today, m } = a;
  const timechip = d.timechipByDay.get(today) ?? null;
  const cycleTime = () => void record({ type: "timechip", minutes: timechip === null ? 30 : timechip === 30 ? 60 : null });
  const neutral = { col: "var(--gen)", t: "var(--gen-t)", dk: "var(--gen-d)" };
  const cardsK = { col: "var(--rc)", t: "var(--rc-t)", dk: "var(--rc-d)" };
  let v: View;

  switch (card.kind) {
    case "warmup":
      v = card.step === "mba"
        ? { ...neutral, eb: `Before ${longDate(d.settings.startDate).replace(/ \d{4}$/, "")}`, title: "Make a free mba.com account",
            ptr: "Unlocks the free Starter Kit and Official Practice Exams 1 and 2", meta: "about 5 minutes", where: "opens mba.com",
            start: "Open mba.com ↗", onStart: () => { openOut(MBA_URL); void record({ type: "admin", piece: "warmup-mba", answer: "done" }); } }
        : { ...neutral, eb: `Before ${longDate(d.settings.startDate).replace(/ \d{4}$/, "")}`, title: "Nothing until the plan starts.",
            body: `Week 1 opens on ${longDate(d.settings.startDate)}. Exam 1 is saved for plan week 8, so there's no mock yet, and no booking.` };
      break;
    case "pause":
      v = { ...neutral, eb: "Pause week", title: "Nothing on the plan this week.", body: "Rest counts." };
      break;
    case "late":
      v = { ...neutral, eb: "Tonight", title: "Nothing tonight.", body: card.moved ? "Tomorrow's redo moved a day. Sleep does more for it than another hour tonight." : "Sleep does more for tomorrow than another set." };
      break;
    case "back":
      v = { ...cardsK, eb: "Welcome back", title: "Back. That's the whole game.", body: "A few cards to warm up, then the next thing on the plan.", where: "reads here", start: "Cards" };
      break;
    case "end": {
      const lines: Record<typeof card.phase, [string, string | undefined]> = {
        checklist: ["The test-day checklist.", "Your ID (your passport), the centre's address and how you'll get there, the start time, and arriving 30 minutes early."],
        cardsonly: ["Cards, if you want them.", undefined],
        daybefore: ["Nothing today. Sleep does the rest.", undefined],
        testday: ["Today's the test. Nothing else is on here.", undefined],
        after: ["How did it go?", undefined],
      };
      v = { ...neutral, eb: "The test", title: lines[card.phase][0], body: lines[card.phase][1] };
      if (card.phase === "checklist" && !d.seen.has("checklist")) v = { ...v, start: "Done", onStart: () => void record({ type: "seen", what: "checklist" }) };
      if (card.phase === "after") return <AfterTest />;
      break;
    }
    case "weekdone":
      v = { ...neutral, eb: "This week", title: "The week is done.", body: restTaken(m.weekStart, d, today) ? "Cards, or rest. Rest counts." : "A rest day this week helps the next one. Cards if you'd like.", start: m.cards.length ? "Cards" : undefined, onStart: () => go("/cards") };
      break;
    case "cards":
      v = { ...cardsK, eb: card.why === "late" ? "Tonight" : "Cards", title: card.why === "late" ? "Cards, or nothing tonight." : card.why === "fallback" ? "Nothing else fits right now. Cards do." : "Cards",
        ptr: "10–15 cards", meta: "about 10 minutes", where: "reads here", start: "Start", border: "2px dashed var(--rc)" };
      break;
    case "nothing":
      v = { ...neutral, eb: "Right now",
        title: card.why === "bus" ? "Nothing that fits the ride. Enjoy it." : card.why === "offline" ? "Nothing that works offline right now." : card.why === "skipped" ? "It's here when you are." : "Nothing that fits right now.",
        body: card.why === "slotEnding" ? "The morning's nearly over. The next piece waits for more time."
          : card.why === "slot" ? "The next pieces need more time than this slot has. They're here at the next sitting." : undefined };
      break;
    case "review": {
      const s = card.set, k = SUBJECT[s.section];
      const p = m.plan.find((x) => x.taskId === s.taskId)!;
      v = { col: k.c, t: k.t, dk: k.d, eb: `${k.name} · review`, title: `The review: ${titleOf(p).replace(/, (first|second) half$/, "")}`,
        ptr: s.path === "full" ? `${inWords(s.items.length)} to look at again, from scratch` : "The not-sure ones, then the official answers",
        meta: `about ${s.minutes} minutes`, where: s.task.kind === "rc_section" ? "reads here" : s.task.kind === "cr_set" ? "opens GMAT Club" : "here, with the book",
        start: "Start", skip: "Skip", border: `4px double ${k.c}` };
      break;
    }
    case "resumeReview": {
      const k = card.set ? SUBJECT[card.set.section] : SUBJECT.general;
      const atTags = d.reviewStep.get(card.review) === "tags";
      const need = card.items.filter((it) => it.needsTag);
      const done = atTags ? need.filter((it) => d.tags.has(it.id)).length : card.items.filter((it) => (d.attempts.get(it.id) ?? []).some((x) => x.review === card.review)).length;
      const total = atTags ? need.length : card.items.length;
      v = { col: k.c, t: k.t, dk: k.d, eb: "Waiting where you left it", title: card.set ? (atTags ? "The review: reasons to finish" : "The review") : "Mixed review", start: "Carry on",
        prog: { w: total ? done / total : 0, t: atTags ? `${done} of ${total} reasons in` : `${done} of ${total}` }, border: `4px double ${k.c}` };
      break;
    }
    case "mixed": {
      const n = card.items.length;
      const k = SUBJECT[card.items[0].section];
      v = { col: k.c, t: k.t, dk: k.d, eb: card.stubborn ? "The stubborn ones" : "Review",
        title: card.stubborn ? `${inWords(n)} stubborn ${n === 1 ? "one" : "ones"}, a fresh look.` : `${inWords(n)} ${n === 1 ? "question" : "questions"}, mixed.`,
        ptr: card.stubborn ? "Missed three times: they come back every ten days until they're right twice." : card.returning ? `${inWords(card.returning)} you haven't seen in a while.` : undefined, meta: `about ${Math.max(5, n * 3)} minutes`,
        where: card.items.some((it) => it.source === "book") ? "here, with the book" : "opens GMAT Club", start: "Start", skip: "Skip", border: `4px double ${k.c}` };
      break;
    }
    default: {
      const p = card.piece;
      const k = SUBJECT[p.section];
      const isMock = card.kind === "mock";
      v = { col: k.c, t: k.t, dk: k.d, eb: card.kind === "task" && card.ahead ? "This week's done · next week, early" : card.kind === "resume" ? "Waiting where you left it" : isMock ? "Today · mock" : card.kind === "redo" ? `${k.name} · again` : k.name,
        title: titleOf(p), ptr: pointerOf(p, a.content) || undefined, meta: isMock ? "about 2 h 15 min" : metaOf(p), where: whereOf(p),
        start: card.kind === "resume" ? "Carry on" : isMock ? "Open" : "Start",
        skip: card.kind === "task" ? "Skip" : undefined, time: card.kind === "task" };
      if (isMock) v.second = { label: "Move it", run: () => void record({ type: "mock.moved", piece: p.id, day: moveMockDay(today, m.mocks[m.mocks.length - 1]?.day ?? null) }) };
      if (card.kind === "resume") v.prog = { w: card.progress.total ? card.progress.done / card.progress.total : 0, t: `${card.progress.done} of ${card.progress.total}` };
      if (card.kind === "task" && card.next) v.next = `Next: ${titleOf(card.next).replace(/^An? /, "")}.`;
      if (card.kind === "task" && (p as { reason?: string }).reason) v.body = (p as { reason?: string }).reason;
    }
  }
  const go1 = v.onStart ?? onPrimary ?? undefined;

  return (
    <>
      <div className="card" style={{ boxShadow: `6px 6px 0 ${v.t}`, border: v.border }}>
        <div className="row" style={{ gap: 8 }}><span className="dot" style={{ background: v.col }} /><span className="eyebrow" style={{ color: v.dk }}>{v.eb}</span></div>
        <div className="t">{v.title}</div>
        {v.ptr && <div className="ptr" style={{ background: v.t }}>{v.ptr}</div>}
        {v.meta && <div style={{ fontSize: 16, color: "var(--muted)" }}>{v.meta}</div>}
        {v.body && <div style={{ fontSize: 17, lineHeight: 1.4, color: "var(--muted)" }}>{v.body}</div>}
        {v.prog && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ height: 7, borderRadius: 4, background: v.t, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.round(v.prog.w * 100)}%`, background: v.col }} /></div>
            <div className="tiny" style={{ color: "var(--muted)" }}>{v.prog.t}</div>
          </div>
        )}
        <div className="spacer" />
        <div className="row wrap" style={{ gap: 7 }}>
          {v.where && <span className="pill">{v.where}</span>}
          {v.time && <button className="pill dash" onClick={cycleTime}>{timechip === null ? "any length of time" : timechip === 30 ? "30 minutes" : "an hour"}</button>}
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          {v.start && go1 && <button className="btn" style={{ flex: 1, background: v.col, borderColor: v.col }} onClick={go1}>{v.start}</button>}
          {v.second && <button className="btn ghost" style={{ minWidth: 92 }} onClick={v.second.run}>{v.second.label}</button>}
          {v.skip && onSkip && <button className="btn ghost" style={{ minWidth: 92 }} onClick={onSkip}>{v.skip}</button>}
        </div>
      </div>
      {v.next ? <div className="small">{v.next}</div> : <div className="small">&nbsp;</div>}
    </>
  );
}

/** After the test: enter the score if you like. Asked once more a week later, then quiet. */
function AfterTest() {
  const { d } = useApp();
  const [score, setScore] = useState("");
  const asked = d.seen.get("after-test");
  if (d.testResult) {
    const reached = d.testResult.score !== null && d.testResult.score >= d.settings.target;
    return (
      <div className="card" style={{ boxShadow: "6px 6px 0 var(--gen-t)" }}>
        <div className="eyebrow">After the test</div>
        <div className="t">{reached ? "That's it. Well done." : "Thank you for telling the app."}</div>
        <div style={{ fontSize: 17, color: "var(--muted)" }}>Your data stays here. Settings → Back up a copy downloads all of it.</div>
      </div>
    );
  }
  const weekLater = asked && (Date.now() - asked) / 86_400_000 >= 7 && !d.seen.has("after-test-2");
  if (asked && !weekLater) {
    return <div className="card" style={{ boxShadow: "6px 6px 0 var(--gen-t)" }}><div className="eyebrow">After the test</div><div className="t">Nothing else is on here.</div></div>;
  }
  return (
    <div className="card" style={{ boxShadow: "6px 6px 0 var(--gen-t)" }}>
      <div className="eyebrow">After the test</div>
      <div className="t">How did it go?</div>
      <div style={{ fontSize: 17, color: "var(--muted)" }}>You can enter your score, but you don't have to.</div>
      <div className="row">
        <input inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, ""))} placeholder="205–805" style={{ width: 120, height: 48, border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "0 10px", fontSize: 18 }} />
        <button className="btn small" disabled={!score} onClick={() => void record({ type: "test.result", score: Number(score) })}>Save</button>
        <button className="btn ghost small" onClick={() => void record({ type: "seen", what: asked ? "after-test-2" : "after-test" })}>Not now</button>
      </div>
    </div>
  );
}
