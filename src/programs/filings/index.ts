// The Court Filings program's public entry (LP-121): the only path the rest of the app imports it by.
// The shell passes the open form's requests and tools through these types (shell/program.ts).
export { default } from "./CourtFilingsProgram";
export type { DocketRequest, DraftRequest, FormTools } from "./FormView";
