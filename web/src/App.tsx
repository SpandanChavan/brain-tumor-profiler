import { lazy, Suspense } from "react";
import { useStore } from "./store";
import Landing from "./components/Landing";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import AboutModel from "./components/AboutModel";
import PrivacyPage from "./components/PrivacyPage";
import { useRouteSync } from "./lib/router";

// The analysis screens pull in NiiVue, ONNX Runtime and charts (~2 MB): load them only when needed,
// so the landing page stays light.
const StartScreen = lazy(() => import("./components/StartScreen"));
const Processing = lazy(() => import("./components/Processing"));
const Workspace = lazy(() => import("./components/Workspace"));

function Loading() {
  return <p className="eyebrow mx-auto max-w-[1100px] px-[5vw] py-24" role="status">Loading…</p>;
}

export default function App() {
  useRouteSync();
  const { page, progress, result } = useStore();
  if (page === "home") return <Landing />;

  const inWorkspace = page === "analyze" && !progress && !!result;
  return (
    <div className={`flex min-h-full flex-col ${inWorkspace ? "bg-paper-2" : "bg-paper"}`}>
      <a href="#main" className="sr-only left-4 top-4 z-50 rounded-full bg-ink px-4 py-2 text-sm text-paper focus:not-sr-only focus:fixed">Skip to content</a>
      <Nav />
      <div role="note" className="mx-auto -mt-1 mb-2 w-full max-w-[1400px] px-[4vw] text-center text-[12px] text-ink-3">
        <b className="font-medium text-ink-2">Research demo · not a medical device.</b> Don’t upload real patient data to the server. Every result is an AI suggestion that needs clinical review.
      </div>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {page === "about" && <AboutModel />}
        {page === "privacy" && <PrivacyPage />}
        {page === "analyze" && (
          <Suspense fallback={<Loading />}>
            {progress ? <Processing /> : result ? <Workspace /> : <StartScreen />}
          </Suspense>
        )}
      </main>
      {!inWorkspace && <Footer />}
    </div>
  );
}
