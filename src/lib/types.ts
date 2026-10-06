// Shared types for the form engine, form data and the client stores.

/** A directory or extra form: forum HTML with {{tokens}}. */
export interface FormDef {
  id: string;
  court: string;
  section: string;
  title: string;
  html: string;
}

export type FieldType =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "select"
  | "check"
  | "spoiler"
  | "image"
  | "url"
  | "list"
  | "paras";

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
  docket?: boolean;
  server?: "gtaw" | "freestyle";
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
