import { useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import { DAY_NAMES, addDays, nextDeskSlot, parseYmd, ymd } from "../../core/calendar";
import { now } from "../../core/clock";
import type { Piece } from "../../core/pieces";
import { Back, Screen, useKeys } from "../bits";
import { words } from "../copy";
import { BookGrid } from "./Grid";
import { Drill } from "./Drill";
import { Outside } from "./Outside";
import { RcReader } from "./RcReader";
import { Video } from "./Video";

export interface Logged { toLookAgain: number; firstHalf?: boolean; note?: string }

export function TaskRunner({ pieceId }: { pieceId: string }) {
  const { byId } = useApp();
  const [logged, setLogged] = useState<Logged | null>(null);
  const p = byId.get(pieceId);
  if (!p) {
    return <Screen><Back /><div className="t">That task isn't in this plan.</div></Screen>;
  }
  if (logged) return <LoggedScreen piece={p} logged={logged} />;
  const done = (l: Logged | null) => (l ? setLogged(l) : go("/"));
  switch (p.task.kind) {
    case "og_set": return <BookGrid piece={p} onDone={done} />;
    case "rc_section": return <RcReader piece={p} onDone={done} />;
    case "drill": return <Drill piece={p} onDone={done} />;
    case "video": return <Video piece={p} onDone={done} />;
    default: return <Outside piece={p} onDone={done} />;
  }
}

/** On submit, the same day: a count, never the letters (spec: After a set). */
function LoggedScreen({ piece, logged }: { piece: Piece; logged: Logged }) {
  const { d } = useApp();
  useKeys({ Enter: () => go("/") });
  let when = "";
  if (!logged.firstHalf && logged.toLookAgain > 0) {
    if (piece.group === "Q") {
      const slot = nextDeskSlot(now(), d.settings, 3) ?? nextDeskSlot(now(), d.settings, 14);
      when = slot ? `, back on ${DAY_NAMES[parseYmd(slot.day).getDay()]}` : "";
    } else {
      let t = addDays(now(), 1);
      while (t.getDay() === 0 || t.getDay() === 6) t = addDays(t, 1);
      when = `, back on ${DAY_NAMES[parseYmd(ymd(t)).getDay()]}`;
    }
  }
  const n = logged.toLookAgain;
  return (
    <Screen>
      <div className="column">
        <div className="eyebrow">Logged</div>
        <div className="title">
          {logged.firstHalf ? "First half done. The rest comes up next."
            : n === 0 ? "Logged. Nothing to look at again."
            : `Logged. ${words(n)} to look at again${when}.`}
        </div>
        {logged.note && <div className="muted" style={{ fontSize: 18 }}>{logged.note}</div>}
        <div className="spacer" />
        <button className="btn" autoFocus onClick={() => go("/")}>Back to today</button>
      </div>
    </Screen>
  );
}
