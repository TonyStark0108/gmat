// The focus timer (spec: Focus timer and hours). A sitting session starts when you Start a task off
// the bus. Breaks only come at a boundary: never mid-question, mid-passage or mid-timed-set.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { now } from "../core/clock";
import type { Budget } from "../core/week";
import { record } from "../data/db";
import { useApp } from "../app/store";

interface Focus {
  focusMinutes: number;               // since the last break
  sitting: boolean;
  startSitting: () => void;
  /** Call at a boundary (a set done; or, past 75 minutes into a set, the next question or passage). */
  boundary: (minutesIntoSet?: number, endOfSet?: boolean) => void;
  setActive: (on: boolean) => void;
}

const FocusCtx = createContext<Focus | null>(null);
export const useFocus = () => useContext(FocusCtx)!;

export function FocusProvider({ children }: { children: ReactNode }) {
  const { d } = useApp();
  const s = d.settings;
  const [sitting, setSitting] = useState(false);
  const [sinceBreakMs, setSinceBreak] = useState(0);
  const totalMs = useRef(0);
  const active = useRef(false);
  const [offer, setOffer] = useState<null | "break" | "long">(null);
  const [breakUntil, setBreakUntil] = useState<Date | null>(null);
  const longShown = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (!sitting || !active.current || document.hidden || breakUntil) return;
      setSinceBreak((x) => x + 5000);
      totalMs.current += 5000;
    }, 5000);
    return () => clearInterval(t);
  }, [sitting, breakUntil]);

  useEffect(() => {
    if (!breakUntil) return;
    const t = setInterval(() => { if (now() >= breakUntil) { setBreakUntil(null); setSinceBreak(0); } }, 5000);
    return () => clearInterval(t);
  }, [breakUntil]);

  const boundary = useCallback((minutesIntoSet = 0, endOfSet = true) => {
    if (!sitting) return;
    if (!endOfSet && minutesIntoSet < 75) return;
    if (totalMs.current >= 4 * 3_600_000 && !longShown.current) { longShown.current = true; setOffer("long"); return; }
    if (sinceBreakMs >= s.focusMin * 60_000) setOffer("break");
  }, [sitting, sinceBreakMs, s.focusMin]);

  const value: Focus = {
    focusMinutes: Math.floor(sinceBreakMs / 60_000), sitting,
    startSitting: () => setSitting(true), boundary, setActive: (on) => { active.current = on; },
  };
  const back = new Date(now().getTime() + s.breakMin * 60_000);
  const hhmm = `${back.getHours() % 12 || 12}:${String(back.getMinutes()).padStart(2, "0")}`;
  return (
    <FocusCtx.Provider value={value}>
      {children}
      {offer && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="card" style={{ maxWidth: 440, minHeight: 0 }}>
            <div className="eyebrow">Break</div>
            <div className="t">{offer === "long" ? "That's four hours. A longer break would help more than the next set." : `${words10(s.breakMin)} minutes. Back at ${hhmm}.`}</div>
            <div className="row">
              <button className="btn" style={{ flex: 1 }} autoFocus onClick={() => { setOffer(null); setBreakUntil(back); }}>Take it</button>
              <button className="btn ghost" onClick={() => { setOffer(null); setSinceBreak(0); }}>Carry on</button>
            </div>
          </div>
        </div>
      )}
    </FocusCtx.Provider>
  );
}

const words10 = (n: number) => (n === 10 ? "Ten" : n === 5 ? "Five" : n === 15 ? "Fifteen" : String(n));

/**
 * Honest hours: time on a task while you're active. It stops after `idleMin` without a sign of
 * activity (5 minutes in the app; 15 minutes for book sets, which pause themselves).
 */
export function useTaskTime(pieceId: string, where: Budget, source: string, idleMin = 5) {
  const { setActive } = useFocus();
  const ms = useRef(0);
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    setActive(true);
    const poke = () => { lastActivity.current = Date.now(); };
    window.addEventListener("keydown", poke);
    window.addEventListener("pointerdown", poke);
    window.addEventListener("scroll", poke, true);
    const t = setInterval(() => {
      if (!document.hidden && Date.now() - lastActivity.current < idleMin * 60_000) ms.current += 5000;
    }, 5000);
    return () => {
      setActive(false);
      clearInterval(t);
      window.removeEventListener("keydown", poke);
      window.removeEventListener("pointerdown", poke);
      window.removeEventListener("scroll", poke, true);
      flush();
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const flush = useCallback(() => {
    const minutes = Math.round(ms.current / 60_000);
    ms.current = 0;
    if (minutes > 0) void record({ type: "time", minutes, where, piece: pieceId, source });
  }, [pieceId, where, source]);
  return { poke: () => { lastActivity.current = Date.now(); }, flush, addMinutes: (m: number) => { ms.current += m * 60_000; } };
}
