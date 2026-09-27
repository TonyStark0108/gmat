// First run: the day-one check, the content file, then two pre-filled setup screens
// (spec: Setup and first run; Running it on your office laptop).

import { useEffect, useRef, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { longDate } from "../core/calendar";
import { kvGet, kvSet, persistStorage, record, saveContent } from "../data/db";
import { folderSupported, pickFolder, readJsonFile, testFolderWrite } from "../data/backup";
import { Screen } from "./bits";
import { DateFields, useFinish } from "./Settings";

const SESSION_FLAG = "gmat-session-open";

/** Has the day-one check passed, or has the risk been accepted? */
export function dayOnePassed(d: ReturnType<typeof useApp>["d"]): boolean {
  const x = d.dayOne;
  // Passing all three isn't enough on its own: the results stay on screen until "Next".
  return !!x.accepted?.ok;
}

export function DayOne({ fromSettings }: { fromSettings?: boolean }) {
  const { d } = useApp();
  const x = d.dayOne;
  const [markerSet, setMarkerSet] = useState(false);
  const allOk = !!x.persist && !!x.reopened?.ok && !!x.folder;

  // 1. ask the browser to keep the data
  useEffect(() => {
    if (x.persist) return;
    persistStorage().then((r) => record({ type: "dayone", step: "persist", ok: r.persisted, detail: r.supported ? undefined : "not supported" }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. back after closing the browser? The marker is there but this browser session is new.
  useEffect(() => {
    (async () => {
      const marker = await kvGet<number>("dayoneMarker");
      const sameSession = sessionStorage.getItem(SESSION_FLAG);
      if (marker && !sameSession && !x.reopened?.ok) await record({ type: "dayone", step: "reopened", ok: true });
      sessionStorage.setItem(SESSION_FLAG, "1");
      setMarkerSet(!!marker);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const line = (ok: boolean | undefined, yes: string, no: string, wait: string) =>
    ok === undefined ? <span className="muted">{wait}</span> : <span>{ok ? yes : no}</span>;

  return (
    <Screen>
      <div className="column">
        <div className="eyebrow">Before your real data</div>
        <div className="title">Three checks on this laptop.</div>
        <div className="muted" style={{ fontSize: 17, lineHeight: 1.4 }}>Work laptops sometimes clear browser data. These take two minutes, and nothing you study goes in until they're done.</div>

        <div className="box">
          <div className="eyebrow">1 · Keeping the data</div>
          <div style={{ fontSize: 18 }}>{line(x.persist?.ok, "The browser will keep the app's data.",
            "The browser didn't promise to keep the data. It usually still does; the backup covers the rest.", "Asking the browser…")}</div>
        </div>

        <div className="box">
          <div className="eyebrow">2 · Closing the browser</div>
          {x.reopened?.ok ? <div style={{ fontSize: 18 }}>Your data survived closing the browser.</div> : markerSet ? (
            <div style={{ fontSize: 18 }}>Now close the browser completely (every window), open it again, and come back to this app.</div>
          ) : (
            <>
              <div style={{ fontSize: 18 }}>The app saves a small marker. Then you close the browser and open it again.</div>
              <button className="btn small outline" onClick={async () => { await kvSet("dayoneMarker", Date.now()); await record({ type: "dayone", step: "marker", ok: true }); setMarkerSet(true); }}>Save the marker</button>
            </>
          )}
          {!x.reopened?.ok && <div className="tiny">If you come back to a blank start screen instead, the browser cleared its data on closing. Then study on another laptop, or accept the risk below and back up often.</div>}
        </div>

        <div className="box">
          <div className="eyebrow">3 · The backup folder</div>
          {x.folder ? (
            <div style={{ fontSize: 18 }}>{x.folder.ok ? (x.folder.detail === "download" ? "This browser can't save into a folder, so backups download instead. That works." : "The backup folder can be written to.") : "That folder couldn't be written to. Try another, or backups will download."}</div>
          ) : folderSupported() ? (
            <>
              <div style={{ fontSize: 18 }}>Pick a folder once. Every Sunday's backup goes there; the last 8 are kept.</div>
              <button className="btn small outline" onClick={async () => {
                try { const h = await pickFolder(); if (h) await record({ type: "dayone", step: "folder", ok: await testFolderWrite(h) }); }
                catch { /* picker closed */ }
              }}>Pick a folder</button>
            </>
          ) : (
            <button className="btn small outline" onClick={() => void record({ type: "dayone", step: "folder", ok: true, detail: "download" })}>Use downloads for backups</button>
          )}
        </div>

        <div className="spacer" />
        {allOk ? (
          <button className="btn" onClick={async () => { await record({ type: "dayone", step: "accepted", ok: true, detail: "passed" }); go(fromSettings ? "/settings" : "/"); }}>
            {fromSettings ? "Back to settings" : "Next"}
          </button>
        ) : (
          <div className="row">
            <button className="btn ghost" style={{ flex: 1 }} onClick={async () => { await record({ type: "dayone", step: "accepted", ok: true, detail: "risk" }); go(fromSettings ? "/settings" : "/"); }}>
              Use it anyway, I'll back up often
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
}

export function LoadContent() {
  const { setContent } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const load = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    try { setContent(await saveContent(await readJsonFile(f))); }
    catch (x) { setErr(`${(x as Error).message} Pick the file called gmat-content-v1.json.`); }
  };
  return (
    <Screen>
      <div className="column" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void load(e.dataTransfer.files[0]); }}>
        <div className="eyebrow">Your study file</div>
        <div className="title">Load the study file once.</div>
        <div className="muted" style={{ fontSize: 17, lineHeight: 1.4 }}>
          The plan, the reading passages and the answer keys live in one file, <span className="mono" style={{ fontSize: 13 }}>gmat-content-v1.json</span>.
          The app keeps its own copy, so this happens once. Nothing is uploaded anywhere.
        </div>
        <div className="box" style={{ borderStyle: "dashed", borderColor: over ? "var(--ink)" : "var(--line-3)", background: over ? "var(--soft)" : "transparent" }}>
          <div style={{ fontSize: 17 }}>Where it is</div>
          <div className="small" style={{ lineHeight: 1.6 }}>
            On the laptop the app was built on: <b>Documents › 01_Projects › GMAT_ALL_IN_ONE › data</b>.<br />
            On another laptop: wherever you copied it (Downloads, a pen drive, your Drive).
          </div>
          <div className="small">Click below and pick it, or drag the file onto this box.</div>
        </div>
        <button className="btn" onClick={() => ref.current?.click()}>Choose the file</button>
        <input ref={ref} type="file" accept="application/json,.json" hidden onChange={(e) => void load(e.target.files?.[0])} />
        {err && <div className="note"><div style={{ fontSize: 17 }}>{err}</div></div>}
        <div className="spacer" />
        <button className="back" onClick={() => go("/dayone")}>← Back to the laptop checks</button>
      </div>
    </Screen>
  );
}

export function Setup() {
  const { d } = useApp();
  const [step, setStep] = useState<1 | 2>(1);
  const { auto } = useFinish();
  if (step === 1) {
    return (
      <Screen>
        <div className="column" style={{ gap: 16 }}>
          <div className="eyebrow">One of two</div>
          <div className="title">Here's the shape of it.</div>
          <DateFields />
          <div className="tiny" style={{ lineHeight: 1.5 }}>Finish date and hours are linked. Change one and the other moves.
            {auto && !d.settings.finishDate ? ` At this pace: ${longDate(auto)}.` : ""}</div>
          <div className="spacer" />
          <button className="btn" onClick={() => setStep(2)}>Next</button>
        </div>
      </Screen>
    );
  }
  return (
    <Screen>
      <div className="column" style={{ gap: 16 }}>
        <div className="eyebrow">Two of two</div>
        <div className="title">On a bus? One tap.</div>
        <div className="muted" style={{ fontSize: 17, lineHeight: 1.4 }}>No days or times to set. When you're on the bus, start bus mode one of these ways.</div>
        <div className="box">
          <div className="row" style={{ gap: 14 }}>
            <div style={{ width: 110, height: 48, borderRadius: 12, border: "2px solid var(--rc)", color: "var(--rc-d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>Bus</div>
            <div className="small">The Bus button on home, or press <b>B</b></div>
          </div>
        </div>
        <div className="box">
          <div className="row" style={{ gap: 14 }}>
            <div style={{ border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "8px 12px", fontSize: 16, boxShadow: "0 6px 14px rgba(0,0,0,.08)" }}>Bus ride</div>
            <div className="small">Right-click the app's icon on the taskbar</div>
          </div>
        </div>
        <div style={{ fontSize: 16, color: "var(--muted)" }}>It turns itself off after two hours, in case you forget.</div>
        <div className="spacer" />
        <button className="btn" autoFocus onClick={async () => { await record({ type: "setup.done" }); go("/"); }}>Got it</button>
      </div>
    </Screen>
  );
}
