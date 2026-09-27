import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONTENT = path.resolve(process.cwd(), "data/gmat-content-v1.json");
export const hasContent = () => fs.existsSync(CONTENT);
export const OUT = path.resolve(process.cwd(), "e2e-report");
export const at = (local: string) => new Date(`${local}+05:30`);   // times as on a laptop in India

/** A browser profile on disk, so closing and reopening the browser behaves like the real thing. */
export function profileDir(name: string) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `gmat-e2e-${name}-`));
  return d;
}

export async function launch(dir: string, when: Date, opts: { offline?: boolean } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await chromium.launchPersistentContext(dir, {
    viewport: { width: 1366, height: 768 }, timezoneId: "Asia/Kolkata", locale: "en-IN", baseURL: "http://localhost:4175/",
    acceptDownloads: true,
  });
  await ctx.clock.install({ time: when });
  // The backup folder picker is a Windows dialog a test can't click, so it hands back the browser's
  // private folder instead: same writing, reading and tidying code, no dialog.
  await ctx.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker =
      () => navigator.storage.getDirectory();
  });
  // Videos need YouTube; the tests run as if there were no signal for them.
  await ctx.route(/youtube\.com|ytimg\.com|googlevideo\.com/, (r) => r.abort());
  if (opts.offline) await ctx.setOffline(true);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}

/** Wait until a screen has drawn and its keyboard shortcuts are listening. */
export async function settled(page: Page) {
  await page.locator(".screen").first().waitFor();
  await page.waitForTimeout(400);
}

export async function jumpTo(ctx: BrowserContext, page: Page, when: Date) {
  await ctx.clock.setSystemTime(when);
  await page.reload();
  await settled(page);
}

// ---- the photo album of a run
const shots: { file: string; caption: string; step: string }[] = [];
let step = "";
export const setStep = (s: string) => { step = s; };
export async function snap(page: Page, caption: string) {
  fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
  const file = `shots/${String(shots.length + 1).padStart(2, "0")}.png`;
  await page.waitForTimeout(450);   // let the screen's rise animation finish
  await page.screenshot({ path: path.join(OUT, file) });
  shots.push({ file, caption, step });
}

export function writeAlbum(title: string, ok: boolean, notes: string[]) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:16px system-ui;background:#ebe8e2;color:#23211e;max-width:1100px;margin:0 auto;padding:24px}
h1{font-weight:600}h2{margin-top:36px}figure{margin:14px 0 26px;background:#fff;border:1.5px solid #d3cdc2;border-radius:12px;padding:12px}
img{width:100%;border-radius:8px;border:1px solid #ece7dd}figcaption{margin:8px 2px 0;font-size:17px}.ok{color:#2e6b4f}.note{color:#4a4540}</style>
<h1>${esc(title)}</h1><p class="${ok ? "ok" : ""}">${ok ? "Every step passed." : "Some steps didn't pass: see the notes."}</p>
${notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}`;
  let last = "";
  for (const s of shots) {
    if (s.step !== last) { html += `<h2>${esc(s.step)}</h2>`; last = s.step; }
    const data = fs.readFileSync(path.join(OUT, s.file)).toString("base64");   // one self-contained file
    html += `<figure><img src="data:image/png;base64,${data}" loading="lazy"><figcaption>${esc(s.caption)}</figcaption></figure>`;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "album.html"), html);
}

export async function eventCount(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open("gmat");
    r.onsuccess = () => { const q = r.result.transaction("events").objectStore("events").count(); q.onsuccess = () => res(q.result); };
  }));
}

export const card = (page: Page) => page.locator(".card").first();
export async function expectCardTitle(page: Page, re: RegExp | string) {
  await expect(card(page).locator(".t")).toHaveText(re);
}
