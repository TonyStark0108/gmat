// Replies shaped exactly like Claude's streaming API (server-sent events), for tests that must not
// call the real service.

type Ev = Record<string, unknown>;

const start = (id: string): Ev => ({ type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 } } });
const end = (stop: string): Ev[] => [
  { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 180 } },
  { type: "message_stop" },
];

export function textReply(text: string, id = "msg_text"): Ev[] {
  const parts = text.match(/.{1,24}/gs) ?? [""];
  return [start(id), { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...parts.map((p) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } })),
    { type: "content_block_stop", index: 0 }, ...end("end_turn")];
}

export function toolReply(name: string, input: unknown, lead = "Let me add that.", id = "msg_tool", toolId = "toolu_1"): Ev[] {
  return [start(id),
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: lead } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: toolId, name, input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } },
    { type: "content_block_stop", index: 1 }, ...end("tool_use")];
}

export function sse(events: Ev[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}
