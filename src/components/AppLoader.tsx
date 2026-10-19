"use client";

// The app reads localStorage on its first render, so it only renders in the
// browser (design D4): no hydration mismatches, same boot as the reference.
import dynamic from "next/dynamic";
import ErrorBoundary from "./ErrorBoundary";

const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => <p className="booting">Loading…</p>,
});

export default function AppLoader() {
  // The last line of defence (LP-88): each panel inside App has its own boundary too.
  return (
    <ErrorBoundary where="the app" variant="app">
      <App />
    </ErrorBoundary>
  );
}
