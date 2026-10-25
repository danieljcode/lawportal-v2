// Before each test file (vitest.config.mts). Programs load lazily (LP-122): in the DOM suites, load
// them all first, as the app's idle preload does, so tests can render App and its programs in one go.
// tests/lazyPrograms.test.tsx checks the lazy path itself with a fresh registry.
if (typeof document !== "undefined") {
  const { PROGRAMS } = await import("@/shell/registry");
  await Promise.all(PROGRAMS.map((p) => p.load()));
}

export {}; // a module, for the top-level await
