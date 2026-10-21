// New versions of the app download in the background; this holds the "one is ready" flag and the
// switch that swaps it in. The switch reloads the page, so it waits for a tap (never mid-question).

import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

let ready = false;
const subs = new Set<() => void>();
const set = (v: boolean) => { ready = v; subs.forEach((f) => f()); };

const swap = registerSW({
  immediate: true,
  onNeedRefresh: () => set(true),
  // look for a new version every hour and whenever the app comes back to the front
  onRegisteredSW: (_url, reg) => {
    if (!reg) return;
    const check = () => { if (navigator.onLine) void reg.update().catch(() => undefined); };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  },
});

export const useUpdateReady = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ready);
export const updateNow = () => swap(true);
