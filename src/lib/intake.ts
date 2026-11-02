// New client intake (LP-19): one form that captures a new client's details and
// opens the case in the Case File, so nothing is typed twice. Pure: building
// the case and its notes from an intake; IntakeView saves it. Onboarding (LP-172)
// adds what travels with an unfinished intake: its conflict check and its choice
// of Rolodex client, kept on this device until the case opens or it's discarded.

import { nameMatch, nameWords, type ConflictMatch } from "./conflicts";
import type { Contact } from "./contacts";
import { DIVISION_COURTS, GENERAL_COURT, APPELLATE_COURT } from "./courts";
import { formatDay } from "./deadlines";
import type { Case } from "./types";

export type ClientSide = "plaintiff" | "defendant";

export interface Matter {
  label: string;
  court: string;
  /** Which side a new client is usually on for this matter. */
  side: ClientSide;
}

export const MATTERS: readonly Matter[] = [
  { label: "Criminal", court: DIVISION_COURTS["CRIMINAL DIVISION"], side: "defendant" },
  { label: "Civil", court: DIVISION_COURTS["CIVIL DIVISION"], side: "plaintiff" },
  { label: "Traffic", court: DIVISION_COURTS["TRAFFIC DIVISION"], side: "defendant" },
  { label: "Small claims", court: DIVISION_COURTS["SMALL CLAIMS DIVISION"], side: "plaintiff" },
  { label: "Appeal", court: APPELLATE_COURT, side: "plaintiff" },
  { label: "Other", court: GENERAL_COURT, side: "plaintiff" },
];

// The summary and the details above it in the case notes must fit the case's MAX_TEXT (LP-151).
export const MAX_SUMMARY = 3000;
export const MAX_DETAIL = 100;

export const SOURCES = ["Referral", "Forum", "Word of mouth", "Returning client", "Walk-in", "Other"] as const;
export const URGENCIES = ["Routine", "Soon", "Urgent"] as const;

export interface Intake {
  clientName: string;
  phone: string;
  address: string;
  /** How they found the firm. */
  source: string;
  matter: string;
  /** The client's side of the case (defaults from the matter). */
  side: ClientSide;
  opposingParty: string;
  summary: string;
  urgency: string;
  /** Optional: the court's number, if there is one yet. */
  caseNumber: string;
  /** The character who'll lead the case. */
  lead: string;
}

export function emptyIntake(lead = ""): Intake {
  return {
    clientName: "",
    phone: "",
    address: "",
    source: "",
    matter: MATTERS[0].label,
    side: MATTERS[0].side,
    opposingParty: "",
    summary: "",
    urgency: URGENCIES[0],
    caseNumber: "",
    lead,
  };
}

export function matterFor(label: string): Matter {
  return MATTERS.find((m) => m.label === label) || MATTERS[MATTERS.length - 1];
}

/** Why the intake can't open a case yet, or null. */
export function intakeProblem(i: Intake): string | null {
  if (!i.clientName.trim()) return "The client needs a name.";
  if (!i.summary.trim()) return "Add a short summary of the issue.";
  return null;
}

/** "PENDING-1", "PENDING-2"…: a stand-in until the court gives the case a number. */
export function pendingNumber(cases: readonly Pick<Case, "caseNumber">[]): string {
  const taken = new Set(cases.map((c) => c.caseNumber.toUpperCase()));
  let n = 1;
  while (taken.has("PENDING-" + n)) n++;
  return "PENDING-" + n;
}

/** The intake as text, for the case notes and the printed client sheet. */
export function intakeNotes(i: Intake, inGameDay: string, leadName?: string): string {
  const line = (label: string, v: string) => (v.trim() ? label + ": " + v.trim() : "");
  const details = [
    "Client intake, " + formatDay(inGameDay),
    line("Client", i.clientName),
    line("Phone", i.phone),
    line("Address", i.address),
    line("Found the firm through", i.source),
    line("Matter", i.matter),
    line("Opposing party", i.opposingParty),
    line("Urgency", i.urgency),
    line("Taken by", leadName || ""),
  ].filter(Boolean);
  return details.join("\n") + (i.summary.trim() ? "\n\n" + i.summary.trim() : "");
}

/** The Case File case an intake opens (lead, parties, court, status Open, the intake in the notes). */
export function intakeToCase(
  i: Intake,
  cases: readonly Pick<Case, "caseNumber">[],
  inGameDay: string,
  leadName?: string,
): Partial<Case> {
  const matter = matterFor(i.matter);
  const client = i.clientName.trim();
  const other = i.opposingParty.trim() || undefined;
  return {
    caseNumber: i.caseNumber.trim() || pendingNumber(cases),
    plaintiff: i.side === "plaintiff" ? client : other,
    defendant: i.side === "defendant" ? client : other,
    court: matter.court,
    status: "Open",
    notes: intakeNotes(i, inGameDay, leadName),
    lead: i.lead || null,
    assigned: [],
  };
}

/* ---------- onboarding (LP-172) ---------- */

export const INTAKE_DRAFT_KEY = "lawapp_intake_draft";

/** The names a conflict check runs on: the client and the other side. */
export function checkNames(i: Pick<Intake, "clientName" | "opposingParty">): string[] {
  return [i.clientName, i.opposingParty].map((n) => n.trim()).filter(Boolean);
}

const namesKey = (names: readonly string[]) => names.map((n) => nameWords(n).join(" ")).join("|");

/** A conflict check run from this intake, and whether its matches were reviewed. */
export interface IntakeCheck {
  names: string[];
  matches: ConflictMatch[];
  reviewed?: boolean;
}

export type CheckState = "unchecked" | "stale" | "clear" | "review" | "reviewed";

export function checkState(i: Intake, check: IntakeCheck | null): CheckState {
  if (!check) return "unchecked";
  if (namesKey(check.names) !== namesKey(checkNames(i))) return "stale";
  if (!check.matches.length) return "clear";
  return check.reviewed ? "reviewed" : "review";
}

/** Which Rolodex contact the case links: a contact's id, or one of these. */
export const ROLODEX_NEW = "new";
export const ROLODEX_NONE = "none";

/** The Rolodex's clients this name might already be, the same name first. */
export function rolodexMatches(name: string, contacts: readonly Contact[]): Contact[] {
  const words = nameWords(name).join(" ");
  if (!words) return [];
  const clients = contacts.filter((c) => c.type === "client");
  return [
    ...clients.filter((c) => nameWords(c.name).join(" ") === words),
    ...clients.filter((c) => nameWords(c.name).join(" ") !== words && nameMatch(name, c.name)),
  ];
}

/**
 * The Rolodex choice before anyone picks: the client with this very name, or a new contact when
 * nobody looks like them. "" when someone only might be them: that's for the user to settle, so a
 * contact is never duplicated without asking.
 */
export function rolodexDefault(name: string, contacts: readonly Contact[]): string {
  const [first] = rolodexMatches(name, contacts);
  if (!first) return ROLODEX_NEW;
  return nameWords(first.name).join(" ") === nameWords(name).join(" ") ? first.id : "";
}

/** An unfinished intake, as saved between visits. */
export interface IntakeDraft {
  intake: Intake;
  check: IntakeCheck | null;
  /** The Rolodex choice made by hand; null follows rolodexDefault. */
  rolodex: string | null;
}

/** A saved draft, or null when there's nothing usable. It's this device's own, but may be old. */
export function cleanIntakeDraft(raw: unknown, lead = ""): IntakeDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.intake || typeof o.intake !== "object") return null;
  const saved = o.intake as Record<string, unknown>;
  const intake = emptyIntake(lead);
  for (const key of Object.keys(intake) as (keyof Intake)[]) {
    const v = saved[key];
    if (typeof v === "string") (intake as unknown as Record<string, string>)[key] = v;
  }
  if (intake.side !== "plaintiff" && intake.side !== "defendant") intake.side = matterFor(intake.matter).side;
  const c = o.check as Partial<IntakeCheck> | null | undefined;
  const check =
    c && Array.isArray(c.names) && Array.isArray(c.matches)
      ? { names: c.names.map(String), matches: c.matches, ...(c.reviewed === true ? { reviewed: true } : {}) }
      : null;
  return { intake, check, rolodex: typeof o.rolodex === "string" ? o.rolodex : null };
}
