// Shared types for the form engine, form data and the client stores.

import type { CustodyEntry } from "./custody";

/** A directory or extra form: forum HTML with {{tokens}}. */
export interface FormDef {
  id: string;
  court: string;
  section: string;
  title: string;
  /** Labels that must be filled before copying (LP-87); the copy buttons warn if any are empty. */
  required?: string[];
  html: string;
}

/** A form without its template (src/data/form-index.ts): enough to route to it and list it. */
export type FormInfo = Pick<FormDef, "id" | "court" | "section" | "title">;

export type FieldType =
  "text" | "textarea" | "date" | "number" | "select" | "check" | "spoiler" | "image" | "url" | "list" | "paras";

/** One parsed `{{Label[=prefill][@char][:type[:opts]][>tag][|fallback]}}` token. */
export interface Field {
  label: string;
  type: FieldType;
  options: string[];
  /** Raw HTML shown when the value is empty. */
  fallback: string;
  prefill?: string;
  /** Character key (`name`, `title`, `bar`…) the field fills from. */
  character?: string;
  /** Tag a filled-in value is wrapped in (`>li`). */
  wrap?: string;
  /** Number of line-breaking tags before the token; groups fields on one template line. */
  line: number;
  /** check fields: the option text after the token. */
  text?: string;
  /** check fields: indented with non-breaking spaces (a sub-option). */
  indent?: boolean;
}

export interface TextNode {
  kind: "text";
  html: string;
}
export interface FieldNode {
  kind: "field";
  field: Field;
}
export interface PosNode {
  kind: "pos";
  what: string;
  /** `$roman after Name`: the block's default count, used when it has no items yet. */
  defaultCount?: number;
}
export interface SectionNode {
  kind: "section";
  name: string;
}
export interface BlockNode {
  kind: "block";
  name: string;
  count: number;
  children: Node[];
}
export interface CondNode {
  kind: "cond";
  name: string;
  /** Default state when `values["?Name"]` is undefined (`|off` → false). */
  on: boolean;
  children: Node[];
}
export type Node = TextNode | FieldNode | PosNode | SectionNode | BlockNode | CondNode;

/** The compiled template: an unnamed root block. */
export type Tree = BlockNode;

export interface SectionEntry {
  section: string;
}
export interface FieldEntry {
  field: Field;
}
export interface BlockEntry {
  block: BlockNode;
  fields: Entry[];
}
export interface CondEntry {
  cond: CondNode;
  fields: Entry[];
}
export type Entry = SectionEntry | FieldEntry | BlockEntry | CondEntry;

export type Scalar = string | boolean;

/** Form values: `"Label"` → value, `"#Block"` → items, `"?Cond"` → on/off. */
export interface Values {
  [label: string]: Scalar | Values[] | undefined;
}

export interface Character {
  id: string;
  name: string;
  title?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  address?: string;
  occupation?: string;
  bar?: string;
  email?: string;
  signature?: string;
  notes?: string;
  /** Hourly rate in dollars, as typed (the Ledger, LP-32). */
  rate?: string;
  docket?: boolean;
  /** ISO time of the last change on any device, including its dockets and J.A.P. (sync merges by it). */
  updatedAt?: string;
}

export type DocketStatus = "Open" | "Awaiting arguments" | "Awaiting judgement" | "Closed";

export interface Docket {
  id: string;
  caseNumber: string;
  plaintiff?: string;
  defendant?: string;
  court?: string;
  /** ISO date `YYYY-MM-DD`. */
  filed?: string;
  status: DocketStatus;
  nextEvent?: string;
  /** ISO date `YYYY-MM-DD`. */
  nextDate?: string;
  /** http(s) only. */
  link?: string;
  notes?: string;
  /** ISO timestamp. */
  updated: string;
}

/**
 * A firm-owned case (LP-4): the docket fields, plus who works it. A character's
 * docket is the cases they're lead on or assigned to.
 */
export interface Case extends Docket {
  /** The lead character's id; null when the lead was deleted and the case needs a new one. */
  lead: string | null;
  /** Other characters working the case (never the lead). */
  assigned: string[];
  /** ISO timestamp. */
  created: string;
  /** Deadlines and hearing dates (LP-18), soonest first. */
  deadlines: Deadline[];
  /** The evidence, in exhibit order (LP-12); an exhibit's letter comes from its place. */
  exhibits: Exhibit[];
  /** Next actions (LP-170), in the order added. Absent when there are none. */
  actions?: CaseAction[];
  /** How it ended (LP-92). Counts towards the Firm Record while the case is Closed. */
  outcome?: CaseOutcome;
  /** Hourly rate in dollars for everyone's time on this case, over their own (the Ledger, LP-32). */
  rate?: number;
}

/** A piece of evidence on a case (LP-12). */
export interface Exhibit {
  id: string;
  title: string;
  description?: string;
  /** http(s) only; stored, never fetched. */
  link?: string;
  /** In-game date obtained, YYYY-MM-DD. */
  obtained?: string;
  /** Chain of custody (LP-14), oldest first; only ever added to. Absent when empty. */
  custody?: CustodyEntry[];
}

export type OutcomeResult = "won" | "lost" | "settled" | "dismissed" | "plea" | "withdrawn";

/** How a case ended (LP-92). */
export interface CaseOutcome {
  result: OutcomeResult;
  /** In-game date, YYYY-MM-DD. */
  date: string;
  note?: string;
}

/** A piece of everyday work on a case (LP-170), owned by a character or no one. */
export interface CaseAction {
  id: string;
  title: string;
  /** The character doing it; absent when unassigned. */
  owner?: string;
  /** In-game due date, YYYY-MM-DD (the 1990 calendar). */
  due?: string;
  done?: boolean;
}

/** A dated entry on a case (LP-18): an in-game date, a label and a note. */
export interface Deadline {
  id: string;
  /** In-game date, YYYY-MM-DD (the 1990 calendar). */
  date: string;
  label: string;
  note?: string;
  /** Dealt with: no longer upcoming or overdue. */
  done?: boolean;
}

export type PortfolioLevel = "I" | "II";

/** One J.A.P. line; which keys are used depends on the task's kind. */
export interface PortfolioEntry {
  num?: string;
  caption?: string;
  link?: string;
  date?: string;
  discord?: string;
}

export interface Portfolio {
  level: PortfolioLevel;
  I: Record<string, PortfolioEntry[]>;
  II: Record<string, PortfolioEntry[]>;
  /** ISO timestamp. */
  updated: string;
}
