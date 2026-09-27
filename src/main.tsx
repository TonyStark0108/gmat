import "@fontsource/patrick-hand/400.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { AppProvider } from "./app/store";
import { setClockOffset } from "./core/clock";
import { Boundary } from "./ui/Boundary";
import { FocusProvider } from "./ui/focus";

if (import.meta.env.DEV) {
  const off = Number(localStorage.getItem("gmat-dev-offset") ?? 0);
  if (off) setClockOffset(off);
}

// New versions install in the background and take over on the next launch.
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <FocusProvider>
        <Boundary>
          <App />
        </Boundary>
      </FocusProvider>
    </AppProvider>
  </StrictMode>,
);
