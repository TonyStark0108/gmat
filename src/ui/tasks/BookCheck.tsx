// Making sure the book and the PDF agree (spec: PDF plus the printed book). The first time a section
// of the printed OG comes up: the edition on the cover, where its first question is in your book, and
// a spot check of three answers against your book's key. If they don't agree, that section is marked
// against your book's key instead. Nothing wrong is ever locked in.

import { useState } from "react";
import { useApp } from "../../app/store";
import type { BookId } from "../../core/content";
import type { Derived } from "../../core/state";
import { record } from "../../data/db";
import { Back, Screen } from "../bits";
import { setSetting } from "../Settings";

const QTYPE_NAME: Record<string, string> = { PS: "problem solving", DS: "data sufficiency", TPA: "two-part", RC: "reading", CR: "critical reasoning" };

/** Does this section of the printed OG still need its one-time check? A "no" in check mode sends it back. */
export function needsBookCheck(d: Derived, book: BookId, qtype: string): boolean {
  if (book !== "og") return false;
  const scope = `${book}:${qtype}`;
  const cs = d.bookChecks.filter((c) => c.scope === scope);
  const lastSpot = cs.filter((c) => c.what === "spot").pop();
  if (!lastSpot) return true;
  if (!lastSpot.ok) return false;                                // already marking against the book
  const after = cs.filter((c) => c.what === "checkmode" && c.ts > lastSpot.ts);
  return after.some((c) => !c.ok);
}

/** Check mode: the first two book sets of a section ask whether the book's key agrees. Two in a row and it stops. */
export function needsCheckMode(d: Derived, book: BookId, qtype: string): boolean {
  if (book !== "og") return false;
  const scope = `${book}:${qtype}`;
  const cs = d.bookChecks.filter((c) => c.scope === scope);
  const lastSpot = cs.filter((c) => c.what === "spot").pop();
  if (!lastSpot?.ok) return false;
  const after = cs.filter((c) => c.what === "checkmode" && c.ts > lastSpot.ts);
  return !(after.length >= 2 && after.slice(-2).every((c) => c.ok));
}

export function BookCheck({ book, qtype, first, onDone }: { book: BookId; qtype: string; first: number; onDone: () => void }) {
  const { content, d } = useApp();
  const scope = `${book}:${qtype}`;
  const qs = (content?.book_keys.books[book]?.questions ?? []).filter((q) => q.section === qtype && typeof q.answer === "string");
  const picks = qs.length ? [qs[Math.floor(qs.length * 0.15)], qs[Math.floor(qs.length * 0.5)], qs[Math.floor(qs.length * 0.85)]] : [];
  const editionKnown = d.seen.has("edition");
  const [step, setStep] = useState<"edition" | "page" | "spot">(editionKnown ? "page" : "edition");
  const [page, setPage] = useState(String(qs.find((q) => q.n === first)?.page ?? ""));
  const [answers, setAnswers] = useState<boolean[]>([]);
  const guess = qs.find((q) => q.n === first)?.page ?? null;

  if (step === "edition") {
    return (
      <Screen><div className="column">
        <Back />
        <div className="eyebrow">Once, before the first book set</div>
        <div className="title">Which edition is printed on your OG's cover?</div>
        <div className="row wrap">
          {["2025–2026", "2024–2025"].map((e) => (
            <button key={e} className="btn outline" style={{ flex: 1 }} onClick={async () => {
              await setSetting({ bookEdition: e });
              await record({ type: "seen", what: "edition" });
              setStep("page");
            }}>{e}</button>
          ))}
        </div>
        <div className="small">The answer letters come from the 2025–2026 edition. If your book is a different one, the questions differ, so you'll mark book sets against your own book's key.</div>
      </div></Screen>
    );
  }
  if (step === "page") {
    return (
      <Screen><div className="column">
        <Back />
        <div className="eyebrow">Once per section · {QTYPE_NAME[qtype] ?? qtype}</div>
        <div className="title">In your book, question {first} is on page…</div>
        <input autoFocus inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))}
          style={{ height: 52, width: 140, border: "1.5px solid var(--line-2)", borderRadius: 10, padding: "0 12px", font: "400 20px var(--mono)" }} />
        <div className="small">{guess ? `The PDF says page ${guess}. If yours matches, just carry on.` : ""} The app works out the rest of the section from this.</div>
        <div className="spacer" />
        <button className="btn" disabled={!page} onClick={async () => {
          await record({ type: "book.check", scope, what: "page", ok: true, n: first, page: Number(page) });
          setStep("spot");
        }}>Next</button>
      </div></Screen>
    );
  }
  const i = answers.length;
  const q = picks[i];
  if (!q) {
    const ok = answers.every(Boolean);
    return (
      <Screen><div className="column">
        <div className="eyebrow">Spot check · {QTYPE_NAME[qtype] ?? qtype}</div>
        <div className="title">{ok ? "Your book and the answer key agree." : "Your book's key and the PDF don't agree here."}</div>
        <div className="muted" style={{ fontSize: 17 }}>{ok ? "Sets from this section are marked for you." : "So this section's sets are marked against your book's key: at each review you type its letters in one line."}</div>
        <div className="spacer" />
        <button className="btn" autoFocus onClick={async () => { await record({ type: "book.check", scope, what: "spot", ok }); onDone(); }}>Start the set</button>
      </div></Screen>
    );
  }
  return (
    <Screen><div className="column">
      <div className="eyebrow">Spot check · {i + 1} of 3</div>
      <div className="title">Open your book's answer key: is question {q.n} answer {String(q.answer)}?</div>
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => setAnswers((a) => [...a, true])}>Yes</button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => setAnswers((a) => [...a, false])}>No</button>
      </div>
    </div></Screen>
  );
}
