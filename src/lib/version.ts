// The app's version, from package.json (docs/releasing.md). next.config.mjs
// and vitest.config.mts set APP_VERSION from it, so only the version string is
// bundled, not the rest of package.json.
export const APP_VERSION: string = process.env.APP_VERSION || "0.0.0";
