// Claude drafts the cards for reading mistakes (the app holds those questions in full). Against a
// stand-in service: no key, nothing is sent; with a key, the draft replaces the plain card.

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { buildModel } from "../src/core/model";
import { allEvents, db } from "../src/data/db";
import { draftCards } from "../src/data/drafts";
import { saveTutorKey } from "../src/data/tutorPrefs";
import { fixtureContent, Log } from "./fixture";

const C = fixtureContent();

/** Monday 7 Dec: the reading set, question 1 of passage 1 wrong (B; the answer is A), tagged "out of scope". */
function rcMistake() {
  const log = new Log().at("2026-11-20T10:00", { type: "setup.done" }).at("2026-12-07T18:45", { type: "piece.started", piece: "rc1#0", mode: "bus" });
  ["p1q1", "p1q2", "p1q3", "p2q1", "p2q2", "p2q3"].forEach((q, i) => log.at("2026-12-07T19:00", { type: "answer", piece: "rc1#0", q, value: i === 0 ? "B" : ["A", "B", "C", "D", "E", "A"][i], unsure: false, sinceStartMs: (i + 1) * 60_000 }));
  return log.at("2026-12-07T19:30", { type: "piece.submitted", piece: "rc1#0", wrongOrUnsure: 1, answered: 6 }).at("2026-12-07T19:30", { type: "piece.done", piece: "rc1#0" })
    .at("2026-12-09T19:00", { type: "review.tag", item: "rc1|p1q1", tag: "out of scope" });
}

describe("Claude's drafts of cards for reading mistakes", () => {
  it("without a key nothing is sent; with one, the draft replaces the plain card and its cost is counted", async () => {
    await db.events.clear();
    const m = buildModel(C, rcMistake().events, new Date("2026-12-09T19:05"));
    const it = m.reviews.items.get("rc1|p1q1")!;
    const plain = [...m.sugg.waiting, ...m.sugg.pending].find((s) => s.id === "err:rc1|p1q1")!;
    expect(plain.back).toMatch(/You put B; the answer is A/);

    let calls = 0;
    const bodies: { output_config: { format: { type: string } }; messages: { content: string }[] }[] = [];
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      calls++;
      bodies.push(JSON.parse(String(init.body)));
      const text = JSON.stringify({ cards: [{ id: "rc1|p1q1", front: "Main idea: a choice about a side topic", back: "The passage is about the whole argument; the choice picked a detail it never discusses." }] });
      return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    await saveTutorKey(null);
    expect(await draftCards(m, [it], fakeFetch)).toBe(0);
    expect(calls).toBe(0);

    await saveTutorKey("sk-ant-test");
    expect(await draftCards(m, [it], fakeFetch)).toBe(1);
    expect(bodies[0].output_config.format.type).toBe("json_schema");
    const sent = JSON.parse(bodies[0].messages[0].content);
    expect(sent[0]).toMatchObject({ id: "rc1|p1q1", question: "Q1?", right: { letter: "A" }, chosen: { letter: "B" }, tag: "out of scope" });

    const evs = await allEvents();
    expect(evs.some((e) => e.type === "tutor.usage" && e.thread === "drafts")).toBe(true);
    const m2 = buildModel(C, [...rcMistake().events, ...evs.filter((e) => e.type === "card.drafted")], new Date("2026-12-09T19:10"));
    const drafted = [...m2.sugg.waiting, ...m2.sugg.pending].find((s) => s.id === "err:rc1|p1q1")!;
    expect(drafted).toMatchObject({ drafted: true, front: "Main idea: a choice about a side topic" });
  });
});
