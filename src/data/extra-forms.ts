// "Additional Templates" (design D2): our own motion, petition, discovery and
// contract templates, converted from the old hand-written TS templates into the
// same token-HTML grammar as the directory forms (see src/lib/template.ts).
// They go through the same template-safety check (tests/template-safety.test.ts).
import type { FormDef } from "@/lib/types";

const COURT = "Additional Templates";

const TABLE_OPEN =
  '<table align="center" border="0" cellpadding="3" cellspacing="2" style="border-collapse:collapse;border-spacing:0px;font-size:14px">\n<tbody>\n';
const TABLE_CLOSE = "</tbody>\n</table>\n";

const COURT_LINE =
  '<p style="text-align:center"><strong>{{Court|SAN ANDREAS COURT, COUNTY OF LOS SANTOS}}</strong></p>\n';

const CASE_NO = "Case No. {{Case number|__________}}";

function title(text: string): string {
  return `<p style="text-align:center"><strong><span style="font-size:20px">${text}</span></strong></p>\n`;
}

function heading(text: string): string {
  return `<p><strong><u>${text}</u></strong></p>\n`;
}

function spoiler(inner: string): string {
  return (
    '<div class="ipsSpoiler" data-ipsspoiler=""><div class="ipsSpoiler_header"><span>Spoiler</span></div><div class="ipsSpoiler_contents">\n' +
    inner +
    "</div></div>\n"
  );
}

/** Plaintiff v. Defendant caption with the case number beside "v.". */
const ADVERSARY_CAPTION =
  COURT_LINE +
  TABLE_OPEN +
  "<tr>\n<td>{{Plaintiff name|PLAINTIFF NAME}},<br />\nPlaintiff,</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
  `<tr>\n<td style="text-align:center">v.</td>\n<td>)</td>\n<td>${CASE_NO}</td>\n</tr>\n` +
  "<tr>\n<td>{{Defendant name|DEFENDANT NAME}},<br />\nDefendant.</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
  TABLE_CLOSE;

/** The signature block shared by the court filings ("Dated:" uses the docket's Filing date label). */
function signature(role: string): string {
  return (
    "<p>Dated: {{Filing date=today:date:long|__________}}</p>\n" +
    "<p>Respectfully submitted,</p>\n" +
    "<p><strong>{{Name@name|____________________}}</strong><br />\n" +
    "Bar No. {{Bar number@bar|__________}}<br />\n" +
    "{{Firm|FIRM NAME}}<br />\n" +
    `{{Role@title|${role}}}</p>\n`
  );
}

const generalPetition: FormDef = {
  id: "extra-general-petition",
  court: COURT,
  section: "Petitions",
  title: "General Petition",
  html:
    "{{-- Court & Caption}}\n" +
    COURT_LINE +
    TABLE_OPEN +
    `<tr>\n<td>{{Petitioner name@name|PETITIONER NAME}},<br />\nPetitioner,</td>\n<td>)</td>\n<td>${CASE_NO}</td>\n</tr>\n` +
    "{{?Respondent|off}}" +
    '<tr>\n<td style="text-align:center">v.</td>\n<td>)</td>\n<td></td>\n</tr>\n' +
    "<tr>\n<td>{{Respondent name|RESPONDENT NAME}},<br />\nRespondent.</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
    "{{/Respondent}}" +
    TABLE_CLOSE +
    "{{-- Petition}}\n" +
    "<hr />\n" +
    title("{{Petition title|PETITION TITLE}}") +
    "<p>Petitioner {{Petitioner name|PETITIONER NAME}} respectfully petitions this Court as follows:</p>\n" +
    "{{#Allegations|2}}<p><strong>{{$index}}.</strong> {{Allegation:textarea|State the allegation.}}</p>\n{{/Allegations}}" +
    heading("PRAYER FOR RELIEF") +
    "{{Relief requested:paras|<p>WHEREFORE, Petitioner respectfully requests that this Court grant the relief sought herein.</p>}}\n" +
    "{{-- Signature}}\n" +
    "<hr />\n" +
    signature("Petitioner"),
};

const nameChange: FormDef = {
  id: "extra-name-change",
  court: COURT,
  section: "Petitions",
  title: "Petition for Name Change",
  html:
    "{{-- Court & Caption}}\n" +
    COURT_LINE +
    TABLE_OPEN +
    `<tr>\n<td>In re the Name of<br />\n{{Petitioner name@name|PETITIONER NAME}},<br />\nPetitioner.</td>\n<td>)</td>\n<td>${CASE_NO}</td>\n</tr>\n` +
    "{{?Second caption line|off}}" +
    "<tr>\n<td>{{Second line|SECOND CAPTION LINE}}</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
    "{{/Second caption line}}" +
    TABLE_CLOSE +
    "{{-- Name Change}}\n" +
    "<hr />\n" +
    title("PETITION FOR CHANGE OF NAME") +
    "<p>Petitioner respectfully petitions this Court as follows:</p>\n" +
    "<p><strong>1.</strong> Petitioner's current legal name is <strong>{{Current legal name@name|CURRENT NAME}}</strong>.</p>\n" +
    "<p><strong>2.</strong> Petitioner was born on {{Date of birth:date:long|__________}} and resides in {{County of residence|Los Santos County}}.</p>\n" +
    "<p><strong>3.</strong> Petitioner seeks to change their name to <strong>{{Proposed name|PROPOSED NAME}}</strong>.</p>\n" +
    "<p><strong>4.</strong> Petitioner seeks the change for the following reasons:</p>\n" +
    "{{Reason for change:paras|<p>State the reason(s) the name change is sought, one paragraph per reason.</p>}}\n" +
    "<p><strong>5.</strong> This petition is not made for any fraudulent or unlawful purpose, nor to avoid any debt or obligation.</p>\n" +
    heading("PRAYER FOR RELIEF") +
    "<p>WHEREFORE, Petitioner respectfully requests that this Court enter an order changing Petitioner's name from " +
    "<strong>{{Current legal name|CURRENT NAME}}</strong> to <strong>{{Proposed name|PROPOSED NAME}}</strong>, " +
    "and grant such other relief as it deems just and proper.</p>\n" +
    "{{-- Signature}}\n" +
    "<hr />\n" +
    signature("Petitioner"),
};

const generalMotion: FormDef = {
  id: "extra-general-motion",
  court: COURT,
  section: "Motions",
  title: "General Motion",
  html:
    "{{-- Court & Caption}}\n" +
    ADVERSARY_CAPTION +
    "{{-- Motion}}\n" +
    "<hr />\n" +
    title("{{Motion title|MOTION TITLE}}") +
    "<p>{{Introduction:textarea|Movant respectfully moves this Honorable Court for an order granting the relief requested herein, and in support states as follows:}}</p>\n" +
    "{{Grounds:paras|<p>State the factual and legal basis for the motion here.</p>}}\n" +
    "{{Relief requested:paras|<p>WHEREFORE, Movant respectfully requests that this Court grant this Motion and award such further relief as it deems just and proper.</p>}}\n" +
    "{{-- Signature}}\n" +
    "<hr />\n" +
    signature("Attorney for the Defendant") +
    "{{-- Certificate of Service}}\n" +
    spoiler(
      "<p><strong>CERTIFICATE OF SERVICE</strong></p>\n" +
        "<p>I hereby certify that on {{Service date:date:long|__________}}, a true and correct copy of the foregoing was served upon " +
        "{{Served party|all parties of record}} via {{Service method|the Court's electronic filing system}}.</p>\n" +
        "<p>{{Name@name|____________________}}</p>\n",
    ),
};

const interrogatories: FormDef = {
  id: "extra-interrogatories",
  court: COURT,
  section: "Discovery",
  title: "Interrogatories",
  html:
    "{{-- Court & Caption}}\n" +
    ADVERSARY_CAPTION +
    "{{-- Discovery Details}}\n" +
    "<hr />\n" +
    title(
      "{{Propounding party@name|PROPOUNDING PARTY}}'S INTERROGATORIES TO {{Responding party|RESPONDING PARTY}}, SET {{Set number|ONE}}",
    ) +
    "<p><strong>PROPOUNDING PARTY:</strong> {{Propounding party|PROPOUNDING PARTY}}</p>\n" +
    "<p><strong>RESPONDING PARTY:</strong> {{Responding party|RESPONDING PARTY}}</p>\n" +
    "<p><strong>SET NUMBER:</strong> {{Set number|ONE}}</p>\n" +
    "<p>Pursuant to the applicable rules of civil procedure, {{Propounding party|PROPOUNDING PARTY}} requests that " +
    "{{Responding party|RESPONDING PARTY}} answer the following interrogatories separately and fully, in writing and under oath, " +
    "within {{Days to respond:number|30}} days of service.</p>\n" +
    spoiler(
      "<p><strong>Definitions and Instructions</strong></p>\n" +
        "<ol>\n" +
        '<li>"You" and "Your" refer to the responding party and its agents, employees, representatives, and attorneys.</li>\n' +
        '<li>"Document" means any writing or recorded material of any kind, however stored or produced.</li>\n' +
        "<li>If You cannot answer in full, answer to the extent possible and state why the remainder cannot be answered.</li>\n" +
        "<li>These interrogatories are continuing; You must supplement Your responses if additional information becomes known.</li>\n" +
        "</ol>\n",
    ) +
    "{{-- Interrogatories}}\n" +
    heading("INTERROGATORIES") +
    "{{#Interrogatories|3}}<p><strong>INTERROGATORY NO. {{$index}}:</strong> {{Interrogatory:textarea|State the question.}}</p>\n{{/Interrogatories}}" +
    "{{-- Signature}}\n" +
    "<hr />\n" +
    signature("Attorney for Plaintiff"),
};

const subpoena: FormDef = {
  id: "extra-subpoena",
  court: COURT,
  section: "Discovery",
  title: "Subpoena",
  html:
    "{{-- Court & Caption}}\n" +
    ADVERSARY_CAPTION +
    "{{-- Subpoena Details}}\n" +
    "<hr />\n" +
    title("SUBPOENA") +
    "<p>YOU ARE HEREBY COMMANDED to {{Command:select:appear and testify before this Court;produce the documents and items described below;" +
    "appear and testify, and produce the documents and items described below|appear and testify before this Court}} " +
    "at the date, time, and place set forth below.</p>\n" +
    TABLE_OPEN +
    "<tr>\n<td><strong>To:</strong></td>\n<td>{{Person subpoenaed|Jane Witness}}, {{Recipient address|123 Vinewood Blvd, Los Santos}}</td>\n</tr>\n" +
    "<tr>\n<td><strong>Date and time:</strong></td>\n<td>{{Date and time to appear|January 1, 2025 at 9:00 AM}}</td>\n</tr>\n" +
    "<tr>\n<td><strong>Location:</strong></td>\n<td>{{Location|Dept. 4, Los Santos Superior Court}}</td>\n</tr>\n" +
    TABLE_CLOSE +
    "{{-- Items Demanded}}\n" +
    "{{?Items to produce}}" +
    heading("ITEMS TO BE PRODUCED") +
    "<ol>\n{{#Items|1}}<li>{{Item description:textarea|Describe the document or item.}}</li>\n{{/Items}}</ol>\n" +
    "{{/Items to produce}}" +
    "<p><em>Failure to obey this subpoena may be punished as contempt of court.</em></p>\n" +
    "{{-- Signature}}\n" +
    "<hr />\n" +
    signature("Attorney for the Plaintiff"),
};

const serviceContract: FormDef = {
  id: "extra-service-contract",
  court: COURT,
  section: "Contracts",
  title: "Service Agreement",
  html:
    "{{-- Parties}}\n" +
    title("SERVICES AGREEMENT") +
    '<p>This Services Agreement (the "Agreement") is entered into as of {{Effective date:date:long|__________}} ' +
    '(the "Effective Date") by and between {{Provider name@name|PROVIDER NAME}}, {{Provider address@address|PROVIDER ADDRESS}} ' +
    '("Provider"), and {{Client name|CLIENT NAME}}, {{Client address|CLIENT ADDRESS}} ("Client").</p>\n' +
    "<hr />\n" +
    "{{-- Services & Compensation}}\n" +
    "<p><strong>1. Services.</strong></p>\n" +
    "{{Scope of services:paras|<p>Describe the services to be provided.</p>}}\n" +
    "<p><strong>2. Compensation.</strong></p>\n" +
    "<p>{{Compensation:textarea|State the fee, invoicing cadence, and payment terms.}}</p>\n" +
    "<p><strong>3. Term and Termination.</strong></p>\n" +
    "<p>{{Term:textarea|This Agreement begins on the Effective Date and continues until terminated by either party upon 30 days' written notice.}}</p>\n" +
    "{{-- Additional Clauses}}\n" +
    "<p><strong>ADDITIONAL CLAUSES</strong></p>\n" +
    "{{#Clauses|0}}<p><strong>{{$letter}}. {{Clause heading|Heading}}.</strong></p>\n{{Clause text:paras|Clause text.}}\n{{/Clauses}}" +
    "<p><strong>4. Independent Contractor.</strong></p>\n" +
    "<p>Provider is an independent contractor. Nothing in this Agreement creates a partnership, joint venture, or employment relationship between the Parties.</p>\n" +
    "<p><strong>5. Governing Law.</strong></p>\n" +
    "<p>This Agreement shall be governed by and construed in accordance with the laws of {{Governing law|the State of San Andreas}}, " +
    "without regard to its conflict-of-laws principles.</p>\n" +
    "<p><strong>6. Entire Agreement.</strong></p>\n" +
    "<p>This Agreement constitutes the entire agreement between the Parties and supersedes all prior understandings. " +
    "It may be amended only by a writing signed by both Parties.</p>\n" +
    "{{-- Signatures}}\n" +
    "<hr />\n" +
    "<p>IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.</p>\n" +
    TABLE_OPEN +
    "<tr>\n<td><strong>PROVIDER</strong></td>\n<td><strong>CLIENT</strong></td>\n</tr>\n" +
    "<tr>\n<td><strong>{{Provider signatory@name|____________________}}</strong><br />\n{{Provider signatory title@title|Authorized Representative}}</td>\n" +
    "<td><strong>{{Client signatory|____________________}}</strong><br />\n{{Client signatory title|Authorized Representative}}</td>\n</tr>\n" +
    TABLE_CLOSE,
};

/** Our "Additional Templates" forms, in sidebar order. */
export const EXTRA_FORMS: FormDef[] = [
  generalPetition,
  nameChange,
  generalMotion,
  interrogatories,
  subpoena,
  serviceContract,
];
