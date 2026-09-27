// Your dates and times (spec: Your dates; Settings), the backup, the content file and the day-one check.

import { useMemo, useRef, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { DAY_NAMES, daysBetween, longDate, parseYmd, weekStartOf } from "../core/calendar";
import { now } from "../core/clock";
import type { Settings as S } from "../core/settings";
import { extraDeskFor, projectFinish } from "../core/week";
import { record, restoreBackup, saveContent } from "../data/db";
import { backupNow, folderSupported, pickFolder, readJsonFile, testFolderWrite } from "../data/backup";
import { Back, Screen, useToast } from "./bits";

export const setSetting = (patch: Partial<S>) => record({ type: "settings", patch });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><span>{label}</span><div className="row" style={{ gap: 6 }}>{children}</div></div>;
}

/** The finish date worked out from both budgets, and what a date of your own would take. */
export function useFinish() {
  const { pieces, d, today } = useApp();
  const s = d.settings;
  return useMemo(() => {
    const from = today > s.startDate ? today : s.startDate;
    const args = { pieces, done: d.done, settings: s, fromWeek: weekStartOf(from), fromDay: from };
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
  }, [pieces, d.done, s, today]);
}

export function DateFields({ showMore }: { showMore?: boolean }) {
  const { d } = useApp();
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
      <div className="row wrap" style={{ gap: 6, padding: "8px 0", borderBottom: "1.5px solid var(--line)", justifyContent: "flex-end" }}>
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const on = s.mornings.days.includes(wd);
          return <button key={wd} onClick={() => dayToggle(wd)} className="mono"
            style={{ minWidth: 48, height: 40, borderRadius: 10, border: "1.5px solid var(--line-3)", background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper)" : "var(--muted)", fontSize: 12, cursor: "pointer" }}>{DAY_NAMES[wd].slice(0, 3)}</button>;
        })}
      </div>
      <Field label="Finish">
        <input type="date" value={finish ?? ""} onChange={(e) => void setSetting({ finishDate: e.target.value || null })} />
        {s.finishDate && <button className="tiny back" onClick={() => void setSetting({ finishDate: null })}>work it out</button>}
      </Field>
      {need && <div className="small" style={{ padding: "6px 0" }}>To finish by {longDate(s.finishDate!)}: {need}</div>}
      {!s.finishDate && auto && <div className="tiny" style={{ padding: "6px 0" }}>Worked out from your desk and bus time. Change the date and it shows what it takes.</div>}
      {more && <>
        <PauseFields />
        <Field label="Book-by"><input type="date" value={s.bookBy} onChange={(e) => void setSetting({ bookBy: e.target.value })} /></Field>
        <Field label="Hard stop"><input type="date" value={s.hardStop} onChange={(e) => void setSetting({ hardStop: e.target.value })} /></Field>
        <Field label="Bus time counts"><button className="toggle" onClick={() => void setSetting({ busCounts: !s.busCounts })}>{s.busCounts ? "on" : "off"}</button></Field>
        <Field label="Verbal Review sets on the bus"><button className="toggle" onClick={() => void setSetting({ verbalReviewOnBus: !s.verbalReviewOnBus })}>{s.verbalReviewOnBus ? "on" : "off"}</button></Field>
        <Field label="Practice-run mock in week 1"><button className="toggle" onClick={() => void setSetting({ practiceRun: !s.practiceRun })}>{s.practiceRun ? "on" : "off"}</button></Field>
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
  const due = !d.lastBackup || t.getTime() - d.lastBackup > 6 * 86_400_000;
  const sundayish = t.getDay() === 0 || t.getDay() === 1;
  const needOffsite = d.lastBackup && (!d.offsiteAt || d.offsiteAt < d.lastBackup) && t.getTime() - d.lastBackup < week;
  if (!d.setupDone) return null;
  if (due && sundayish) {
    return (
      <div className="note">
        <div className="eyebrow">This week's backup</div>
        <div style={{ fontSize: 18 }}>One file of everything, saved on this laptop.</div>
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
        <div className="eyebrow" style={{ marginTop: 10 }}>Focus and break</div>
        <Field label="Focus">
          <select value={s.focusMin} onChange={(e) => void setSetting({ focusMin: Number(e.target.value) })}>{[25, 40, 50, 60, 75].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
        </Field>
        <Field label="Break">
          <select value={s.breakMin} onChange={(e) => void setSetting({ breakMin: Number(e.target.value) })}>{[5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
        </Field>
        <Field label="Sunday note"><button className="toggle" onClick={() => void setSetting({ sundayNote: !s.sundayNote })}>{s.sundayNote ? "on" : "off"}</button></Field>

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
        <div className="tiny">App time {now().toLocaleString()} · {d.eventCount} records</div>
      </div>
      {toast}
    </Screen>
  );
}

export const shortDay = (day: string) => DAY_NAMES[parseYmd(day).getDay()];
