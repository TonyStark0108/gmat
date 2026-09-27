import { useEffect, useState } from "react";

// Hash routes, so the app works from any folder on GitHub Pages and offline.
export function useRoute(): { path: string; params: URLSearchParams } {
  const read = () => {
    const h = window.location.hash.replace(/^#/, "") || "/";
    const [path, q] = h.split("?");
    return { path: path || "/", params: new URLSearchParams(q ?? "") };
  };
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}

export function go(path: string) {
  window.location.hash = path;
}
