// Drills (spec: Drill): the plan's worksheets without A–E choices. Open the sheet, work in your
// notebook against a large stopwatch, check against the sheet's key, enter score and time.

import { useEffect, useState } from "react";
import { useApp } from "../../app/store";
import type { Piece } from "../../core/pieces";
import { record } from "../../data/db";
import { Back, Screen, openOut, useKeys } from "../bits";
import { SUBJECT } from "../copy";
import { useFocus, useTaskTime } from "../focus";
import type { Logged } from "./TaskRunner";

export function Drill({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { d } = useApp();
  const focus = useFocus();
  const k = SUBJECT[piece.section];
  const target = piece.task.target;
  const url = piece.task.pointer.url ?? "";
  const [running, setRunning] = useState(false);
  const [ms, setMs] = useState(0);
  const [right, setRight] = useState("");
  const [total, setTotal] = useState(String(target?.count ?? 10));
  const time = useTaskTime(piece.id, "desk", "drill");
  const goes = d.drills.get(piece.id)?.length ?? 0;

  useEffect(() => {
    if (!running) return;
    const start = Date.now() - ms;
    const t = setInterval(() => setMs(Date.now() - start), 250);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  useKeys({ " ": () => setRunning((r) => !r) }, []);
  const mm = Math.floor(ms / 60000), ss = Math.floor(ms / 1000) % 60;

  async function save() {
    const r = Number(right), t = Number(total), seconds = Math.round(ms / 1000);
    const met = !!target && t > 0 && r === t && (target.minutes === null || seconds <= target.minutes * 60);
    await record({ type: "drill", piece: piece.id, go: goes + 1, right: r, total: t, seconds, met });
    await record({ type: "piece.done", piece: piece.id });
    time.flush();
    focus.boundary(0, true);
    onDone({ toLookAgain: 0, firstHalf: false, note: met ? "Target reached." : target ? "It comes back at your next desk session until the target's reached." : undefined });
  }

  return (
    <Screen right={focus.sitting ? `focus ${focus.focusMinutes} min` : ""}>
      <div className="column" style={{ gap: 14 }}>
        <Back label="← Today · pause" onClick={() => { time.flush(); history.back(); }} />
        <div className="eyebrow" style={{ color: k.d }}>{k.name} · drill</div>
        <div style={{ fontSize: 25 }}>{piece.task.title}</div>
        {target && <div className="ptr" style={{ background: k.t }}>Target: {target.count} at 100%{target.minutes ? `, under ${target.minutes} minutes` : ""}</div>}
        <button className="btn outline small" style={{ alignSelf: "flex-start" }} onClick={() => openOut(url)}>Open the worksheet ↗</button>
        <div style={{ fontSize: 96, lineHeight: 1, textAlign: "center", fontFamily: "var(--mono)", margin: "10px 0" }}>
          {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn small" style={{ width: 160, background: k.c, borderColor: k.c }} onClick={() => setRunning((r) => !r)}>{running ? "Stop" : ms ? "Carry on" : "Start"}</button>
          {ms > 0 && !running && <button className="btn ghost small" onClick={() => setMs(0)}>Clear</button>}
        </div>
        <div className="tiny" style={{ textAlign: "center" }}>Space starts and stops</div>
        <div className="field"><span>Right</span><input inputMode="numeric" value={right} onChange={(e) => setRight(e.target.value.replace(/\D/g, ""))} style={{ width: 70 }} /></div>
        <div className="field"><span>Out of</span><input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))} style={{ width: 70 }} /></div>
        <div className="spacer" />
        <button className="btn" disabled={right === "" || running} style={{ background: k.c, borderColor: k.c }} onClick={() => void save()}>Save the score</button>
      </div>
    </Screen>
  );
}
