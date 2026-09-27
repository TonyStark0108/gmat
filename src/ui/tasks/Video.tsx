// Videos play inside the app (spec: Video). Hours count while it plays; 80% watched marks it done.
// It resumes at the second you left. If the video is gone, the fallback opens without asking.

import { useEffect, useRef, useState } from "react";
import { useApp } from "../../app/store";
import type { Piece } from "../../core/pieces";
import { record } from "../../data/db";
import { Back, Screen, openOut } from "../bits";
import { SUBJECT } from "../copy";
import { useFocus } from "../focus";
import type { Logged } from "./TaskRunner";

declare global {
  interface Window { YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer }; onYouTubeIframeAPIReady?: () => void }
}
interface YTPlayer { getCurrentTime(): number; getDuration(): number; getPlayerState(): number; destroy(): void }

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise((res, rej) => {
    window.onYouTubeIframeAPIReady = () => res();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => { apiPromise = null; rej(new Error("no signal")); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export function Video({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { d, online, bus } = useApp();
  const focus = useFocus();
  const k = SUBJECT[piece.section];
  const ptr = piece.task.pointer;
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone" | "offline">(online ? "loading" : "offline");
  const [watched, setWatched] = useState(false);
  const [line, setLine] = useState("");
  const saved = d.video.get(piece.id);
  const playedMs = useRef(0);

  useEffect(() => {
    if (!online || !ptr.youtube_id) return;
    let alive = true;
    loadApi().then(() => {
      if (!alive || !host.current || !window.YT) return;
      player.current = new window.YT.Player(host.current, {
        videoId: ptr.youtube_id,
        playerVars: { start: Math.floor(saved?.seconds ?? 0), rel: 0, modestbranding: 1 },
        events: {
          onReady: () => setState("ready"),
          onError: () => {
            setState("gone");
            const alt = piece.task.alternatives[0]?.url ?? `https://www.youtube.com/watch?v=${ptr.youtube_id}`;
            openOut(alt);    // switch to the fallback without asking
          },
        },
      });
    }).catch(() => setState("offline"));
    return () => { alive = false; player.current?.destroy(); };
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every 5 s while playing: count the time; every 30 s save the place; at 80% it's done.
  useEffect(() => {
    let lastSave = 0;
    const t = setInterval(() => {
      const p = player.current;
      if (!p || typeof p.getPlayerState !== "function") return;
      const playing = p.getPlayerState() === 1;
      if (playing) playedMs.current += 5000;
      const cur = p.getCurrentTime?.() ?? 0, dur = p.getDuration?.() ?? 0;
      if (playing && Date.now() - lastSave > 30_000) {
        lastSave = Date.now();
        void record({ type: "video.progress", piece: piece.id, seconds: cur, duration: dur });
      }
      if (dur > 0 && cur / dur >= 0.8 && !watched) setWatched(true);
    }, 5000);
    return () => { clearInterval(t); flush(); };
  }, [watched]); // eslint-disable-line react-hooks/exhaustive-deps

  function flush() {
    const m = Math.round(playedMs.current / 60_000);
    playedMs.current = 0;
    if (m > 0) void record({ type: "time", minutes: m, where: bus ? "bus" : "desk", piece: piece.id, source: "video" });
    const p = player.current;
    if (p?.getCurrentTime) void record({ type: "video.progress", piece: piece.id, seconds: p.getCurrentTime(), duration: p.getDuration() });
  }

  async function finish() {
    if (line.trim()) await record({ type: "line", source: `video:${piece.id}`, text: line.trim() });
    await record({ type: "piece.done", piece: piece.id });
    flush();
    focus.boundary(0, true);
    onDone(null);
  }

  return (
    <Screen wide right={bus ? "videos need your hotspot" : ""}>
      <Back label="← Today · pause" onClick={() => { flush(); history.back(); }} />
      <div className="eyebrow" style={{ color: k.d }}>{k.name} · video</div>
      <div style={{ fontSize: 25, lineHeight: 1.15 }}>{piece.task.title}</div>
      {state === "offline" && <div className="note"><div style={{ fontSize: 18 }}>Videos need signal. It's here when you have some.</div></div>}
      {state === "gone" && <div className="note"><div style={{ fontSize: 18 }}>This video won't play here, so it opened on YouTube instead.</div></div>}
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#000", borderRadius: 14, overflow: "hidden", display: state === "offline" ? "none" : "block" }}>
        <div ref={host} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>
      {watched ? (
        <div className="box">
          <div style={{ fontSize: 19 }}>In one line: what will you do differently?</div>
          <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Optional. It becomes a card." onKeyDown={(e) => { if (e.key === "Enter") void finish(); }}
            style={{ height: 44, border: "none", borderBottom: "1.5px solid var(--line-3)", background: "transparent", fontSize: 17, outline: "none" }} />
          <button className="btn" style={{ background: k.c, borderColor: k.c }} onClick={() => void finish()}>Done</button>
        </div>
      ) : (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="tiny">{saved ? `Picks up at ${Math.floor(saved.seconds / 60)} min.` : "Done once you've watched most of it."}</span>
          <button className="back" onClick={() => void finish()}>Mark it watched</button>
        </div>
      )}
    </Screen>
  );
}
