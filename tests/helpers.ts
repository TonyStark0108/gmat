import fs from "node:fs";
import path from "node:path";
import type { Content, Kind, Section, Task } from "../src/core/content";
import { DEFAULT_SETTINGS, type Settings } from "../src/core/settings";

let n = 0;
export function task(p: Partial<Task> & { section: Section; kind: Kind; plan_week?: number }): Task {
  n++;
  const deskKinds: Kind[] = ["og_set", "drill", "gmatclub_set", "di_set", "mock"];
  const needsDesk = p.needs_desk ?? (deskKinds.includes(p.kind) || ((p.section === "quant" || p.section === "di") && p.kind !== "video"));
  return {
    id: p.id ?? `t${n}`,
    plan_week: p.plan_week ?? 1,
    section: p.section,
    kind: p.kind,
    title: p.title ?? `${p.kind} ${n}`,
    optional: p.optional ?? "core",
    est_minutes: p.est_minutes ?? 50,
    review_minutes: p.review_minutes ?? 0,
    needs_desk: needsDesk,
    bus_ok: p.bus_ok ?? !needsDesk,
    offline_ok: p.offline_ok ?? false,
    break_points: p.break_points ?? null,
    depends_on: p.depends_on ?? [],
    pointer: p.pointer ?? { type: "x" },
    target: null,
    benchmark_week: p.plan_week ?? 1,
    alternatives: [],
    bus_switch: p.bus_switch,
    timed: p.timed,
  };
}

export const settings = (patch: Partial<Settings> = {}): Settings => ({ ...structuredClone(DEFAULT_SETTINGS), ...patch });

/** The real content file, if the importer has been run on this machine. */
export function realContent(): Content | null {
  const f = path.resolve(__dirname, "../data/gmat-content-v1.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf-8")) as Content) : null;
}
