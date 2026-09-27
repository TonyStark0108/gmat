import { lazy, Suspense, useEffect } from "react";
import { go, useRoute } from "./app/router";
import { useApp } from "./app/store";
import { record } from "./data/db";
import { DayOne, LoadContent, Setup, dayOnePassed } from "./ui/FirstRun";
import { Home } from "./ui/Home";
import { SettingsScreen } from "./ui/Settings";
import { TaskRunner } from "./ui/tasks/TaskRunner";
import { Week } from "./ui/Week";

const TimeMachine = import.meta.env.DEV ? lazy(() => import("./ui/TimeMachine").then((m) => ({ default: m.TimeMachine }))) : null;

export function App() {
  const { path, params } = useRoute();
  const { contentState, d, bus } = useApp();

  // The taskbar's "Bus ride" shortcut opens #/?bus=1.
  useEffect(() => {
    if (params.get("bus") === "1") {
      if (!bus) void record({ type: "bus", on: true });
      go("/");
    }
  }, [params, bus]);

  if (path === "/dev" && TimeMachine) return <Suspense fallback={null}><TimeMachine /></Suspense>;
  if (path === "/dayone") return <DayOne fromSettings />;
  if (!dayOnePassed(d)) return <DayOne />;
  if (contentState === "loading") return null;
  if (contentState === "missing") return <LoadContent />;
  if (!d.setupDone) return <Setup />;
  if (path.startsWith("/task/")) return <TaskRunner key={path} pieceId={decodeURIComponent(path.slice(6))} />;
  if (path === "/week") return <Week />;
  if (path === "/settings") return <SettingsScreen />;
  return <Home />;
}
