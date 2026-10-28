// The Court Filings program's public entry (LP-121): the only path the rest of the app imports it by.
// The shell passes the open form's requests and tools through these types (shell/program.ts).
// Its own styles (LP-110), loaded with its code.
import "./filings.css";
export { default } from "./CourtFilingsProgram";
export type { DocketRequest, DraftRequest, FormTools } from "./FormView";
