import { lazy, Suspense, useEffect } from "react";
import { go, useRoute } from "./app/router";
import { useApp } from "./app/store";
import { record } from "./data/db";
import { CardSession, ManageCards } from "./ui/Cards";
import { DayOne, LoadContent, Setup, dayOnePassed } from "./ui/FirstRun";
import { Home } from "./ui/Home";
import { Life } from "./ui/Life";
import { ErrorsScreen, ProgressScreen } from "./ui/Progress";
import { MixedReviewScreen } from "./ui/review/MixedReview";
import { SetReviewScreen } from "./ui/review/SetReview";
import { SettingsScreen } from "./ui/Settings";
import { ShareIn } from "./ui/Share";
import { TaskRunner } from "./ui/tasks/TaskRunner";
import { QuestionLog } from "./ui/QuestionLog";
import { Week } from "./ui/Week";

// the tutor (and the Claude library) loads only when you open it
const TutorScreen = lazy(() => import("./ui/tutor/Tutor").then((m) => ({ default: m.TutorScreen })));
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
  if (path.startsWith("/review/")) {
    const id = decodeURIComponent(path.slice(8));
    return id.startsWith("mixed:") ? <MixedReviewScreen key={id} id={id} /> : <SetReviewScreen key={id} id={id} />;
  }
  if (path === "/cards") return <CardSession key={params.toString()} topic={params.get("topic") ?? undefined} />;
  if (path === "/cards/manage") return <ManageCards />;
  if (path === "/week") return <Week />;
  if (path === "/progress") return <ProgressScreen />;
  if (path === "/errors") return <ErrorsScreen />;
  if (path === "/log") return <QuestionLog />;
  if (path === "/life") return <Life />;
  if (path === "/share") return <ShareIn params={params} />;
  if (path === "/settings") return <SettingsScreen />;
  if (path === "/tutor") return <Suspense fallback={null}><TutorScreen key={params.toString()} params={params} /></Suspense>;
  return <Home />;
}
