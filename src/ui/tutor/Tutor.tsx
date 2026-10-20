// Your tutor (Claude). Sessions on the left, the conversation on the right. Start one from here or
// from anywhere in the app ("Ask the tutor about this one" in a review, a mock's result, the Sunday
// note). Photos of a question go in with the paperclip, a paste, or a drop.

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import { overCap, spentThisMonth } from "../../core/tutor/cost";
import { MODES, type TutorMode } from "../../core/tutor/prompt";
import { CONTEXT_MARK, starterFor } from "../../core/tutor/starters";
import { db, type TutorThread } from "../../data/db";
import { TutorError, newThread, photoToBlock, runTurn, saveThread, saveTutorKey, shownMessages, tutorPrefs, type TutorPrefs } from "../../data/tutor";
import { Back, Screen } from "../bits";
import { Markdown } from "./Markdown";

type Img = Awaited<ReturnType<typeof photoToBlock>>;

export function TutorScreen({ params }: { params: URLSearchParams }) {
  const { m, d, today, online } = useApp();
  const [prefs, setPrefs] = useState<TutorPrefs | null>(null);
  useEffect(() => { void tutorPrefs().then(setPrefs); }, []);
  const threads = useLiveQuery(() => db.threads.orderBy("updated").reverse().toArray(), [], [] as TutorThread[]);
  const ctx = params.get("ctx");
  const starter = useMemo(() => starterFor(m, ctx), [ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const [thread, setThread] = useState<TutorThread | null>(null);

  // open the session named in the address, or start one from where you came from
  useEffect(() => {
    const id = params.get("t");
    if (id) { void db.threads.get(id).then((t) => t && setThread(t)); return; }
    if (starter) { setThread({ ...newThread(starter.mode, starter.title), draft: starter.text, draftContext: starter.context }); return; }
    const mode = params.get("mode") as TutorMode | null;
    if (mode) setThread(newThread(mode, MODES.find((x) => x.mode === mode)?.label ?? "Session"));
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prefs) return null;
  if (!prefs.key) return <KeySetup onSaved={() => void tutorPrefs().then(setPrefs)} />;
  const spent = spentThisMonth(d.tutorSpend, today);
  const capped = overCap(d.tutorSpend, today, prefs.cap);

  return (
    <Screen wide right={`tutor · $${spent.toFixed(2)} this month`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Back />
        {!online && <span className="tiny">The tutor needs signal. Everything else works offline.</span>}
      </div>
      <div className="tutor-grid">
        <aside style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, overflowY: "auto" }}>
          <div className="eyebrow">New session</div>
          {MODES.map((x) => (
            <button key={x.mode} className="btn small outline" style={{ justifyContent: "flex-start", fontSize: 15 }} title={x.hint}
              onClick={() => setThread(newThread(x.mode, x.label))}>{x.label}</button>
          ))}
          {threads.length > 0 && <div className="eyebrow" style={{ marginTop: 10 }}>Earlier</div>}
          {threads.slice(0, 30).map((t) => (
            <button key={t.id} className="back" style={{ textAlign: "left", color: thread?.id === t.id ? "var(--ink)" : "var(--muted)", padding: "6px 0", fontSize: 13 }}
              onClick={() => setThread(t)}>{t.title}<br /><span className="tiny">{new Date(t.updated).toLocaleDateString()}</span></button>
          ))}
        </aside>
        <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          {thread ? <Conversation key={thread.id} initial={thread} prefs={prefs} capped={capped} wantsPhoto={!!starter?.wantsPhoto && thread.messages.length === 0} />
            : <Welcome onPick={(x) => setThread(newThread(x, MODES.find((y) => y.mode === x)!.label))} first={!threads.length} />}
        </main>
      </div>
    </Screen>
  );
}

function Welcome({ onPick, first }: { onPick: (m: TutorMode) => void; first: boolean }) {
  return (
    <div className="column" style={{ gap: 14 }}>
      <div className="title">Your tutor</div>
      <div className="muted" style={{ fontSize: 17, lineHeight: 1.45 }}>
        It knows your plan, your errors in your own words, your accuracy by topic and your mocks. It explains questions from the official answer, teaches from your own mistakes, sets official homework (you approve it first), and checks in with you each week.
      </div>
      {first && <button className="btn" onClick={() => onPick("intake")}>Start with "Get to know me"</button>}
      <div className="small">It needs signal and uses your Claude API key; what it costs shows at the top.</div>
    </div>
  );
}

function Conversation({ initial, prefs, capped, wantsPhoto }: { initial: TutorThread; prefs: TutorPrefs; capped: boolean; wantsPhoto: boolean }) {
  const app = useApp();
  const mRef = useRef(app.m);
  mRef.current = app.m;
  const [thread, setThread] = useState(initial);
  const [text, setText] = useState(initial.draft ?? "");
  const [images, setImages] = useState<Img[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [ask, setAsk] = useState<{ text: string; resolve: (ok: boolean) => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const shown = shownMessages(thread);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [shown.length, streaming, ask]);

  const addFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) if (f.type.startsWith("image/")) {
      const b = await photoToBlock(f);
      setImages((x) => [...x, b]);
    }
  };

  const send = async () => {
    if (busy || capped || (!text.trim() && !images.length)) return;
    if (!navigator.onLine) { setError("No signal right now. Your message is kept here; send it when you're back online."); return; }
    setError(null);
    const context = thread.messages.length === 0 && thread.draftContext ? [{ type: "text" as const, text: `${CONTEXT_MARK} ${thread.draftContext}` }] : [];
    const content = [...images, ...(text.trim() ? [{ type: "text" as const, text: text.trim() }] : []), ...context];
    const first = thread.messages.length === 0;
    let t: TutorThread = { ...thread, messages: [...thread.messages, { role: "user", content }], draft: undefined, draftContext: undefined,
      title: first && thread.mode === "free" ? text.trim().slice(0, 48) || thread.title : thread.title };
    await saveThread(t);
    setThread(t); setText(""); setImages([]); setBusy(true); setStreaming(""); setActivity([]);
    abort.current = new AbortController();
    try {
      t = await runTurn({ prefs, model: () => mRef.current, thread: t, signal: abort.current.signal }, {
        onText: (delta) => setStreaming((s) => (s ?? "") + delta),
        onMessage: (nt) => { setThread(nt); setStreaming(""); },
        approve: (a) => new Promise<boolean>((resolve) => setAsk({ text: a, resolve })),
        onTool: (_name, summary) => setActivity((x) => [...x, summary]),
      });
      setThread(t);
    } catch (e) {
      setError(e instanceof TutorError ? e.message : `Something went wrong: ${(e as Error).message}`);
    } finally {
      setBusy(false); setStreaming(null); setAsk(null); abort.current = null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}>
      <div className="eyebrow">{thread.title}</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 6 }}>
        {shown.length === 0 && !streaming && <div className="muted" style={{ fontSize: 16 }}>{MODES.find((x) => x.mode === thread.mode)?.hint}</div>}
        {shown.map((s, i) => s.who === "you" ? (
          <div key={i} className="bubble you">
            {s.images.map((src, j) => <img key={j} src={src} alt="your photo" style={{ maxWidth: 260, borderRadius: 8, display: "block", marginBottom: 6 }} />)}
            {s.text}
          </div>
        ) : s.who === "tutor" ? (
          <div key={i} className="bubble tutor"><Markdown text={s.text} /></div>
        ) : <div key={i} className="tiny" style={{ paddingLeft: 4 }}>· {s.text}</div>)}
        {streaming !== null && streaming !== "" && <div className="bubble tutor"><Markdown text={streaming} /></div>}
        {busy && !streaming && !ask && <div className="tiny" style={{ paddingLeft: 4 }}>Thinking…</div>}
        {activity.filter((a) => a.startsWith("Added") || a.startsWith("Saved") || a.startsWith("Noted")).map((a, i) => <div key={`a${i}`} className="small" style={{ paddingLeft: 4 }}>✓ {a}</div>)}
        {ask && (
          <div className="note">
            <div className="eyebrow">Homework from your tutor</div>
            <div style={{ fontSize: 17 }}>{ask.text}</div>
            <div className="row">
              <button className="btn small" style={{ flex: 1 }} onClick={() => { ask.resolve(true); setAsk(null); }}>Add to my week</button>
              <button className="btn ghost small" onClick={() => { ask.resolve(false); setAsk(null); }}>Not now</button>
            </div>
          </div>
        )}
        {error && <div className="note"><div style={{ fontSize: 16 }}>{error}</div>{error.includes("Settings") && <button className="back" onClick={() => go("/settings")}>Settings →</button>}</div>}
        <div ref={end} />
      </div>
      {capped && <div className="small">This month's tutor budget is used up. You can raise it in Settings.</div>}
      {wantsPhoto && !images.length && <div className="small">Add a photo of the question (the Photo button, paste or drop) so the tutor can see it.</div>}
      {images.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          {images.map((_, i) => <span key={i} className="pill" style={{ cursor: "pointer" }} onClick={() => setImages((x) => x.filter((_, j) => j !== i))} title="Remove">photo {i + 1} ×</span>)}
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
        <label className="btn ghost small" style={{ width: 52, flex: "none", cursor: "pointer" }} title="Add a photo">
          Photo<input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(6, Math.max(2, text.split("\n").length))}
          placeholder="Ask anything. Enter sends; Shift+Enter for a new line."
          onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); void addFiles(files); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          style={{ flex: 1, border: "1.5px solid var(--line-2)", borderRadius: 12, padding: "10px 12px", fontSize: 16, fontFamily: "var(--read)", resize: "none", background: "#fff" }} />
        {busy ? <button className="btn small ghost" style={{ width: 80 }} onClick={() => abort.current?.abort()}>Stop</button>
          : <button className="btn small" style={{ width: 80 }} disabled={capped || (!text.trim() && !images.length)} onClick={() => void send()}>Send</button>}
      </div>
    </div>
  );
}

function KeySetup({ onSaved }: { onSaved: () => void }) {
  const [k, setK] = useState("");
  return (
    <Screen>
      <div className="column" style={{ gap: 14 }}>
        <Back />
        <div className="title">Connect your tutor</div>
        <div className="muted" style={{ fontSize: 17, lineHeight: 1.45 }}>
          The tutor is Claude, using your own Claude API key. The key stays in this browser on this laptop: it's never in a backup, the code or the website.
        </div>
        <ol style={{ fontSize: 16, lineHeight: 1.6, margin: 0, paddingLeft: 22 }}>
          <li>Sign in at console.anthropic.com and create an API key.</li>
          <li>Set a monthly spend limit there too (for example $20), so nothing can surprise you.</li>
          <li>Paste the key here.</li>
        </ol>
        <input type="password" value={k} onChange={(e) => setK(e.target.value)} placeholder="sk-ant-…" autoComplete="off"
          style={{ height: 48, border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "0 12px", font: "400 14px var(--mono)", background: "#fff" }} />
        <button className="btn" disabled={!k.trim().startsWith("sk-ant-")} onClick={async () => { await saveTutorKey(k); onSaved(); }}>Save the key</button>
        <div className="small">Roughly 4 US cents an explanation; heavy daily use is about $10–15 a month. A monthly cap is in Settings.</div>
      </div>
    </Screen>
  );
}
