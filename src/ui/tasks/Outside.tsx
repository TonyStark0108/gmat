// Tasks that happen on another site: articles, GMAT Club lists (required sets, extra practice,
// top-ups), the DI stand-ins, timed sections, purchases. The app says exactly what to do there and
// records the result (spec: G2; Extra practice; Top-ups; Sending a question to the app).

import { useEffect, useMemo, useRef, useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import type { Section } from "../../core/content";
import { otherList } from "../../core/links";
import type { Piece } from "../../core/pieces";
import { DI_TYPE_OF, listTopic } from "../../core/topics";
import { weekStartOf } from "../../core/calendar";
import { listOrder, paceLine, topicsOfPiece, zoneLine } from "../../core/flow";
import { topicName } from "../../core/topics";
import { record } from "../../data/db";
import { Back, Screen } from "../bits";
import { SUBJECT, pointerOf, titleOf, whereOf } from "../copy";
import { useFocus } from "../focus";
import { LinkOut } from "../LinkOut";
import { BookGrid } from "./Grid";
import type { Logged } from "./TaskRunner";

export function Outside({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { content, bus, d, m } = useApp();
  const focus = useFocus();
  const t = piece.task, ptr = t.pointer;
  const k = SUBJECT[piece.section];
  const [counts, setCounts] = useState({ right: 0, wrong: 0, unsure: 0 });
  const diTypes = t.kind === "di_set" ? ((ptr.types as string[] | undefined) ?? []) : [];
  const [byType, setByType] = useState<Record<string, { right: number; wrong: number; unsure: number }>>(() => Object.fromEntries(diTypes.map((x) => [x, { right: 0, wrong: 0, unsure: 0 }])));
  const perType = diTypes.length > 1;
  const [gridDone, setGridDone] = useState(false);
  const refresher = ptr.refresher as { type: "video"; youtubeId: string; url: string; title: string } | { type: "cards"; topic: string } | undefined;
  const [refreshed, setRefreshed] = useState(!refresher || d.seen.has(`refresher:${piece.id}`));

  // Time away on the other site counts, within limits: 6 min a CR question, an hour for a list.
  const cap = t.kind === "cr_set" ? (ptr.count ?? 25) * 6 : 60;
  const leftAt = useRef<number | null>(null);
  const awayMin = useRef(0);
  useEffect(() => {
    const on = () => {
      if (document.hidden) { if (leftAt.current === null) leftAt.current = Date.now(); }
      else if (leftAt.current !== null) { awayMin.current += (Date.now() - leftAt.current) / 60_000; leftAt.current = null; }
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // the flow zone for this set's topic: which list first, and whether the clock is on
  const ft = topicsOfPiece(piece, m.reviews, content ?? undefined)[0] ?? null;
  const zone = ft ? m.adapt.zone(ft) : "new";
  const pace = ft ? m.adapt.pace(ft) : "untimed";
  const sprint = ptr.type === "sprint";
  const links = useMemo(() => {
    const out: { label: string; url: string }[] = [];
    if (Array.isArray(ptr.links)) out.push(...(ptr.links as { label: string; url: string }[]));
    else if (ptr.lists) {
      const order = listOrder(zone, t.plan_week);   // from week 8 the plan recommends the Sub-655 list; a stretch starts easier, an easy zone harder
      const ks = Object.keys(ptr.lists).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      out.push(...ks.map((key) => ({ label: key === "easy" ? "Easier list" : key === "older_og" ? "Older OG questions" : key === "lsat" ? "LSAT questions" : key === "medium" ? "Medium list" : "Mixed difficulty", url: ptr.lists![key] })));
    } else if (ptr.lists_pool) out.push(...ptr.lists_pool.map((l) => ({ label: `${l.topic ?? "mixed"} (${l.qtype === "GT" ? "graphs & tables" : l.qtype})`, url: l.url })));
    else if (ptr.recipe) out.push(...ptr.recipe.filter((r) => r.url).map((r) => ({ label: r.source, url: r.url! })));
    else if (ptr.sections_from) {
      // quant and DI come as lists; the verbal section is CR links and reading passages (below)
      for (const [sec, ls] of Object.entries(ptr.sections_from as Record<string, unknown>)) {
        if (!Array.isArray(ls)) continue;
        out.push(...(ls as { topic: string | null; url: string }[]).slice(0, 3).map((l) => ({ label: `${sec === "di" ? "DI" : sec}: ${l.topic ?? "mixed"}`, url: l.url })));
      }
    } else if (ptr.url) out.push({ label: t.kind === "admin" ? "Open the page" : "Open it", url: ptr.url });
    return out.filter((l) => !d.deadLinks.has(l.url));
  }, [content, t, ptr, d.deadLinks, zone]);

  const printedTPA = t.kind === "di_set" ? ptr.recipe?.find((r) => r.numbers) : undefined;
  const isQuestions = ["cr_set", "gmatclub_set", "di_set"].includes(t.kind) || t.kind === "mock";
  const timed = !!t.timed || t.kind === "mock";

  async function finish(adminAnswer?: "done" | "not now") {
    if (adminAnswer) await record({ type: "admin", piece: piece.id, answer: adminAnswer });
    if (isQuestions && perType) {
      const sum = Object.values(byType).reduce((a, x) => ({ right: a.right + x.right, wrong: a.wrong + x.wrong, unsure: a.unsure + x.unsure }), { right: 0, wrong: 0, unsure: 0 });
      Object.assign(counts, sum);
      await record({ type: "outside", piece: piece.id, ...sum, byType });
    } else if (isQuestions) await record({ type: "outside", piece: piece.id, ...counts });
    const minutes = Math.min(cap, Math.round(awayMin.current));
    if (minutes > 0) await record({ type: "time", minutes, where: bus ? "bus" : "desk", piece: piece.id, source: t.kind });
    // "Not now" never blocks anything: the plan moves on and the card comes back in a week
    await record({ type: "piece.done", piece: piece.id });
    focus.boundary(0, true);
    const total = counts.right + counts.wrong + counts.unsure;
    let note: string | undefined;
    let offer: Logged["offer"];
    const spec = (piece as { spec?: { kind: string; topic: string | null } }).spec;
    if (spec?.kind === "topup" && spec.topic && total) {
      const acc = counts.right / total;
      if (acc >= 0.7) note = "Back on track.";
      // still under 60%: one more, refresher first; after two with no change it rests for 10 days
      else if (acc < 0.6 && m.adapt.history(m.weekStart).count(spec.topic) < 2) {
        offer = { id: `topup:again:${piece.id}`, topic: spec.topic, section: piece.section, wrong: counts.wrong + counts.unsure, total, cause: "concept", line: "" };
      } else if (acc < 0.6) note = "This one rests for now. It's at the top of What to work on, back in 10 days.";
    }
    if (spec?.kind === "check" && spec.topic && total) {
      const acc = counts.right / total;
      if (acc >= 0.8) note = `${counts.right} of ${total} on new questions. That's stuck.`;
      else if (acc >= 0.6) note = `${counts.right} of ${total} on new questions. Getting there; it comes up again in your practice.`;
      else if (m.adapt.history(m.weekStart).count(spec.topic) < 2) {
        note = `${counts.right} of ${total} on new questions. One more go at it, easier ones first.`;
        offer = { id: `topup:check:${piece.id}`, topic: spec.topic, section: piece.section, wrong: counts.wrong + counts.unsure, total, cause: "concept", line: "" };
      } else note = `${counts.right} of ${total} on new questions. It rests for now and comes back in 10 days.`;
    }
    onDone(isQuestions ? { toLookAgain: counts.wrong + counts.unsure, note, offer } : null);
  }

  const counter = (key: keyof typeof counts, label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="row" style={{ gap: 10 }}>
        <button className="letter" aria-label={`fewer ${label}`} onClick={() => setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] - 1) }))}>−</button>
        <span className="mono" style={{ width: 30, textAlign: "center", fontWeight: 700 }}>{counts[key]}</span>
        <button className="letter" aria-label={`more ${label}`} onClick={() => setCounts((c) => ({ ...c, [key]: c[key] + 1 }))}>+</button>
      </div>
    </div>
  );

  const verbal = timedVerbal(ptr);
  const how = sprint ? "A sprint: 10 questions in 20 minutes, without pausing. A minute in with no way forward: cross out what you can, guess, move on. No blanks. Afterwards, retry the guessed ones with no clock before any solution."
    : ptr.type === "book_chapter" ? `Read chapter ${ptr.chapter}, ${ptr.label}, in your copy of ${ptr.source}, on screen. Its problem set is optional, at a desk.`
    : verbal && t.kind !== "mock" ? `A timed verbal section: ${verbal.cr} CR questions, then ${verbal.passages} reading passages, 45 minutes in all, in one go.`
    : t.kind === "gmatclub_set" || t.kind === "di_set"
    ? timed ? `A timed section: ${(ptr.questions as number | undefined) ?? ptr.count ?? piece.count ?? 21} questions, 45 minutes, in one go. Noteboard, not paper.`
      : `Work down the list: ${ptr.count ?? piece.count ?? 10} you haven't done.${ptr.how ? " " + String(ptr.how) : ""} For each wrong one, click Send to GMAT app in your bookmarks bar.`
    : t.kind === "mock" ? "Three timed sections, 45 minutes each, with the real test's breaks: quant and DI from the lists below, verbal from the CR links and reading passages. Answer every question; blanks cost more than guesses." : "";
  const table = (ptr.types as string[] | undefined)?.includes("TA");

  if (refresher && !refreshed) {
    return (
      <Screen><div className="column" style={{ gap: 12 }}>
        <Back label="← Today · pause" />
        <div className="eyebrow" style={{ color: k.d }}>{k.name} · top-up</div>
        <div style={{ fontSize: 25 }}>First, a short refresher.</div>
        {refresher.type === "video"
          ? <LinkOut url={refresher.url} label={refresher.title || "The plan's video on it"} color={{ c: k.c, d: k.d }} />
          : <button className="btn outline small" onClick={() => go(`/cards?topic=${encodeURIComponent(refresher.topic)}`)}>Your cards on it</button>}
        <div className="spacer" />
        <button className="btn" style={{ background: k.c, borderColor: k.c }} onClick={async () => { await record({ type: "seen", what: `refresher:${piece.id}` }); setRefreshed(true); }}>Done: now the questions</button>
      </div></Screen>
    );
  }

  return (
    <Screen>
      <div className="column" style={{ gap: 12 }}>
        <Back label="← Today · pause" />
        <div className="eyebrow" style={{ color: k.d }}>{k.name} · {whereOf(piece)}</div>
        <div style={{ fontSize: 25, lineHeight: 1.15 }}>{titleOf(piece)}</div>
        {pointerOf(piece, content) && <div className="ptr" style={{ background: k.t }}>{pointerOf(piece, content)}</div>}
        {how && <div className="muted" style={{ fontSize: 16, lineHeight: 1.4 }}>{how}</div>}
        {isQuestions && !timed && ft && zoneLine(zone, topicName(ft)) && <div className="small">{zoneLine(zone, topicName(ft))}</div>}
        {isQuestions && !timed && <div className="small">{paceLine(pace, piece.section)}</div>}
        {timed && !sprint && <div className="small">Pacing: about question 5 with 35 minutes left, 10 with 25, 15 with 15. A minute in with no way forward, guess and move on. Never leave a blank.</div>}
        {sprint && <SprintClock minutes={(ptr.minutes as number | undefined) ?? 20} count={(ptr.count as number | undefined) ?? 10} />}
        {table && <div className="small">Table questions: find the column the question is about before reading any rows.</div>}

        {verbal && <VerbalMaterial piece={piece} cr={verbal.cr} passages={verbal.passages} />}

        {printedTPA?.numbers && !gridDone && (
          <div className="box">
            <div style={{ fontSize: 18 }}>First, the printed two-part questions: {printedTPA.source}, {printedTPA.numbers[0]}–{printedTPA.numbers[1]}.</div>
            <BookGrid piece={piece} numbers={printedTPA.numbers} bookId={printedTPA.source.startsWith("DI Review") ? "dir" : "og"} embedded onSubmitted={() => setGridDone(true)} />
          </div>
        )}

        {links.length > 0 && (
          <div className="row wrap" style={{ gap: 8 }}>
            {links.map((l, i) => (
              <LinkOut key={i} url={l.url} label={l.label} color={{ c: k.c, d: k.d }}
                fallback={() => {
                  if (/youtu/.test(l.url) || t.kind === "article" || t.kind === "test_prep" || t.kind === "admin") return { label: "Mark it done and move on", run: () => void finish() };
                  const other = content ? otherList(content, t, l.url, d) : null;
                  return other ? { label: "Open the other list", run: () => window.open(other, "_blank", "noopener") } : null;
                }} />
            ))}
          </div>
        )}

        {isQuestions && (
          <div className="box">
            <div className="small">When you're back</div>
            {perType ? diTypes.map((ty) => (
              <div key={ty} style={{ display: "flex", flexDirection: "column" }}>
                <div className="eyebrow" style={{ marginTop: 6 }}>{DI_TYPE_OF[ty] ?? ty}</div>
                {(["right", "wrong", "unsure"] as const).map((key) => (
                  <div className="field" key={key}>
                    <span>{key === "unsure" ? "Not sure" : key[0].toUpperCase() + key.slice(1)}</span>
                    <div className="row" style={{ gap: 10 }}>
                      <button className="letter" aria-label={`fewer ${ty} ${key}`} onClick={() => setByType((b) => ({ ...b, [ty]: { ...b[ty], [key]: Math.max(0, b[ty][key] - 1) } }))}>−</button>
                      <span className="mono" style={{ width: 30, textAlign: "center", fontWeight: 700 }}>{byType[ty][key]}</span>
                      <button className="letter" aria-label={`more ${ty} ${key}`} onClick={() => setByType((b) => ({ ...b, [ty]: { ...b[ty], [key]: b[ty][key] + 1 } }))}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            )) : <>{counter("right", "Right")}{counter("wrong", "Wrong")}{counter("unsure", sprint ? "Guessed" : "Not sure")}</>}
            {(t.kind === "gmatclub_set" || t.kind === "di_set") && <PasteShare piece={piece} />}
          </div>
        )}

        <div className="spacer" />
        {t.kind === "admin" ? (
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={() => void finish("done")}>Done</button>
            <button className="btn ghost" onClick={() => void finish("not now")}>Not now</button>
          </div>
        ) : (
          <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={!!printedTPA?.numbers && !gridDone}
            onClick={() => void finish()}>{isQuestions ? "Save it" : "Done"}</button>
        )}
      </div>
    </Screen>
  );
}

/**
 * The sprint clock: 20 minutes for 10 questions, a tap per question. It says whether you're on pace
 * (2 minutes a question) and, when you're behind, what to do about it. Nothing is recorded but the
 * counters you fill in after.
 */
function SprintClock({ minutes, count }: { minutes: number; count: number }) {
  const [start, setStart] = useState<number | null>(null);
  const [q, setQ] = useState(1);
  const [, tick] = useState(0);
  useEffect(() => { if (start === null) return; const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, [start]);
  if (start === null) return <button className="btn outline" onClick={() => setStart(Date.now())}>Start the {minutes}-minute clock</button>;
  const left = Math.max(0, minutes * 60 - Math.floor((Date.now() - start) / 1000));
  const per = (minutes * 60) / count;
  const shouldHave = minutes * 60 - (q - 1) * per;            // time that ought to be left at this question
  const behind = left < shouldHave - per / 2;
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="box" style={{ gap: 8, alignItems: "flex-start" }}>
      <div className="row" style={{ gap: 18, alignItems: "baseline" }}>
        <span style={{ fontSize: 40, fontVariantNumeric: "tabular-nums" }}>{mmss}</span>
        <span style={{ fontSize: 18 }}>Question {Math.min(q, count)} of {count}</span>
      </div>
      <div className="small">{left === 0 ? "Time. Answer anything left with a guess: no blanks." : q > count ? "All ten done." : behind ? "Behind pace: guess the next one you can't see into within 30 seconds." : "On pace."}</div>
      {left > 0 && q <= count && <button className="btn small outline" onClick={() => setQ((x) => x + 1)}>Next question</button>}
    </div>
  );
}

/** A timed verbal section (and the verbal part of the stand-in mock): CR questions and reading passages. */
function timedVerbal(ptr: Piece["task"]["pointer"]): { cr: number; passages: number } | null {
  const v = (ptr.sections_from as Record<string, unknown> | undefined)?.verbal;
  if (ptr.cr && ptr.rc) return { cr: (ptr.cr as { questions?: number }).questions ?? 13, passages: (ptr.rc as { passages?: number }).passages ?? 3 };
  if (v && !Array.isArray(v)) return { cr: 13, passages: 3 };
  return null;
}

/**
 * The CR questions come from the last reserve CR set not done yet (rides take reserve sets from the
 * front, so these never clash); the passages from a reading set the plan doesn't use, in the reader.
 */
function VerbalMaterial({ piece, cr, passages }: { piece: Piece; cr: number; passages: number }) {
  const { content, d, today } = useApp();
  if (!content) return null;
  const set = [...content.cr_bank.reserve_sets].reverse().find((s) => !d.done.has(`x:reserve:${s.id}#0`));
  const used = new Set([...content.plan.tasks.filter((x) => x.kind === "rc_section").map((x) => x.pointer.section),
    ...[...d.extras.values()].filter((x) => x.open.type === "rc").map((x) => (x.open as { section: string }).section)]);
  const id = `timedrc:${piece.id}`;
  const mine = d.extras.get(id);
  const section = mine?.open.type === "rc" ? mine.open.section : content.rc_bank.sections.find((s) => !used.has(s.id))?.id;
  const openPassages = async () => {
    if (!section) return;
    if (!mine) await record({ type: "extra.added", extra: { id, kind: "timed", week: weekStartOf(today), section: "rc", topic: "rc", title: `${passages} reading passages, timed`, minutes: 25, hidden: true,
      open: { type: "rc", section, passages: Array.from({ length: passages }, (_, i) => i) } } });
    go(`/task/${encodeURIComponent(`x:${id}#0`)}`);
  };
  return (
    <div className="box" style={{ gap: 8 }}>
      <div className="eyebrow">Verbal</div>
      {set ? (
        <>
          <div style={{ fontSize: 17 }}>{cr} CR questions, in order (from a reserve set: {set.label}):</div>
          <div className="row wrap" style={{ gap: 6 }}>{set.questions.slice(0, cr).map((q) => <LinkOut key={q.n} url={q.url} label={String(q.n)} />)}</div>
        </>
      ) : <div className="small">Every reserve CR set is done. Use {cr} CR questions from any CR set you haven't seen.</div>}
      {section ? <button className="btn small outline" style={{ alignSelf: "flex-start" }} onClick={() => void openPassages()}>Then {passages} reading passages, in the reader</button>
        : <div className="small">Every reading set is in use; take {passages} passages from the Verbal Review instead.</div>}
    </div>
  );
}

/** If the office browser won't allow the bookmark, paste the question's link here instead. */
function PasteShare({ piece }: { piece: Piece }) {
  const [v, setV] = useState("");
  const [said, setSaid] = useState("");
  const save = async () => {
    const raw = v.trim();
    if (!raw) return;
    const isLink = /^https?:\/\//i.test(raw);
    const topic = piece.task.topic ? listTopic(piece.task.topic) : null;
    // any site (GMAT Club, mba.com, gmatwithcj.com…), or a note of your own when there's no link
    await record({ type: "shared", url: isLink ? raw : "", note: isLink ? undefined : raw.slice(0, 200), set: piece.taskId, topic, section: piece.section as Section });
    setV("");
    setSaid("Saved. It'll come back in a day or two.");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="tiny">Bookmark blocked? Paste a wrong one's link (any site), or write which one it was:</div>
      <div className="row">
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="a link, or e.g. 'Starter Kit DI #14'" onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          style={{ flex: 1, height: 42, border: "1.5px solid var(--line-2)", borderRadius: 9, padding: "0 10px", font: "400 12px var(--mono)" }} />
        <button className="btn small outline" onClick={() => void save()}>Save</button>
      </div>
      {said && <div className="small">{said}</div>}
    </div>
  );
}
