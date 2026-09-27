// Home: the level line, % with hours under it, weeks done and errors retired, then one card with
// Start and Skip (spec: Progress; How the app decides what's on the card).

import { useMemo, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { chooseCard, fitsNow, pickFromMix, type Card, type CardCtx } from "../core/card";
import { longDate, slotAt } from "../core/calendar";
import type { MixChoice } from "../core/events";
import { MIX_NAMES, recommendMix, sectionOfMix, type MixSection } from "../core/mix";
import type { Piece } from "../core/pieces";
import { hoursLogged, levelView, percentDone, weeksInARow } from "../core/progress";
import { studyDaysLeft } from "../core/weekly";
import { record } from "../data/db";
import { Screen, openOut, useKeys, useToast } from "./bits";
import { SUBJECT, metaOf, pointerOf, titleOf, whereOf } from "./copy";
import { useFocus } from "./focus";
import { BackupNote } from "./Settings";

const MBA_URL = "https://www.mba.com/";   // link catalogue L153

export function Home() {
  const a = useApp();
  const { d, today, pieces, week, bus } = a;
  const focus = useFocus();
  const [toast, say] = useToast();
  const [skipFor, setSkipFor] = useState<{ skipped: Piece; alt: Piece | null } | null>(null);

  // ----- today's mix and its recommendation
  const rec = useMemo(() => {
    const remaining: Record<MixSection, number> = { quant: 0, verbal: 0, di: 0 };
    for (const c of week?.chips ?? []) {
      const p = a.byId.get(c.pieceId);
      const m = p && sectionOfMix(p.section);
      if (p && m && !d.done.has(p.id)) remaining[m] += p.minutes;
    }
    const seen = (s: string) => d.lastSeen.get(s as never) ?? null;
    const maxDay = (x: string | null, y: string | null) => (x && y ? (x > y ? x : y) : x ?? y);
    const earlier = [...d.mixByDay.entries()].filter(([day]) => day < today).sort((x, y) => (x[0] < y[0] ? 1 : -1))[0];
    return recommendMix({
      today, remaining, studyDaysLeft: studyDaysLeft(today, d.settings),
      waiting: { quant: { redos: 0, topUp: false }, verbal: { redos: 0, topUp: false }, di: { redos: 0, topUp: false } },
      lastSeen: { quant: seen("quant"), di: seen("di"), verbal: maxDay(seen("rc"), seen("cr")) },
      lastSessionChoice: earlier ? { day: earlier[0], choice: earlier[1] } : null,
      planStarted: d.settings.startDate, minutesToday: d.timechipByDay.get(today) ?? null,
    });
  }, [week, d, today, a.byId]);
  const chosen: MixChoice = d.mixByDay.get(today) ?? rec.choice;

  const ctx: CardCtx = {
    now: a.now, today, settings: d.settings, pieces, byId: a.byId, week, d, bus, online: a.online,
    mix: chosen, first: chosen === "mix" ? rec.first : undefined, timeBudget: d.timechipByDay.get(today) ?? null,
  };
  const card = chooseCard(ctx);

  // ----- numbers
  const lv = levelView(Math.max(d.level), pieces, d.done);
  const pct = percentDone(pieces, d.done);
  const inRow = weeksInARow(d.counted, week?.weekStart ?? today);

  async function start(p: Piece) {
    if (!d.mixByDay.has(today) && !bus) await record({ type: "mix", choice: chosen });
    if (!d.started.has(p.id)) await record({ type: "piece.started", piece: p.id, mode: bus ? "bus" : "desk" });
    if (!bus) focus.startSitting();
    go(`/task/${encodeURIComponent(p.id)}`);
  }

  function altFor(p: Piece): Piece | null {
    const slot = bus ? null : slotAt(a.now, d.settings);
    const skippedToday = d.skipsByDay.get(today) ?? new Set();
    const cands = (week?.chips ?? []).map((c) => a.byId.get(c.pieceId)!).filter((x) =>
      x && x.id !== p.id && !d.done.has(x.id) && !skippedToday.has(x.id) && x.section !== p.section && x.task.kind !== "mock" && fitsNow(x, ctx, slot));
    return cands.length ? pickFromMix(cands, ctx, p.group) : null;
  }

  async function skip(p: Piece) {
    await record({ type: "skip", piece: p.id });
    setSkipFor({ skipped: p, alt: altFor(p) });
  }

  const cardPiece = card.kind === "task" || card.kind === "resume" || card.kind === "mock" ? card.piece : null;
  useKeys({
    Enter: () => { if (skipFor) return; if (cardPiece) void start(cardPiece); },
    s: () => { if (cardPiece && card.kind === "task") void skip(cardPiece); },
    b: () => void record({ type: "bus", on: !bus }),
    w: () => go("/week"),
  }, [cardPiece?.id, bus, skipFor]);

  return (
    <Screen right={week ? `plan week ${cardPiece?.planWeek ?? ""}`.trim() : ""}>
      <div className="column">
        <button onClick={() => go("/week")} style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 16 }}>{lv.label}</span><span className="tiny" style={{ fontSize: 10 }}>{lv.next}</span>
          </div>
          <div className="bar"><div style={{ width: `${Math.round(lv.frac * 100)}%`, background: "var(--ink)" }} /></div>
        </button>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 66, lineHeight: 0.9 }}>{pct}%</div>
            <div className="small" style={{ marginTop: 4 }}>{hoursLogged(d)} hours</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
            <div style={{ fontSize: 17, color: "var(--ink-2)" }}>{d.counted.size} {d.counted.size === 1 ? "week" : "weeks"}{inRow >= 2 ? ` · ${inRow} in a row` : ""}</div>
            <div className="row" style={{ gap: 8 }}>
              <span className="dot" style={{ width: 7, height: 7, background: "var(--rc)", animation: "breathe 4.6s ease-in-out infinite" }} />
              <span style={{ fontSize: 19, color: "var(--rc-d)" }}>0 retired</span>
            </div>
          </div>
        </div>

        <BackupNote />

        {!bus && card.kind === "task" && (
          <MixSwitch chosen={chosen} rec={rec.choice} reason={d.mixByDay.has(today) ? null : rec.reason} />
        )}

        <CardView card={card} onStart={start} onSkip={skip} />

        {skipFor && (
          <div className="note">
            {skipFor.alt ? (
              <>
                <div style={{ fontSize: 19 }}>Instead: {titleOf(skipFor.alt)}</div>
                <div className="small">{metaOf(skipFor.alt)}</div>
                <div className="row">
                  <button className="btn small" style={{ flex: 1 }} onClick={() => { setSkipFor(null); void start(skipFor.alt!); }}>Do this</button>
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
          <div className="spacer" />
        </div>
        <nav className="row" style={{ justifyContent: "space-between", borderTop: "1.5px solid var(--line)", paddingTop: 4 }}>
          <NavLink to="/week" label="This week" />
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

function CardView({ card, onStart, onSkip }: { card: Card; onStart: (p: Piece) => void; onSkip: (p: Piece) => void }) {
  const a = useApp();
  const { d, today } = a;
  const timechip = d.timechipByDay.get(today) ?? null;
  const cycleTime = () => void record({ type: "timechip", minutes: timechip === null ? 30 : timechip === 30 ? 60 : null });

  let v: { col: string; t: string; dk: string; eb: string; title: string; ptr?: string; meta?: string; body?: string; where?: string;
    start?: string; skip?: string; onStart?: () => void; onSkip?: () => void; prog?: { w: number; t: string }; next?: string; time?: boolean };
  const neutral = { col: "var(--gen)", t: "var(--gen-t)", dk: "var(--gen-d)" };

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
      v = { ...neutral, eb: "Late", title: "Nothing tonight.", body: "Sleep does more for tomorrow than another set." };
      break;
    case "weekdone":
      v = { ...neutral, eb: "This week", title: "The week is done.", body: "Rest counts." };
      break;
    case "nothing":
      v = { ...neutral, eb: "Right now",
        title: card.why === "bus" ? "Nothing that fits the ride. Enjoy it." : card.why === "offline" ? "Nothing that works offline right now." : card.why === "skipped" ? "It's here when you are." : "Nothing that fits right now.",
        body: card.why === "slotEnding" ? "The morning's nearly over. The next piece waits for more time."
          : card.why === "slot" ? "The next pieces need more time than this slot has. They're here at the next sitting." : undefined };
      break;
    default: {
      const p = card.piece;
      const k = SUBJECT[p.section];
      v = { col: k.c, t: k.t, dk: k.d, eb: card.kind === "resume" ? "Waiting where you left it" : card.kind === "mock" ? "Today · mock" : k.name,
        title: titleOf(p), ptr: pointerOf(p, a.content) || undefined, meta: card.kind === "mock" ? "about 2 h 15 min" : metaOf(p), where: whereOf(p),
        start: card.kind === "resume" ? "Carry on" : card.kind === "mock" ? "Open" : "Start", onStart: () => onStart(p),
        skip: card.kind === "task" ? "Skip" : undefined, onSkip: card.kind === "task" ? () => onSkip(p) : undefined, time: card.kind === "task" };
      if (card.kind === "resume") v.prog = { w: card.progress.total ? card.progress.done / card.progress.total : 0, t: `${card.progress.done} of ${card.progress.total}` };
      if (card.kind === "task" && card.next) v.next = `Next: ${titleOf(card.next).replace(/^An? /, "")}.`;
    }
  }

  return (
    <>
      <div className="card" style={{ boxShadow: `6px 6px 0 ${v.t}` }}>
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
          {v.start && <button className="btn" style={{ flex: 1, background: v.col, borderColor: v.col }} onClick={v.onStart}>{v.start}</button>}
          {v.skip && <button className="btn ghost" style={{ minWidth: 92 }} onClick={v.onSkip}>{v.skip}</button>}
        </div>
      </div>
      {v.next ? <div className="small">{v.next}</div> : <div className="small">&nbsp;</div>}
    </>
  );
}
