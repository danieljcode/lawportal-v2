// New client intake (LP-19): one form that captures a new client's details and
// opens the case in the Case File, so nothing is typed twice. Pure: building
// the case and its notes from an intake; IntakeView saves it.

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
