// "Something came up" (spec: When life happens): tonight, this weekend, or a whole week, now or in
// advance. Tonight's chips move into the rest of the week; a lost weekend or week runs the date check.

import { useEffect, useRef, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { longDate, plusDays } from "../core/calendar";
import { lifeEvent, lifeMessage, type LifeKind } from "../core/life";
import { dateCheckEvent } from "../core/model";
import { planKey } from "../core/weekly";
import { record } from "../data/db";
import { Back, Screen } from "./bits";

export function Life() {
  const { m, d, today } = useApp();
  const [kind, setKind] = useState<LifeKind | null>(null);
  const [ahead, setAhead] = useState(false);
  const [day, setDay] = useState(plusDays(today, 1));
  const [phase, setPhase] = useState<"pick" | "waiting" | "done">("pick");
  const before = useRef<number>(0);
  const [msg, setMsg] = useState<string[]>([]);

  const go1 = async (k: LifeKind) => {
    setKind(k);
    before.current = (m.week?.chips ?? []).filter((c) => !d.done.has(c.pieceId)).length;
    await record(lifeEvent(k, today, ahead ? day : undefined));
    setPhase("waiting");
  };

  // once the week has been rebuilt around it, say what moved and run the date check
  useEffect(() => {
    if (phase !== "waiting" || !kind) return;
    const w = d.weeks.get(m.weekStart);
    if (w && w.key !== planKey(d.settings)) return;
    const after = (m.week?.chips ?? []).filter((c) => !d.done.has(c.pieceId)).length;
    const moved = Math.max(0, before.current - after);
    const lines = [lifeMessage(kind, moved, ahead ? day : undefined)];
    (async () => {
      if (kind !== "tonight") {
        const c = dateCheckEvent(m);
        await record(c);
        if (c.result === "safe") lines.push("The finish date is safe.");
        else lines.push("The finish date needs a look: it's on the home screen.");
      }
      setMsg(lines);
      setPhase("done");
    })();
  }, [m, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase !== "pick") {
    return (
      <Screen><div className="column">
        <div className="eyebrow">Something came up</div>
        {phase === "waiting" ? <div className="title">Moving things…</div> : msg.map((l, i) => <div key={i} className={i ? "" : "title"} style={i ? { fontSize: 19 } : undefined}>{l}</div>)}
        <div className="spacer" />
        {phase === "done" && <button className="btn" autoFocus onClick={() => go("/")}>Back to today</button>}
      </div></Screen>
    );
  }
  return (
    <Screen>
      <div className="column">
        <Back />
        <div className="title">Something came up.</div>
        <div className="muted" style={{ fontSize: 17 }}>Nothing is lost: the work moves into the time you have.</div>
        <div className="field">
          <span>In advance</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="toggle" onClick={() => setAhead((x) => !x)}>{ahead ? "on" : "off"}</button>
            {ahead && <input type="date" value={day} min={plusDays(today, 1)} onChange={(e) => e.target.value && setDay(e.target.value)} />}
          </div>
        </div>
        {ahead && <div className="small">Starting {longDate(day)}: a wedding next Saturday, a work trip next week.</div>}
        <button className="btn outline" onClick={() => void go1("tonight")}>{ahead ? "That evening" : "Tonight"}</button>
        <button className="btn outline" onClick={() => void go1("weekend")}>{ahead ? "That weekend" : "This weekend"}</button>
        <button className="btn outline" onClick={() => void go1("week")}>{ahead ? "That whole week" : "A whole week"}</button>
        <div className="tiny" style={{ lineHeight: 1.5 }}>A whole week becomes a light bus week: 4–5 hours of reading, videos and cards. It still counts as a week done.</div>
      </div>
    </Screen>
  );
}
