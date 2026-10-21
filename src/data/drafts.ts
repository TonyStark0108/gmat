// Claude drafts the cards for reading mistakes: the app holds those questions in full, so the card can
// name the actual trap. (For book and GMAT Club questions the app has no question text, so their card
// points you back to the question instead.) It uses your key and counts toward the tutor's monthly cap.
// The answers are already shown by then: a card is drafted after the review's answers step.

import Anthropic from "@anthropic-ai/sdk";
import type { Model } from "../core/model";
import type { Item } from "../core/review";
import { costOf, overCap } from "../core/tutor/cost";
import { TUTOR_MODEL } from "../core/tutor/prompt";
import { record } from "./db";
import { tutorPrefs } from "./tutorPrefs";

const SYSTEM = `You write flashcards for a GMAT Focus student, one per reading-comprehension mistake. Each card is about the reasoning, never the passage's content for its own sake, and never a practice question.
front: a short prompt (under 20 words) that names the question type and the situation, so the student recalls the principle. No answer letters.
back: at most two plain sentences: why the right answer is right and the trap in the choice they picked. No answer letters.
Plain words, no technique names.`;

const SCHEMA = {
  type: "object",
  properties: { cards: { type: "array", items: { type: "object", properties: { id: { type: "string" }, front: { type: "string" }, back: { type: "string" } }, required: ["id", "front", "back"], additionalProperties: false } } },
  required: ["cards"], additionalProperties: false,
};

/** Drafts cards for up to eight reading mistakes. Returns how many were drafted (0 without a key or signal). */
export async function draftCards(m: Model, items: Item[], fetchImpl?: typeof fetch): Promise<number> {
  const prefs = await tutorPrefs();
  if (!prefs.key || overCap(m.d.tutorSpend, m.today, prefs.cap)) return 0;
  const passages = m.content.rc_bank.sections.flatMap((s) => s.passages);
  const list = items.filter((it) => it.source === "rc" && it.key && !m.d.drafts.has(it.id)).slice(0, 8).map((it) => {
    const p = passages.find((x) => x.id === it.passageId);
    const q = p?.questions.find((x) => x.id === it.q);
    if (!p || !q) return null;
    return { id: it.id, question_type: it.rcType, passage: p.paragraphs.join("\n"), question: q.stem, choices: q.choices,
      right: { letter: it.key, text: q.choices[it.key as string] }, chosen: { letter: it.first, text: it.first ? q.choices[it.first as string] : null }, tag: it.tag ?? null };
  }).filter(Boolean);
  if (!list.length) return 0;
  const client = new Anthropic({ apiKey: prefs.key, dangerouslyAllowBrowser: true, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  try {
    const msg = await client.messages.create({
      model: TUTOR_MODEL, max_tokens: 4000, system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: JSON.stringify(list) }],
    });
    await record({ type: "tutor.usage", thread: "drafts", model: msg.model, ...costOf(msg.usage) });
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const out = (JSON.parse(text) as { cards: { id: string; front: string; back: string }[] }).cards ?? [];
    let n = 0;
    for (const c of out) {
      if (!list.some((x) => x!.id === c.id) || !c.front?.trim() || !c.back?.trim()) continue;
      await record({ type: "card.drafted", item: c.id, front: c.front.trim().slice(0, 200), back: c.back.trim().slice(0, 400) });
      n++;
    }
    return n;
  } catch {
    return 0;      // no signal, a busy moment, a bad key: the plain card stays
  }
}
