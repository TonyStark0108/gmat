// The week (spec: The week screen): this week's chips, "Three done" in words, one line about next week.
// Hue = subject; fill = kind of work: tint to learn, solid to solve, dashed for cards, struck through when done.

import { go } from "../app/router";
import { useApp } from "../app/store";
import { addDays, parseYmd, ymd } from "../core/calendar";
import type { Piece } from "../core/pieces";
import { buildWeek } from "../core/week";
import { record } from "../data/db";
import { Back, Screen } from "./bits";
import { SUBJECT, titleOf, words } from "./copy";
import { useFocus } from "./focus";

const LEARN = new Set(["video", "article", "test_prep", "admin"]);

function chipStyle(p: Piece, done: boolean) {
  const k = SUBJECT[p.section];
  if (done) return { background: "transparent", color: "#a39c91", border: "1.5px solid #dad4c9", textDecoration: "line-through" };
  if (LEARN.has(p.task.kind)) return { background: k.t, color: k.d, border: "1.5px solid transparent" };
  return { background: k.c, color: "var(--paper)", border: `1.5px solid ${k.c}` };
}

function shortLabel(p: Piece): string {
  const t = titleOf(p);
  const n = p.count && p.task.kind !== "video" ? ` · ${p.count}` : "";
  return (t.length > 34 ? t.slice(0, 32) + "…" : t) + n;
}

export function Week() {
  const { week, byId, d, pieces, bus, today } = useApp();
  const focus = useFocus();
  const chips = (week?.chips ?? []).map((c) => byId.get(c.pieceId)).filter(Boolean) as Piece[];
  const doneN = chips.filter((p) => d.done.has(p.id)).length;
  const restTaken = week ? d.restTapped.has(week.weekStart) : false;

  // One line about next week: what's different about its shape.
  let nextLine = "";
  if (week && !week.pause) {
    const assumed = new Set([...d.done, ...chips.map((p) => p.id)]);
    const nw = buildWeek({ weekStart: ymd(addDays(parseYmd(week.weekStart), 7)), pieces, done: assumed, settings: d.settings });
    const nextPieces = nw.chips.map((c) => byId.get(c.pieceId)!).filter(Boolean);
    const count = (ps: Piece[], s: string) => ps.filter((p) => p.section === s).reduce((n, p) => n + p.minutes, 0);
    const bits: string[] = [];
    for (const s of ["di", "quant", "rc", "cr"] as const) {
      const a = count(chips, s), b = count(nextPieces, s);
      if (a > 0 && b >= 2 * a) bits.push(`${s === "di" ? "DI" : SUBJECT[s].name.toLowerCase()} doubles`);
    }
    if (nextPieces.some((p) => p.task.kind === "mock")) bits.push("a mock lands");
    if (nw.pause) nextLine = "Next week is a pause week.";
    else if (!nextPieces.length) nextLine = "Next week: the end of the plan.";
    else nextLine = `Next week's shape: ${bits.length ? bits.join(", ") : `plan week ${nextPieces[nextPieces.length - 1].planWeek} work`}.`;
  }

  async function open(p: Piece) {
    if (d.done.has(p.id)) return;
    if (!d.started.has(p.id)) await record({ type: "piece.started", piece: p.id, mode: bus ? "bus" : "desk" });
    if (!bus) focus.startSitting();
    go(`/task/${encodeURIComponent(p.id)}`);
  }

  return (
    <Screen>
      <div className="column">
        <Back />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 30 }}>This week</div>
          <div className="tiny">{week ? `from ${week.weekStart.slice(8)} ${new Date(week.weekStart).toLocaleString("en", { month: "short" })}` : ""}</div>
        </div>
        {!week && <div className="muted" style={{ fontSize: 18 }}>{today < d.settings.startDate ? "The plan starts on the start date." : "The week is being put together."}</div>}
        {week?.pause && <div className="muted" style={{ fontSize: 18 }}>A pause week. Nothing on the plan.</div>}
        <div className="row wrap" style={{ gap: 8 }}>
          {chips.map((p) => (
            <button key={p.id} className="chip" style={chipStyle(p, d.done.has(p.id))} onClick={() => void open(p)} title={p.task.title ?? ""}>
              {shortLabel(p)}
            </button>
          ))}
          {week && !week.pause && (
            <>
              <button className="chip" style={{ border: "1.5px dashed var(--rc)", color: "var(--rc-d)" }} disabled title="Cards arrive with the review (Phase 2)">Cards</button>
              <button className="chip" onClick={() => week && void record({ type: "rest.tapped", week: week.weekStart })}
                style={restTaken ? { border: "1.5px solid #dad4c9", color: "#a39c91", textDecoration: "line-through" } : { border: "1.5px solid var(--line-3)", color: "var(--muted)" }}>
                Rest day
              </button>
            </>
          )}
        </div>
        {week && !week.pause && <div style={{ fontSize: 19 }}>{doneN === 0 ? "Nothing done yet." : `${words(doneN)} done.`}</div>}
        <div style={{ fontSize: 16, color: "var(--muted)", lineHeight: 1.4 }}>{nextLine}</div>
        <div className="spacer" />
        <div className="tiny" style={{ lineHeight: 1.6 }}>Solid: questions · Tint: learn · Dashed: cards. Tap any chip to start it.</div>
      </div>
    </Screen>
  );
}
