// Your dates and times (spec: Your dates; Settings), the backup, the content file and the day-one check.

import { useEffect, useMemo, useRef, useState } from "react";
import { spentThisMonth } from "../core/tutor/cost";
import { QUANT_TOPICS } from "../core/topics";
import { saveTutorCap, saveTutorEffort, saveTutorKey, tutorPrefs, type TutorPrefs } from "../data/tutorPrefs";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { DAY_NAMES, daysBetween, longDate, parseYmd, weekStartOf, ymd } from "../core/calendar";
import { now } from "../core/clock";
import type { Settings as S } from "../core/settings";
import { extraDeskFor, projectFinish } from "../core/week";
import { record, restoreBackup, saveContent } from "../data/db";
import { backupNow, folderSupported, pickFolder, readJsonFile, testFolderWrite } from "../data/backup";
import { Back, Screen, useToast } from "./bits";
import { Bookmarklet } from "./Share";

export const setSetting = (patch: Partial<S>) => record({ type: "settings", patch });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><span>{label}</span><div className="row" style={{ gap: 6 }}>{children}</div></div>;
}

/** The finish date worked out from both budgets, and what a date of your own would take. */
export function useFinish() {
  const { pieces, d, today, m } = useApp();
  const s = d.settings;
  return useMemo(() => {
    const from = today > s.startDate ? today : s.startDate;
    const args = { pieces, done: d.done, settings: s, fromWeek: weekStartOf(from), fromDay: from, busMinutes: m.ride };
    const auto = projectFinish(args).finish;
    let need: string | null = null;
    if (s.finishDate && auto && s.finishDate < auto) {
      const x = extraDeskFor(s.finishDate, args);
      need = !x ? "More than 15 hours a week. It can't be done by then."
        : x.extraPerWeek <= 45 ? "One more morning a week."
          : x.extraPerWeek <= 120 ? "One more morning, or Sunday 10:00–12:00."
            : `About ${Math.round(x.extraPerWeek / 60 * 10) / 10} more desk hours a week.`;
    }
    return { auto, need };
  }, [pieces, d.done, s, today, m.ride]);
}

export function DateFields({ showMore }: { showMore?: boolean }) {
  const { d, today } = useApp();
  const s = d.settings;
  const [more, setMore] = useState(!!showMore);
  const { auto, need } = useFinish();
  const finish = s.finishDate ?? auto;
  const tight = finish && daysBetween(finish, s.hardStop) < 56;

  const dayToggle = (wd: number) => {
    const days = s.mornings.days.includes(wd) ? s.mornings.days.filter((x) => x !== wd) : [...s.mornings.days, wd].sort();
    void setSetting({ mornings: { ...s.mornings, days } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Field label="Target score">
        <select value={s.target} onChange={(e) => void setSetting({ target: Number(e.target.value) })}>
          {[605, 625, 645, 655, 665, 675, 685, 695, 705, 725, 745].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Start"><input type="date" value={s.startDate} onChange={(e) => e.target.value && void setSetting({ startDate: e.target.value })} /></Field>
      <Field label="Saturday block">
        <button className="toggle" onClick={() => void setSetting({ saturday: { ...s.saturday, enabled: !s.saturday.enabled } })}>{s.saturday.enabled ? "on" : "off"}</button>
        {s.saturday.enabled && <>
          <input type="time" value={s.saturday.start} onChange={(e) => void setSetting({ saturday: { ...s.saturday, start: e.target.value } })} />
          <span className="tiny">to</span>
          <input type="time" value={s.saturday.end} onChange={(e) => void setSetting({ saturday: { ...s.saturday, end: e.target.value } })} />
        </>}
      </Field>
      <Field label="Morning slots">
        <input type="time" value={s.mornings.start} onChange={(e) => void setSetting({ mornings: { ...s.mornings, start: e.target.value } })} />
        <span className="tiny">to</span>
        <input type="time" value={s.mornings.end} onChange={(e) => void setSetting({ mornings: { ...s.mornings, end: e.target.value } })} />
      </Field>
      <div className="row wrap" style={{ gap: 4, padding: "8px 0", borderBottom: "1.5px solid var(--line)", justifyContent: "flex-end" }}>
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const on = s.mornings.days.includes(wd);
          return <button key={wd} onClick={() => dayToggle(wd)} className="mono"
            style={{ minWidth: 44, height: 40, borderRadius: 10, border: "1.5px solid var(--line-3)", background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper)" : "var(--muted)", fontSize: 12, cursor: "pointer" }}>{DAY_NAMES[wd].slice(0, 3)}</button>;
        })}
      </div>
      <Field label="Finish">
        <input type="date" value={finish ?? ""} onChange={(e) => void setSetting({ finishDate: e.target.value || null })} />
        {s.finishDate && <button className="tiny back" onClick={() => void setSetting({ finishDate: null })}>work it out</button>}
      </Field>
      {need && <div className="small" style={{ padding: "6px 0" }}>To finish by {longDate(s.finishDate!)}: {need}</div>}
      {auto && <div className="small" style={{ padding: "6px 0" }}>Projected with your slots and rides as they are: <b>{longDate(auto)}</b>.{s.finishDate ? "" : " Change the date and it shows what it takes."}</div>}
      {more && <>
        <PauseFields />
        <Field label="Book-by"><input type="date" value={s.bookBy} onChange={(e) => void setSetting({ bookBy: e.target.value })} /></Field>
        <Field label="Hard stop"><input type="date" value={s.hardStop} onChange={(e) => void setSetting({ hardStop: e.target.value })} /></Field>
        <Field label="Bus time counts"><button className="toggle" onClick={() => void setSetting({ busCounts: !s.busCounts })}>{s.busCounts ? "on" : "off"}</button></Field>
        <Field label="Verbal Review sets on the bus"><button className="toggle" onClick={() => void setSetting({ verbalReviewOnBus: !s.verbalReviewOnBus })}>{s.verbalReviewOnBus ? "on" : "off"}</button></Field>
        <Field label="Practice-run mock in week 1">{today > s.startDate
          ? <span className="small">{s.practiceRun ? "on" : "off"} (set before the plan starts)</span>
          : <button className="toggle" onClick={() => void setSetting({ practiceRun: !s.practiceRun })}>{s.practiceRun ? "on" : "off"}</button>}</Field>
        {s.practiceRun && (
          <div className="note" style={{ margin: "6px 0" }}>
            <div style={{ fontSize: 16 }}>{s.practiceRunKind === "official"
              ? "This uses Official Practice Exam 1. Its week-8 sitting would then be a retake: it won't count as fresh, so it can't show you're Ready."
              : "A non-official timed test (GMAT Club sections). Official Exam 1 stays fresh for week 8."}</div>
            <div className="row wrap">
              <button className="btn small outline" onClick={() => void setSetting({ practiceRunKind: "unofficial" })} disabled={s.practiceRunKind !== "official"}>Use a non-official test</button>
              <button className="btn small ghost" onClick={() => void setSetting({ practiceRunKind: "official" })} disabled={s.practiceRunKind === "official"}>Use Official Exam 1 anyway</button>
            </div>
          </div>
        )}
        <Field label="Official Practice Exams 3–6">
          <select value={s.exams36} onChange={(e) => void setSetting({ exams36: e.target.value as "bought" | "not bought" })}>
            <option value="bought">bought: in weeks 9, 10, 12, 13</option><option value="not bought">not bought: timed GMAT Club sections</option>
          </select>
        </Field>
        <Field label="Book edition">
          <select value={s.bookEdition} onChange={(e) => void setSetting({ bookEdition: e.target.value })}>
            <option>2025–2026</option><option>2024–2025</option>
          </select>
        </Field>
        {s.bookEdition !== "2025–2026" && <div className="small" style={{ padding: "6px 0" }}>Your book and the PDF are different editions, so the questions differ. Solve from the PDF on the laptop to have them marked.</div>}
      </>}
      {tight && <div className="small" style={{ padding: "6px 0" }}>This leaves room for one retake.</div>}
      <button className="back" style={{ color: "var(--link)", fontSize: 12 }} onClick={() => setMore((m) => !m)}>{more ? "Fewer dates" : "More dates"}</button>
    </div>
  );
}

function PauseFields() {
  const { d } = useApp();
  const s = d.settings;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <div style={{ borderBottom: "1.5px solid var(--line)", padding: "8px 0", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 17, color: "var(--muted)" }}>Pause weeks</span>
      {s.pauses.map((p, i) => (
        <div key={i} className="row" style={{ justifyContent: "space-between" }}>
          <span className="mono" style={{ fontSize: 13 }}>{longDate(p.from)} – {longDate(p.to)}</span>
          <button className="back" onClick={() => void setSetting({ pauses: s.pauses.filter((_, j) => j !== i) })}>remove</button>
        </div>
      ))}
      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn small outline" style={{ height: 40 }} disabled={!from || !to || to < from}
          onClick={() => { void setSetting({ pauses: [...s.pauses, { from, to }] }); setFrom(""); setTo(""); }}>Add</button>
      </div>
    </div>
  );
}

/** Sunday: the weekly backup, then one card asking for a copy off the laptop. */
export function BackupNote() {
  const { d, now: t } = useApp();
  const [busy, setBusy] = useState(false);
  const week = 7 * 86_400_000;
  // with a folder, the backup is automatic and daily: a note means the browser wants your OK again.
  // Without one, a weekly copy is the backup (from the first Sunday, never on day one).
  const folder = d.backupFolder || !!d.dayOne.folder?.ok;
  const since = d.lastBackup ?? d.dayOne.folder?.ts ?? null;
  const due = folder ? !!since && t.getTime() - since > 30 * 3_600_000 : (d.lastBackup ? t.getTime() - d.lastBackup > week : t.getDay() === 0 && !!d.setupDay && d.setupDay < ymd(t));
  const sundayish = t.getDay() === 0 || t.getDay() === 1;
  const needOffsite = sundayish && d.lastBackup && (!d.offsiteAt || t.getTime() - d.offsiteAt > 6 * 86_400_000) && t.getTime() - d.lastBackup < week;
  if (!d.setupDone) return null;
  if (due) {
    return (
      <div className="note">
        <div className="eyebrow">{folder ? "Today's backup" : "This week's backup"}</div>
        <div style={{ fontSize: 18 }}>{folder ? "The automatic backup needs your OK again (the browser asks for the folder from time to time). One tap." : "A copy of everything, saved as one file. One tap."}</div>
        <button className="btn small outline" disabled={busy} onClick={async () => { setBusy(true); await backupNow(true); setBusy(false); }}>Back up now</button>
      </div>
    );
  }
  if (needOffsite) {
    return (
      <div className="note">
        <div className="eyebrow">Backup saved</div>
        <div style={{ fontSize: 18 }}>Put this week's copy somewhere off the laptop: your Drive, an email to yourself, or a pen drive.</div>
        <button className="btn small outline" onClick={() => void record({ type: "backup.offsite" })}>Done</button>
      </div>
    );
  }
  return null;
}

export function SettingsScreen() {
  const { d, setContent, content } = useApp();
  const s = d.settings;
  const [toast, say] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLInputElement>(null);

  return (
    <Screen>
      <div className="column">
        <Back />
        <div className="title">Settings</div>
        <div className="eyebrow">Your dates and time</div>
        <DateFields showMore />
        <div className="eyebrow" style={{ marginTop: 10 }}>The test</div>
        <Field label="Booked test date">
          <input type="date" value={s.testDate ?? ""} onChange={(e) => void record({ type: "booking", answer: "booked", date: e.target.value })} />
          {s.testDate && <button className="tiny back" onClick={() => void setSetting({ testDate: null })}>not booked</button>}
        </Field>
        <div className="tiny" style={{ padding: "4px 0" }}>Fill this in once you've booked. Until then there's no test date anywhere in the app.</div>
        <div className="eyebrow" style={{ marginTop: 10 }}>Focus and break</div>
        <Field label="Focus">
          <select value={s.focusMin} onChange={(e) => void setSetting({ focusMin: Number(e.target.value) })}>{[25, 40, 50, 60, 75].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
        </Field>
        <Field label="Break">
          <select value={s.breakMin} onChange={(e) => void setSetting({ breakMin: Number(e.target.value) })}>{[5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
        </Field>
        <Field label="Sunday note"><button className="toggle" onClick={() => void setSetting({ sundayNote: !s.sundayNote })}>{s.sundayNote ? "on" : "off"}</button></Field>

        <div className="eyebrow" style={{ marginTop: 10 }}>Cards</div>
        <button className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => go("/cards/manage")}>Your cards: edit, pause or delete</button>
        <div className="eyebrow" style={{ marginTop: 10 }}>Harder GMAT Club lists (from plan week 8)</div>
        <HardLists />
        <div className="eyebrow" style={{ marginTop: 10 }}>Your tutor</div>
        <TutorSettings say={say} />
        <div className="eyebrow" style={{ marginTop: 10 }}>Send to GMAT app</div>
        <Bookmarklet />
        <div className="eyebrow" style={{ marginTop: 10 }}>Backup</div>
        <div className="small">{d.lastBackup ? `Last backup: ${new Date(d.lastBackup).toLocaleString()}` : "No backup yet."}</div>
        <div className="row wrap">
          <button className="btn small outline" onClick={async () => { const r = await backupNow(true); say(r.where === "folder" ? "Saved in your backup folder." : "Saved to Downloads."); }}>Back up a copy</button>
          {folderSupported() && <button className="btn small ghost" onClick={async () => { const h = await pickFolder(); if (h) say((await testFolderWrite(h)) ? "Backups go to that folder now." : "That folder can't be written to."); }}>Choose the backup folder</button>}
          <button className="btn small ghost" onClick={() => fileRef.current?.click()}>Restore a backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { const r = await restoreBackup(await readJsonFile(f)); say(r.added ? `Restored ${r.added} records.` : "Nothing new in that backup."); }
            catch (err) { say((err as Error).message); }
            e.target.value = "";
          }} />
        </div>

        <div className="eyebrow" style={{ marginTop: 10 }}>Study content</div>
        <div className="small">{content ? `Content file ${content.version} loaded.` : "No content file."}</div>
        <div className="row">
          <button className="btn small ghost" onClick={() => contentRef.current?.click()}>Load a newer content file</button>
          <input ref={contentRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { setContent(await saveContent(await readJsonFile(f))); say("Content loaded."); } catch (err) { say((err as Error).message); }
            e.target.value = "";
          }} />
        </div>

        <div className="eyebrow" style={{ marginTop: 10 }}>This laptop</div>
        <button className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => go("/dayone")}>Run the day-one check again</button>
        <button className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => go("/?tour=1")}>Take the tour of home again</button>
        <div className="tiny">App time {now().toLocaleString()} · {d.eventCount} records</div>
      </div>
      {toast}
    </Screen>
  );
}

export const shortDay = (day: string) => DAY_NAMES[parseYmd(day).getDay()];

/** B8: paste the 655–705 and 705+ list links per quant topic (the app never makes up a link). */
function HardLists() {
  const { d } = useApp();
  const [open, setOpen] = useState(false);
  const lists = d.settings.hardLists ?? {};
  const filled = Object.values(lists).filter((x) => x.mid || x.top).length;
  const put = (topic: string, which: "mid" | "top", url: string) => {
    const v = url.trim();
    if (v && !/^https:\/\/(www\.)?gmatclub\.com\//i.test(v)) return;
    void setSetting({ hardLists: { ...lists, [topic]: { ...lists[topic], [which]: v || undefined } } });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="small">{filled ? `${filled} topics have harder lists.` : "None yet."} Paste a GMAT Club search link (PS and DS) for each level; extra practice uses them from plan week 8, and the hardest level once you're past 80% on a topic twice.</div>
      <button className="back" style={{ color: "var(--link)" }} onClick={() => setOpen((x) => !x)}>{open ? "Hide the topics" : "Add or change links"}</button>
      {open && QUANT_TOPICS.map((t) => (
        <div key={t} className="field" style={{ flexWrap: "wrap" }}>
          <span>{t}</span>
          <div className="row" style={{ gap: 6 }}>
            <input aria-label={`${t} 655–705`} placeholder="655–705 link" defaultValue={lists[t]?.mid ?? ""} onBlur={(e) => put(t, "mid", e.target.value)} style={{ width: 180 }} />
            <input aria-label={`${t} 705+`} placeholder="705+ link" defaultValue={lists[t]?.top ?? ""} onBlur={(e) => put(t, "top", e.target.value)} style={{ width: 180 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The tutor's key (this browser only), a monthly cap, and how hard it thinks. */
function TutorSettings({ say }: { say: (m: string) => void }) {
  const { d, today } = useApp();
  const [p, setP] = useState<TutorPrefs | null>(null);
  const [k, setK] = useState("");
  useEffect(() => { void tutorPrefs().then(setP); }, []);
  if (!p) return null;
  const reload = () => void tutorPrefs().then(setP);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Field label="Claude API key">
        {p.key ? <>
          <span className="mono" style={{ fontSize: 12 }}>…{p.key.slice(-4)}</span>
          <button className="tiny back" onClick={async () => { await saveTutorKey(null); reload(); say("Key removed from this browser."); }}>remove</button>
        </> : <>
          <input type="password" value={k} onChange={(e) => setK(e.target.value)} placeholder="sk-ant-…" autoComplete="off" style={{ width: 200 }} />
          <button className="btn small outline" style={{ height: 40 }} disabled={!k.trim().startsWith("sk-ant-")} onClick={async () => { await saveTutorKey(k); setK(""); reload(); say("Kept in this browser, nowhere else."); }}>Save</button>
        </>}
      </Field>
      <Field label="Monthly cap">
        <select value={p.cap} onChange={async (e) => { await saveTutorCap(Number(e.target.value)); reload(); }}>
          {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>${n}</option>)}
        </select>
      </Field>
      <Field label="How hard it thinks">
        <select value={p.effort} onChange={async (e) => { await saveTutorEffort(e.target.value as "medium" | "high"); reload(); }}>
          <option value="medium">Normal</option><option value="high">Thorough (costs more)</option>
        </select>
      </Field>
      <div className="tiny" style={{ padding: "6px 0" }}>This month: ${spentThisMonth(d.tutorSpend, today).toFixed(2)} of ${p.cap}. The key never goes into a backup.</div>
    </div>
  );
}
