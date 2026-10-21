// The notes that can sit above the card on home. At most one shows at a time, so home never fills up
// (spec: G4). Order: a level reached, the date check, booking, the Sunday note, the backup, a question
// about a task skipped in three weeks, a purchase card coming back, a rebuild week.

import { useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { daysBetween, longDate, plusDays, weekCapacity, weekStartOf } from "../core/calendar";
import { keepDatePlan } from "../core/life";
import { askLetGo } from "../core/life";
import { bookingCard, week8Checkpoint } from "../core/mocks";
import { LEVELS } from "../core/progress";
import { noteWeek, sundayLines, weekEndMs, weekNumber } from "../core/sunday";
import { morningsSkippedTwice } from "../core/life";
import { deadSince } from "../core/links";
import { weekPlanOf } from "../core/weekly";
import { adaptOn } from "../core/adaptView";
import { weekStatus } from "../core/model";
import { record } from "../data/db";
import { BackupNote, setSetting } from "./Settings";
import { nextWeekShape } from "./Week";

const LEVEL_LINES: Record<number, string> = {
  1: "Week 1 is done.", 2: "Weeks 1–3 are done.", 3: "Weeks 4–6 are done.", 4: "Weeks 7–8 are done.",
  5: "Weeks 9–10 are done, and half your errors so far are retired.", 6: "Every task in the plan is done.", 7: "Your mocks say you're ready.",
};

export function NoteStack() {
  const a = useApp();
  const { m, d, today, now } = a;
  const s = d.settings;
  // back after a week or more: the welcome and a few cards come first; notes wait for after
  if (m.back) return null;

  // 1. a level reached: one calm note, shown once
  const lv = LEVELS.find((L) => L.n === d.level);
  if (lv && !d.seen.has(`level:${lv.n}`)) {
    return (
      <div className="note">
        <div className="eyebrow">Level {lv.n}</div>
        <div style={{ fontSize: 22 }}>Level {lv.n} · {lv.name}. {LEVEL_LINES[lv.n]}</div>
        <button className="btn small outline" style={{ alignSelf: "flex-start" }} onClick={() => void record({ type: "seen", what: `level:${lv.n}` })}>OK</button>
      </div>
    );
  }

  // 1b. the week-8 checkpoint: Exam 1 more than 60 below the target proposes a specific extension
  const cp = week8Checkpoint(m.mocks, s);
  if (cp && !d.offers.has(cp.id)) {
    return (
      <div className="note">
        <div className="eyebrow">After Official Exam 1</div>
        <div style={{ fontSize: 19 }}>Exam 1 came in at {cp.total}. Your target is {cp.target}, so this is the point to give the plan more room rather than carry on as if nothing changed.</div>
        <div style={{ fontSize: 17 }}>The proposal: {cp.weeks} more weeks. Finish {longDate(cp.finish)}; book-by {longDate(cp.bookBy)}. The extra weeks go to your weakest areas, more official practice and the tutor.{cp.limited ? " (That's as far as it goes while a retake fits before your hard stop.)" : ""}</div>
        <div className="row wrap">
          <button className="btn small outline" onClick={async () => {
            await record({ type: "offer", offer: cp.id, answer: "yes" });
            await setSetting({ finishDate: cp.finish, agreedFinish: cp.finish, bookBy: cp.bookBy });
          }}>Add {cp.weeks} weeks</button>
          <button className="btn small ghost" onClick={() => void record({ type: "offer", offer: cp.id, answer: "no" })}>Keep the dates</button>
        </div>
      </div>
    );
  }

  // 2. the date check, when the finish date stops working
  const check = [...d.datechecks].reverse().find((x) => !x.choice);
  const answered = check && d.datechecks.some((x) => x.choice && x.ts > check.ts);
  if (check && !answered && check.result !== "safe") return <DateCheckNote />;

  // 3. booking
  const book = bookingCard(d, m.ready, today);
  if (book && m.phase === "plan") return <BookingNote why={book.why} suggest={book.suggest} />;

  // 4. the Sunday note
  const nw = noteWeek(now, today);
  if (nw && s.sundayNote && d.weeks.has(nw) && !d.seen.has(`sunday:${nw}`)) return <SundayNote ws={nw} />;

  // 5. the weekly backup
  const backup = <BackupNote />;
  const due = !d.lastBackup || now.getTime() - d.lastBackup > 30 * 3_600_000;
  const sundayish = now.getDay() === 0 || now.getDay() === 1;
  const offsite = sundayish && d.lastBackup && (!d.offsiteAt || now.getTime() - d.offsiteAt > 6 * 86_400_000) && now.getTime() - d.lastBackup < 7 * 86_400_000;
  if (due || offsite) return backup;

  // 6. a task skipped in three different weeks: keep it, or let it go?
  const t = askLetGo(d, (pid) => m.byId.get(pid)?.taskId);
  if (t) {
    const title = m.plan.find((p) => p.taskId === t)?.task.title ?? "This task";
    return (
      <div className="note">
        <div style={{ fontSize: 18 }}>{title}: keep this, or let it go?</div>
        <div className="row">
          <button className="btn small outline" style={{ flex: 1 }} onClick={() => void record({ type: "letgo", task: t, keep: true })}>Keep it</button>
          <button className="btn ghost small" onClick={() => void record({ type: "letgo", task: t, keep: false })}>Let it go</button>
        </div>
      </div>
    );
  }

  // 7. a purchase or admin card that said "not now" comes back a week later
  for (const [pid, ad] of d.admin) {
    if (ad.answer !== "not now" || pid === "warmup-mba" || daysBetween(ad.day, today) < 7) continue;
    const p = m.byId.get(pid);
    if (!p || d.seen.has(`admin:${pid}:${ad.ts}`)) continue;
    return (
      <div className="note">
        <div className="eyebrow">Back after a week</div>
        <div style={{ fontSize: 18 }}>{p.task.title}</div>
        <div className="row">
          {p.task.pointer.url && <button className="btn small outline" onClick={() => window.open(p.task.pointer.url, "_blank", "noopener")}>Open the page ↗</button>}
          <button className="btn small outline" onClick={async () => { await record({ type: "admin", piece: pid, answer: "done" }); }}>Done</button>
          <button className="btn ghost small" onClick={() => void record({ type: "admin", piece: pid, answer: "not now" })}>Not now</button>
        </div>
      </div>
    );
  }

  // 8. a rebuild week, when everything in one section felt hard
  const rb = rebuildOffer(a);
  if (rb) return rb;

  // 9. new cards from your work: keep or skip (left alone, they're kept for you the day after next)
  const fresh = m.sugg.pending.length;
  if (fresh) {
    return (
      <div className="note">
        <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{fresh === 1 ? "A new card" : `${fresh} new cards`} from your work.</span>
          <button className="btn small outline" onClick={() => go("/cards/new")}>Look at them</button>
        </div>
      </div>
    );
  }
  return null;
}

function DateCheckNote() {
  const { d } = useApp();
  const check = [...d.datechecks].reverse().find((x) => !x.choice)!;
  const s = d.settings;
  const cap = weekCapacity(weekStartOf(useApp().today), s);
  const plan = check.result === "risk" && check.extra ? keepDatePlan(s, check.extra, cap.rawDesk + cap.rawBus) : null;
  const choose = async (choice: "move" | "keep" | "fit" | "later") => {
    await record({ ...check, type: "datecheck", choice } as never);
    if (choice === "move" && check.projected) await setSetting({ finishDate: s.testDate ? s.finishDate : check.projected, agreedFinish: check.projected });
    if (choice === "keep" && plan) await setSetting({ ...plan.patch, agreedFinish: check.target });
    if (choice === "fit") await setSetting({ fitMode: true });
  };
  return (
    <div className="note">
      <div className="eyebrow">Your finish date</div>
      <div style={{ fontSize: 21 }}>Two ways to go.</div>
      {check.projected && (
        <button className="btn small outline" onClick={() => void choose("move")}>Move the finish date to {longDate(check.projected)}</button>
      )}
      {check.result === "risk" && plan && check.target && (
        <button className="btn small outline" onClick={() => void choose("keep")}>Keep {longDate(check.target)}: {plan.words}</button>
      )}
      {check.result === "past" && check.target && (
        <button className="btn small outline" onClick={() => void choose("fit")}>Keep the date, do what fits</button>
      )}
      {check.result === "past" && <div className="tiny">Mocks, DI and quant come first; reading and CR move to the bus.</div>}
      <button className="back" onClick={() => void choose("later")}>Decide later</button>
    </div>
  );
}

function BookingNote({ why, suggest }: { why: "ready" | "bookby"; suggest: string }) {
  const { d } = useApp();
  const [date, setDate] = useState(suggest);
  const [open, setOpen] = useState(false);
  return (
    <div className="note">
      <div className="eyebrow" style={{ color: "var(--mk-d)" }}>Booking</div>
      <div style={{ fontSize: 19 }}>
        {why === "ready" ? "Your mocks say you're ready. Booking 3–4 weeks out works well."
          : `It's your book-by date. A test around ${longDate(suggest)} leaves room for a retake before ${longDate(d.settings.hardStop)}.`}
      </div>
      {open ? (
        <div className="row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn small outline" onClick={() => void record({ type: "booking", answer: "booked", date })}>That's my test date</button>
        </div>
      ) : (
        <div className="row">
          <button className="btn small outline" style={{ flex: 1 }} onClick={() => setOpen(true)}>I've booked</button>
          <button className="btn ghost small" onClick={() => void record({ type: "booking", answer: "notyet" })}>Not yet</button>
        </div>
      )}
    </div>
  );
}

function SundayNote({ ws }: { ws: string }) {
  const { m, d } = useApp();
  const plan = weekPlanOf(d, ws, d.settings);
  const st = weekStatus(m, ws);
  const end = plusDays(ws, 6);
  let minutes = 0;
  for (let i = 0; i < 7; i++) minutes += d.minutesByDay.get(plusDays(ws, i)) ?? 0;
  const retired = [...m.reviews.items.values()].filter((it) => it.retiredDay && it.retiredDay >= ws && it.retiredDay <= end).length;
  const moved = plan ? plan.chips.filter((c) => !(d.done.has(c.pieceId) && d.doneAt.get(c.pieceId)!.day <= end)).length : 0;
  const counted = d.counted.has(ws) || (!!st.plan && moved === 0 && st.reviewsDone);
  const nextWs = plusDays(ws, 7);
  const nextPurchase = m.plan.find((p) => p.task.kind === "admin" && p.task.pointer.url && !d.done.has(p.id) && (d.weeks.get(nextWs)?.chips ?? []).some((c) => c.pieceId === p.id));
  const levelNow = LEVELS.find((L) => L.n === d.level);
  const levelLine = levelNow && d.seen.get(`level:${levelNow.n}`) && d.seen.get(`level:${levelNow.n}`)! >= weekEndMs(ws) - 7 * 86_400_000 ? `Level ${levelNow.n} · ${levelNow.name} this week.` : null;
  const lines = sundayLines({
    weekStart: ws, weekNumber: weekNumber(ws, d.settings.startDate), counted, minutes, retiredThisWeek: retired, chipsMoved: moved,
    nextShape: nextWeekShape(m, ws), purchaseDue: nextPurchase ? `${nextPurchase.task.title} comes up next week.` : null,
    deadLinks: deadSince(d, weekEndMs(ws) - 7 * 86_400_000), leans: adaptOn(m) ? leansLine(m) : null, level: levelLine,
    morningsSkipped: morningsSkippedTwice(d, d.settings, ws) && !d.seen.has(`mornings-note:${ws}`) && ![...d.seen.keys()].some((k) => k.startsWith("mornings-note:")),
  });
  const text = lines.join("\n");
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* closed */ }
    try { await navigator.clipboard.writeText(text); } catch { /* not allowed */ }
  };
  const close = async () => {
    await record({ type: "seen", what: `sunday:${ws}` });
    if (lines.some((l) => l.startsWith("Quant reviews waited"))) await record({ type: "seen", what: `mornings-note:${ws}` });
  };
  return (
    <div className="note">
      <div className="eyebrow">The Sunday note</div>
      {lines.map((l, i) => <div key={i} style={{ fontSize: i === 0 ? 20 : 17 }}>{l}</div>)}
      <div className="row wrap">
        <button className="btn small outline" onClick={() => void share()}>Share</button>
        <button className="btn small ghost" onClick={async () => { await close(); go("/week"); }}>This week</button>
        <button className="btn small ghost" onClick={async () => { await close(); go(`/tutor?ctx=${encodeURIComponent(`checkin:${ws}`)}`); }}>Check in with your tutor</button>
        <button className="btn small ghost" onClick={() => void close()}>OK</button>
      </div>
    </div>
  );
}

function leansLine(m: ReturnType<typeof useApp>["m"]): string | null {
  const w = m.adapt.weakest;
  if (!w) return null;
  return `Next week leans ${w === "di" ? "DI" : w === "rc" ? "reading" : w === "cr" ? "CR" : "quant"}.`;
}

/** "Everything hard in one section": the last three desk sets under 50% first try. Offered, never forced. */
function rebuildOffer(a: ReturnType<typeof useApp>) {
  const { m, d, today } = a;
  for (const [sec, x] of m.adapt.sections) {
    if (x.sets.length < 3 || !x.sets.slice(-3).every((acc) => acc < 0.5)) continue;
    const ws = plusDays(weekStartOf(today), 7);
    const id = `rebuild:${sec}:${ws}`;
    if (d.offers.has(id)) continue;
    const name = sec === "di" ? "DI" : sec === "quant" ? "quant" : sec === "rc" ? "reading" : "CR";
    return (
      <div className="note">
        <div style={{ fontSize: 18 }}>{name[0].toUpperCase() + name.slice(1)} has felt hard everywhere lately. A rebuild week pauses new {name} work for a week of its basics; the finish date moves a week. Your level and % stay as they are.</div>
        <div className="row">
          <button className="btn small outline" style={{ flex: 1 }} onClick={async () => {
            await record({ type: "offer", offer: id, answer: "yes" });
            await setSetting({ rebuild: [...(d.settings.rebuild ?? []), { week: ws, section: sec }] });
          }}>Take a rebuild week</button>
          <button className="btn ghost small" onClick={() => void record({ type: "offer", offer: id, answer: "no" })}>Keep going</button>
        </div>
      </div>
    );
  }
  return null;
}
