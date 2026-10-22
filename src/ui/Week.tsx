// The week (spec: The week screen): this week's chips, "Three done" in words (never a fraction or a
// percentage), and one line about next week. Hue = subject; fill = kind of work: tint to learn, solid
// to solve, double outline for review, dashed for cards, struck through when done.

import { go } from "../app/router";
import { useApp } from "../app/store";
import { plusDays, shortDate } from "../core/calendar";
import type { Model } from "../core/model";
import type { Piece } from "../core/pieces";
import type { SetReview } from "../core/review";
import { buildWeek } from "../core/week";
import { record } from "../data/db";
import { Tip } from "./Onboarding";
import { Back, Screen } from "./bits";
import { SUBJECT, titleOf, words } from "./copy";
import { useFocus } from "./focus";

const LEARN = new Set(["video", "article", "test_prep", "admin"]);

function chipStyle(p: Piece, done: boolean) {
  const k = SUBJECT[p.section];
  if (done) return { background: "transparent", color: "#a39c91", border: "1.5px solid #dad4c9", textDecoration: "line-through" };
  if (p.task.kind === "cards") return { border: `1.5px dashed ${k.c}`, color: k.d, background: "transparent" };
  if (LEARN.has(p.task.kind)) return { background: k.t, color: k.d, border: "1.5px solid transparent" };
  return { background: k.c, color: "var(--paper)", border: `1.5px solid ${k.c}` };
}

function shortLabel(p: Piece): string {
  const t = titleOf(p);
  const n = p.count && p.task.kind !== "video" ? ` · ${p.count}` : "";
  return (t.length > 34 ? t.slice(0, 32) + "…" : t) + n;
}

/** One line about next week: what's different about its shape. */
export function nextWeekShape(m: Model, ws = m.weekStart): string | null {
  const plan = m.d.weeks.get(ws);
  if (!plan || m.week?.pause) return null;
  const chips = plan.chips.map((c) => m.byId.get(c.pieceId)!).filter(Boolean);
  const assumed = new Set([...m.d.done, ...chips.map((p) => p.id)]);
  const nw = buildWeek({ weekStart: plusDays(ws, 7), pieces: m.plan, done: assumed, settings: m.d.settings, busMinutes: m.ride });
  const nextPieces = nw.chips.map((c) => m.byId.get(c.pieceId)!).filter(Boolean);
  const count = (ps: Piece[], s: string) => ps.filter((p) => p.section === s).reduce((n, p) => n + p.minutes, 0);
  const bits: string[] = [];
  for (const s of ["di", "quant", "rc", "cr"] as const) {
    const a = count(chips, s), b = count(nextPieces, s);
    if (a > 0 && b >= 2 * a) bits.push(`${s === "di" ? "DI" : SUBJECT[s].name.toLowerCase()} doubles`);
    if (a === 0 && b > 0 && s === "di") bits.push("DI starts");
  }
  if (nextPieces.some((p) => p.task.kind === "mock" && p.task.pointer.type === "official_mock")) bits.push(m.mocks.length ? "a mock lands" : "first mock lands");
  if (nw.pause) return "Next week is a pause week.";
  if (!nextPieces.length) return "Next week: the end of the plan.";
  if (bits.length) return `Next week's shape: ${bits.join(", ")}.`;
  const nowWeek = Math.max(0, ...chips.map((p) => p.planWeek));
  const nextWeek = nextPieces[nextPieces.length - 1].planWeek;
  return nextWeek === nowWeek ? `Next week: more of plan week ${nextWeek}.` : `Next week: plan week ${nextWeek}.`;
}

export function Week() {
  const { m, d, bus, today } = useApp();
  const focus = useFocus();
  const week = m.week;
  const chips = (week?.chips ?? []).map((c) => m.byId.get(c.pieceId)).filter(Boolean) as Piece[];
  const requiredLeft = chips.filter((p) => !d.done.has(p.id)).length;
  const extras = m.weekExtras.filter((x) => !x.hidden || !requiredLeft);
  const doneExtras = m.extras.filter((x) => x.week === m.weekStart && d.done.has(x.id));
  // this week's reviews, and any from before that are still open
  const reviews = [...m.weekReviews, ...m.reviews.sets.filter((s) => (s.status === "open" || s.status === "started") && !m.weekReviews.includes(s))];
  const doneN = chips.filter((p) => d.done.has(p.id)).length + reviews.filter((r) => r.status === "done").length + doneExtras.length;
  const restTaken = week ? d.restTapped.has(week.weekStart) : false;
  const cardsDone = d.cardSessions.some((x) => x.day >= m.weekStart);
  const nextLine = nextWeekShape(m);

  async function open(p: Piece) {
    if (d.done.has(p.id)) return;
    if (!d.started.has(p.id)) await record({ type: "piece.started", piece: p.id, mode: bus ? "bus" : "desk" });
    if (!bus) focus.startSitting();
    go(`/task/${encodeURIComponent(p.id)}`);
  }
  const openReview = (r: SetReview) => { if (r.status !== "done" && r.status !== "waiting") go(`/review/${encodeURIComponent(r.id)}`); };

  // "You can ask for next week's first chip from the week screen if you really want it."
  const first = !requiredLeft && week && !week.pause ? m.plan.find((p) => !d.done.has(p.id) && !chips.includes(p) && !m.letGo.has(p.taskId)) : null;

  return (
    <Screen>
      <div className="column">
        <Back />
        <Tip id="week">This week's tasks. You never have to do them in order or pick from here: the card on home does that. Tap one to start it now.</Tip>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 30 }}>This week</div>
          <div className="tiny">{week ? `from ${shortDate(week.weekStart)}` : ""}{week?.light ? " · a bus week" : ""}</div>
        </div>
        {!week && <div className="muted" style={{ fontSize: 18 }}>{today < d.settings.startDate ? "The plan starts on the start date." : "The week is being put together."}</div>}
        {week?.pause && <div className="muted" style={{ fontSize: 18 }}>A pause week. Nothing on the plan.</div>}
        <div className="row wrap" style={{ gap: 8 }}>
          {chips.map((p) => (
            <button key={p.id} className="chip lift" style={chipStyle(p, d.done.has(p.id))} onClick={() => void open(p)} title={p.task.title ?? ""}>{shortLabel(p)}</button>
          ))}
          {reviews.map((r) => {
            const k = SUBJECT[r.section];
            const done = r.status === "done";
            return (
              <button key={r.id} className="chip" onClick={() => openReview(r)} title={r.status === "waiting" ? `Opens ${shortDate(r.windowFrom)}` : "Review"}
                style={done ? { border: "1.5px solid #dad4c9", color: "#a39c91", textDecoration: "line-through" } : { border: `3px double ${k.c}`, color: k.d, opacity: r.status === "waiting" ? 0.6 : 1 }}>
                Review · {titleOf(m.plan.find((p) => p.taskId === r.taskId)!).replace(/, (first|second) half$/, "")}
              </button>
            );
          })}
          {extras.map((x) => (
            <button key={x.id} className="chip" style={chipStyle(x, d.done.has(x.id))} onClick={() => void open(x)} title={x.reason ?? ""}>{shortLabel(x)}</button>
          ))}
          {doneExtras.filter((x) => !extras.includes(x)).map((x) => <button key={x.id} className="chip" style={chipStyle(x, true)}>{shortLabel(x)}</button>)}
          {week && !week.pause && (
            <>
              <button className="chip" onClick={() => go("/cards")}
                style={cardsDone ? { border: "1.5px solid #dad4c9", color: "#a39c91", textDecoration: "line-through" } : { border: "1.5px dashed var(--rc)", color: "var(--rc-d)" }}>Cards</button>
              <button className="chip" onClick={() => week && void record({ type: "rest.tapped", week: week.weekStart })}
                style={restTaken ? { border: "1.5px solid #dad4c9", color: "#a39c91", textDecoration: "line-through" } : { border: "1.5px solid var(--line-3)", color: "var(--muted)" }}>
                Rest day
              </button>
            </>
          )}
        </div>
        {week && !week.pause && <div style={{ fontSize: 19 }}>{doneN === 0 ? "Nothing done yet." : `${words(doneN)} done.`}</div>}
        {nextLine && <div style={{ fontSize: 16, color: "var(--muted)", lineHeight: 1.4 }}>{nextLine}</div>}
        {first && (
          <button className="back" style={{ color: "var(--link)" }} onClick={() => void open(first)}>Start next week's first chip early: {titleOf(first)}</button>
        )}
        <div className="spacer" />
        <div className="tiny" style={{ lineHeight: 1.6 }}>Solid: questions · Tint: learn · Double: review · Dashed: cards. Tap any chip to start it.</div>
      </div>
    </Screen>
  );
}
