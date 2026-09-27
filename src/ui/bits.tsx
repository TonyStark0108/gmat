import { useEffect, useState, type ReactNode } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";

export function Screen({ children, wide, right }: { children: ReactNode; wide?: boolean; right?: ReactNode }) {
  const { now: t, bus, online } = useApp();
  const time = `${t.getHours() % 12 || 12}:${String(t.getMinutes()).padStart(2, "0")} ${t.getHours() < 12 ? "am" : "pm"}`;
  return (
    <div className="frame">
      <div className={`app${wide ? " wide" : ""}`}>
        <div className="status">
          <span>{time}{bus ? " · bus" : ""}{online ? "" : " · no signal"}</span>
          <span>{right}</span>
        </div>
        <div className="screen">{children}</div>
      </div>
    </div>
  );
}

export function Back({ to = "/", label = "← Today", onClick }: { to?: string; label?: string; onClick?: () => void }) {
  return <button className="back" onClick={onClick ?? (() => go(to))}>{label}</button>;
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<{ t: string; k: number } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg ? <div key={msg.k} className="toast" role="status">{msg.t}</div> : null, (t) => setMsg({ t, k: Date.now() })];
}

/** Keyboard shortcuts for a screen; ignored while typing in a field. */
export function useKeys(map: Record<string, (e: KeyboardEvent) => void>, deps: unknown[] = []) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const f = map[e.key] ?? map[e.key.toLowerCase()];
      if (f) { e.preventDefault(); f(e); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function openOut(url: string) {
  window.open(url, "_blank", "noopener");
}
