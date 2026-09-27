import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { allEvents, db, makeBackup, record, restoreBackup } from "../src/data/db";

describe("test 12 · backup and restore", () => {
  it("a round trip into a fresh profile loses nothing", async () => {
    await record({ type: "setup.done" });
    await record({ type: "answer", piece: "w01-quant-09#0", q: 1, value: "B", unsure: false, sinceStartMs: 1000 });
    await record({ type: "answer", piece: "w01-quant-09#0", q: 2, value: "C", unsure: true, sinceStartMs: 2000 });
    await record({ type: "piece.done", piece: "w01-quant-09#0" });
    await record({ type: "time", minutes: 31, where: "desk", source: "book set" });
    const before = await allEvents();
    const backup = JSON.parse(JSON.stringify(await makeBackup()));   // as if saved to a file and read back

    await db.events.clear();                                        // a fresh browser profile
    expect(await allEvents()).toHaveLength(0);
    const r = await restoreBackup(backup);
    expect(r.added).toBe(before.length);
    expect(await allEvents()).toEqual(before);

    // restoring the same file again adds nothing and changes nothing
    expect((await restoreBackup(backup)).added).toBe(0);
    expect(await allEvents()).toEqual(before);
  });

  it("every answer is written the moment it's entered", async () => {
    const n = (await allEvents()).length;
    await record({ type: "answer", piece: "p", q: 3, value: "A", unsure: false, sinceStartMs: 1 });
    expect((await allEvents()).length).toBe(n + 1);
  });

  it("refuses a file that isn't a backup", async () => {
    await expect(restoreBackup({ hello: 1 })).rejects.toThrow("isn't a GMAT backup");
  });
});
