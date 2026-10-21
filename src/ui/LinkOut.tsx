// Every link-out has a small "Didn't load" button, and coming back to the app within 15 seconds of
// leaving asks "Didn't load? Try this instead." (spec: Links). A link marked dead is never shown again.

import { useEffect, useRef, useState } from "react";
import { record } from "../data/db";
import { openOut } from "./bits";

export interface Fallback { label: string; run: () => void }

export function LinkOut({ url, label, fallback, color, small = true, onOpen, compact }: {
  url: string; label: string; fallback?: () => Fallback | null; color?: { c: string; d: string }; small?: boolean; onOpen?: () => void; compact?: boolean;
}) {
  const leftAt = useRef<number | null>(null);
  const [ask, setAsk] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const back = () => {
      if (document.hidden || leftAt.current === null) return;
      if (Date.now() - leftAt.current < 15_000) setAsk(true);
      leftAt.current = null;
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, []);

  const open = () => { leftAt.current = Date.now(); setAsk(false); setOpened(true); onOpen?.(); openOut(url); };
  const dead = async (why: string) => {
    setAsk(false);
    await record({ type: "link.dead", url, why });
    fallback?.()?.run();
  };
  const fb = fallback?.() ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className={compact ? undefined : "row"} style={compact ? { display: "flex", flexDirection: "column", gap: 2 } : { gap: 6 }}>
        <button className={`btn outline${small ? " small" : ""}`} style={{ fontSize: 15, height: 48, borderColor: color?.c, color: color?.d, whiteSpace: "nowrap" }} onClick={open}>{label} ↗</button>
        {opened && <button className="back" style={{ padding: compact ? "2px 0" : "6px 4px", fontSize: compact ? 10 : undefined, alignSelf: compact ? "center" : undefined }} title="Use the backup instead" onClick={() => void dead("didn't load")}>Didn't load</button>}
      </div>
      {ask && (
        <div className="note" role="dialog">
          <div style={{ fontSize: 17 }}>Didn't load? {fb ? "Try this instead." : ""}</div>
          <div className="row">
            {fb && <button className="btn small" style={{ flex: 1 }} onClick={() => void dead("came back within 15 s")}>{fb.label}</button>}
            <button className="btn ghost small" onClick={() => setAsk(false)}>It loaded</button>
          </div>
        </div>
      )}
    </div>
  );
}
