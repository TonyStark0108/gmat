// The developer "time machine" (spec: How hard it is to build). Only in development builds:
// the version you use doesn't include it.

import { useState } from "react";
import { useApp } from "../app/store";
import { clockOffset, now, setClockOffset } from "../core/clock";
import { Back, Screen } from "./bits";

export const DEV_OFFSET_KEY = "gmat-dev-offset";

export function TimeMachine() {
  const { refresh } = useApp();
  const [, re] = useState(0);
  const shift = (ms: number) => {
    setClockOffset(clockOffset() + ms);
    localStorage.setItem(DEV_OFFSET_KEY, String(clockOffset()));
    refresh();
    re((x) => x + 1);
  };
  const setTo = (iso: string) => {
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return;
    shift(target - now().getTime());
  };
  const H = 3_600_000, D = 24 * H;
  const t = now();
  const local = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <Screen>
      <div className="column">
        <Back />
        <div className="eyebrow">Development only</div>
        <div className="title">Time machine</div>
        <div className="mono" style={{ fontSize: 15 }}>App time: {t.toString().slice(0, 21)}</div>
        <div className="row wrap">
          {[["+1 hour", H], ["+3 hours", 3 * H], ["+1 day", D], ["+1 week", 7 * D], ["−1 day", -D]].map(([l, ms]) => (
            <button key={l as string} className="btn small outline" onClick={() => shift(ms as number)}>{l as string}</button>
          ))}
        </div>
        <div className="field"><span>Jump to</span><input type="datetime-local" defaultValue={local} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="row wrap">
          <button className="btn small ghost" onClick={() => setTo("2026-12-01T07:50")}>Plan start, Tue 07:50</button>
          <button className="btn small ghost" onClick={() => setTo("2026-12-05T10:05")}>First Saturday 10:05</button>
          <button className="btn small ghost" onClick={() => setTo("2026-12-07T18:45")}>Monday 18:45 (bus)</button>
          <button className="btn small ghost" onClick={() => shift(-clockOffset())}>Back to real time</button>
        </div>
        <div className="tiny">Everything the app records while shifted is stamped with the shifted time.</div>
      </div>
    </Screen>
  );
}
