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

/** An optional list of the loaded case's exhibits, filled from its evidence (LP-13). */
const EXHIBIT_LIST =
  "{{?Exhibit list|off}}" + heading("EXHIBITS") + "{{Exhibits@exhibits|<p>No exhibits.</p>}}\n" + "{{/Exhibit list}}";

const generalPetition: FormDef = {
  id: "extra-general-petition",
  court: COURT,
  section: "Petitions",
  title: "General Petition",
  required: ["Petitioner name", "Case number", "Respondent name", "Name"],
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
    // The case's exhibits (LP-13), off unless ticked.
    EXHIBIT_LIST +
    "{{-- Signature}}\n" +
    "<hr />\n" +
    signature("Petitioner"),
};

const nameChange: FormDef = {
  id: "extra-name-change",
  court: COURT,
  section: "Petitions",
  title: "Petition for Name Change",
  required: ["Petitioner name", "Case number", "Current legal name", "Proposed name", "Name"],
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
  required: ["Plaintiff name", "Case number", "Defendant name", "Name"],
  html:
    "{{-- Court & Caption}}\n" +
    ADVERSARY_CAPTION +
    "{{-- Motion}}\n" +
    "<hr />\n" +
    title("{{Motion title|MOTION TITLE}}") +
    "<p>{{Introduction:textarea|Movant respectfully moves this Honorable Court for an order granting the relief requested herein, and in support states as follows:}}</p>\n" +
    "{{Grounds:paras|<p>State the factual and legal basis for the motion here.</p>}}\n" +
    "{{Relief requested:paras|<p>WHEREFORE, Movant respectfully requests that this Court grant this Motion and award such further relief as it deems just and proper.</p>}}\n" +
    // The case's exhibits (LP-13), off unless ticked.
    EXHIBIT_LIST +
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
  required: ["Plaintiff name", "Case number", "Defendant name", "Responding party", "Name"],
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
  required: ["Plaintiff name", "Case number", "Defendant name", "Person subpoenaed", "Name"],
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
  required: ["Provider name", "Client name", "Provider signatory", "Client signatory"],
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

/* ---------- Firm Letters (LP-9) ----------
 * Letters and agreements the firm sends clients and other parties. They open
 * with the firm's letterhead from Settings (LP-23), the only firm branding a
 * template may carry; court forms never do. The firm's name in the body is
 * still a plain field. The sign-off fills from the active character. They use
 * a "Letter date", not a filing date, so saving one to the Case File doesn't
 * record a filing date. */

const LETTER_SECTION = "Firm Letters";

/** The firm's letterhead at the top of a letter, and the date. */
const LETTERHEAD =
  "{{-- Letterhead}}\n" +
  '{{Letterhead@letterhead|<p style="text-align:center"><strong>FIRM NAME</strong></p>}}\n' +
  "<hr />\n" +
  "<p>{{Letter date=today:date:long|__________}}</p>\n";

/** The lawyer's sign-off, filled from the active character. */
function signOff(closing: string): string {
  return (
    "{{-- Signature}}\n" +
    `<p>${closing}</p>\n` +
    "<p>{{Signature@signature:image|SIGNATURE}}</p>\n" +
    "<p><strong>{{Name@name|____________________}}</strong><br />\n" +
    "{{Role@title|Attorney at Law}}<br />\n" +
    "Bar No. {{Bar number@bar|__________}}<br />\n" +
    "{{Firm|FIRM NAME}}</p>\n"
  );
}

const engagementLetter: FormDef = {
  id: "extra-engagement-letter",
  court: COURT,
  section: LETTER_SECTION,
  title: "Engagement Letter",
  required: ["Client name", "Name"],
  html:
    LETTERHEAD +
    "{{-- Client}}\n" +
    "<p>{{Client name|CLIENT NAME}}<br />\n{{Client address|CLIENT ADDRESS}}</p>\n" +
    "<p><strong>Re: Engagement of legal services ({{Matter|THE MATTER}}, Case No. {{Case number|to be assigned}})</strong></p>\n" +
    "<p>Dear {{Client name|CLIENT NAME}},</p>\n" +
    "{{-- Engagement}}\n" +
    "<p>Thank you for choosing {{Firm|FIRM NAME}}. This letter confirms that we will represent you in the matter " +
    "above, and sets out the terms of that engagement.</p>\n" +
    "<p><strong>1. Scope of the representation.</strong></p>\n" +
    "{{Scope:paras|<p>Describe what the firm will and will not do for the client.</p>}}\n" +
    "<p><strong>2. Who will work on your matter.</strong> {{Name@name|____________________}} will lead your matter, " +
    "and other members of the firm may assist where that serves you.</p>\n" +
    "<p><strong>3. Fees.</strong> {{Fees:textarea|Our fees and the retainer are set out in the Retainer Agreement that accompanies this letter.}}</p>\n" +
    "<p><strong>4. Your part.</strong> Please be truthful and complete with us, keep us informed of anything that may " +
    "affect your matter, and respond promptly when we need instructions.</p>\n" +
    "<p><strong>5. Ending the engagement.</strong> You may end this engagement at any time. We may withdraw where the " +
    "rules of professional conduct allow, after reasonable notice to you.</p>\n" +
    "<p>If these terms are acceptable, please sign below and return a copy to us.</p>\n" +
    signOff("Sincerely,") +
    "{{-- Acceptance}}\n" +
    "<hr />\n" +
    "<p><strong>ACKNOWLEDGED AND AGREED</strong></p>\n" +
    "<p>____________________<br />\n{{Client name|CLIENT NAME}}<br />\nDate: __________</p>\n",
};

const retainerAgreement: FormDef = {
  id: "extra-retainer-agreement",
  court: COURT,
  section: LETTER_SECTION,
  title: "Retainer Agreement",
  required: ["Client name", "Hourly rate", "Retainer amount", "Name"],
  html:
    "{{-- Parties}}\n" +
    title("RETAINER AGREEMENT") +
    '<p>This Retainer Agreement is made on {{Letter date=today:date:long|__________}} between {{Firm|FIRM NAME}} ' +
    '(the "Firm") and {{Client name|CLIENT NAME}} of {{Client address|CLIENT ADDRESS}} (the "Client") for representation in ' +
    "{{Matter|THE MATTER}} (Case No. {{Case number|to be assigned}}).</p>\n" +
    "{{-- Fees}}\n" +
    "<p><strong>1. Fees.</strong> The Client will pay the Firm {{Hourly rate=$250 per hour|$____ per hour}} for time " +
    "spent on the matter, billed in increments of {{Billing increment=6 minutes|6 minutes}}.</p>\n" +
    "<p><strong>2. Retainer.</strong> The Client will pay a retainer of {{Retainer amount=$5,000|$__________}} before work " +
    "begins. It is held in the Firm's client trust account and applied to invoices as they fall due. When it falls " +
    "below {{Replenish below=$1,000|$__________}}, the Client will bring it back up to the full amount.</p>\n" +
    "<p><strong>3. Payment terms.</strong> {{Payment terms=Invoices are due within 14 days of receipt.:textarea|Invoices are due within 14 days of receipt.}}</p>\n" +
    "<p><strong>4. Costs.</strong> Court fees and other costs paid on the Client's behalf are charged at cost, in " +
    "addition to the Firm's fees.</p>\n" +
    "{{-- Terms}}\n" +
    "<p><strong>5. Ending the agreement.</strong> Either party may end this agreement by written notice. Fees earned " +
    "and costs incurred up to that date remain payable; any unused retainer is returned to the Client.</p>\n" +
    "<p><strong>6. No guarantee.</strong> The Firm cannot promise any outcome. Any view it gives on the likely result is " +
    "an opinion, not a guarantee.</p>\n" +
    "<p><strong>7. Governing law.</strong> This agreement is governed by the laws of {{Governing law|the State of San Andreas}}.</p>\n" +
    "{{-- Signatures}}\n" +
    "<hr />\n" +
    TABLE_OPEN +
    "<tr>\n<td><strong>FOR THE FIRM</strong></td>\n<td><strong>CLIENT</strong></td>\n</tr>\n" +
    "<tr>\n<td>{{Signature@signature:image|SIGNATURE}}</td>\n<td>____________________</td>\n</tr>\n" +
    "<tr>\n<td>{{Name@name|____________________}}<br />\n{{Role@title|Attorney at Law}}<br />\nBar No. {{Bar number@bar|__________}}</td>\n" +
    "<td>{{Client name|CLIENT NAME}}<br />\nDate: __________</td>\n</tr>\n" +
    TABLE_CLOSE,
};

const demandLetter: FormDef = {
  id: "extra-demand-letter",
  court: COURT,
  section: LETTER_SECTION,
  title: "Demand Letter",
  required: ["Recipient name", "Client name", "Amount demanded", "Name"],
  html:
    LETTERHEAD +
    "{{-- Recipient}}\n" +
    "<p>{{Recipient name|RECIPIENT NAME}}<br />\n{{Recipient address|RECIPIENT ADDRESS}}</p>\n" +
    "<p><strong>Re: {{Subject|Demand for payment}} (Case No. {{Case number|not yet filed}})</strong></p>\n" +
    "<p>Dear {{Recipient name|RECIPIENT NAME}},</p>\n" +
    "{{-- Demand}}\n" +
    "<p>This firm represents {{Client name|CLIENT NAME}} in connection with {{Matter|THE MATTER}}.</p>\n" +
    "{{Facts:paras|<p>Set out what happened, with dates.</p>}}\n" +
    "<p>On behalf of our client, we demand payment of {{Amount demanded|$__________}} " +
    "by {{Response deadline=today+14:date:long|__________}}.</p>\n" +
    "<p>{{Consequence:textarea|If the amount is not paid by that date, our client has instructed us to begin proceedings without further notice, and to seek costs.}}</p>\n" +
    "<p>Please direct all communication about this matter to the undersigned. This letter is written without " +
    "prejudice to our client's rights, all of which are reserved.</p>\n" +
    signOff("Yours faithfully,"),
};

const representationLetter: FormDef = {
  id: "extra-representation-letter",
  court: COURT,
  section: LETTER_SECTION,
  title: "Letter of Representation",
  required: ["Recipient name", "Client name", "Name"],
  html:
    LETTERHEAD +
    "{{-- Recipient}}\n" +
    "<p>{{Recipient name|RECIPIENT NAME}}<br />\n{{Recipient address|RECIPIENT ADDRESS}}</p>\n" +
    "<p><strong>Re: {{Plaintiff name|PLAINTIFF NAME}} v. {{Defendant name|DEFENDANT NAME}}, Case No. {{Case number|__________}}</strong></p>\n" +
    "<p>Dear {{Recipient name|RECIPIENT NAME}},</p>\n" +
    "{{-- Representation}}\n" +
    "<p>Please be advised that {{Firm|FIRM NAME}} now represents {{Client name|CLIENT NAME}} in the matter above, " +
    "effective {{Effective date=today:date:long|__________}}.</p>\n" +
    "<p>Please direct all further communication, notices and documents in this matter to the undersigned, and do " +
    "not contact our client directly.</p>\n" +
    "<p>{{Additional notes:textarea|Please update your records accordingly.}}</p>\n" +
    signOff("Sincerely,"),
};


/* ---------- Judge (LP-90) ----------
 * Orders a judge issues that forms.json doesn't already have (Order Decree,
 * the judgements and the schedules cover the rest; see LP-90). Posted to the
 * forum, so unbranded. The judge's name, title and signature fill from the
 * active character; "Court name" fills from a case loaded from the case bar.
 * They use an "Order date", not a filing date, so saving one to the Case File
 * leaves the case's filed date alone. */

const JUDGE_SECTION = "Judge";

/** The court, then Plaintiff v. Defendant with the case number. */
const JUDGE_CAPTION =
  '<p style="text-align:center"><strong>{{Court name|SAN ANDREAS COURT}}</strong><br />\nCOUNTY OF LOS SANTOS</p>\n' +
  TABLE_OPEN +
  "<tr>\n<td>{{Plaintiff name|PLAINTIFF NAME}},<br />\nPlaintiff,</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
  `<tr>\n<td style="text-align:center">v.</td>\n<td>)</td>\n<td>${CASE_NO}</td>\n</tr>\n` +
  "<tr>\n<td>{{Defendant name|DEFENDANT NAME}},<br />\nDefendant.</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
  TABLE_CLOSE;

/** The judge's signature, filled from the active character. */
const JUDGE_SIGNATURE =
  "{{-- Signature}}\n" +
  "<p><strong>IT IS SO ORDERED.</strong></p>\n" +
  "<p>Dated: {{Order date=today:date:long|__________}}</p>\n" +
  "<p>{{Judge signature@signature:image|SIGNATURE}}</p>\n" +
  "<p><strong>{{Judge name@name|____________________}}</strong><br />\n" +
  "{{Judge title@title|Judge of the Superior Court}}<br />\n" +
  "{{Court name|SAN ANDREAS COURT}}</p>\n";

const rulingOnMotion: FormDef = {
  id: "extra-ruling-on-motion",
  court: COURT,
  section: JUDGE_SECTION,
  title: "Ruling on Motion",
  required: ["Case number", "Motion", "Ruling", "Judge name"],
  html:
    "{{-- Court & Caption}}\n" +
    JUDGE_CAPTION +
    title("ORDER ON MOTION") +
    "{{-- Motion}}\n" +
    "<p>The Court has considered the {{Motion|MOTION TITLE}} filed by {{Moving party|THE MOVING PARTY}} on " +
    "{{Motion filed:date:long|__________}}{{?Opposition}}, and the opposition filed by {{Opposing party|THE OPPOSING PARTY}}{{/Opposition}}.</p>\n" +
    "{{-- Ruling}}\n" +
    "<p>The motion is <strong>{{Ruling:select:GRANTED;DENIED;GRANTED IN PART AND DENIED IN PART|GRANTED / DENIED}}</strong>.</p>\n" +
    heading("REASONS") +
    "{{Reasons:paras|<p>The Court's reasons for the ruling.</p>}}\n" +
    heading("ORDER") +
    "<p>It is hereby ORDERED:</p>\n" +
    "{{Orders:list|What the parties must do, one order per line.}}\n" +
    JUDGE_SIGNATURE,
};

const sentencingOrder: FormDef = {
  id: "extra-sentencing-order",
  court: COURT,
  section: JUDGE_SECTION,
  title: "Sentencing Order",
  required: ["Case number", "Defendant name", "Judge name"],
  html:
    "{{-- Court & Caption}}\n" +
    '<p style="text-align:center"><strong>{{Court name|SAN ANDREAS COURT}}</strong><br />\nCOUNTY OF LOS SANTOS</p>\n' +
    TABLE_OPEN +
    "<tr>\n<td>{{Plaintiff name|THE PEOPLE OF THE STATE OF SAN ANDREAS}},<br />\nPlaintiff,</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
    `<tr>\n<td style="text-align:center">v.</td>\n<td>)</td>\n<td>${CASE_NO}</td>\n</tr>\n` +
    "<tr>\n<td>{{Defendant name|DEFENDANT NAME}},<br />\nDefendant.</td>\n<td>)</td>\n<td></td>\n</tr>\n" +
    TABLE_CLOSE +
    title("SENTENCING ORDER") +
    "{{-- Conviction}}\n" +
    "<p>The Defendant, {{Defendant name|DEFENDANT NAME}}, was convicted on {{Conviction date:date:long|__________}} by " +
    "{{Convicted by:select:verdict;plea of guilty;plea of no contest|verdict}} of:</p>\n" +
    "{{Offences:list|Each offence, one per line.}}\n" +
    "{{-- Sentence}}\n" +
    "<p>IT IS ADJUDGED that the Defendant is sentenced as follows.</p>\n" +
    "{{?Custody}}<p><strong>Custody:</strong> {{Custody|__ days}} in the county jail, with credit for " +
    "{{Time served|0 days}} already served.</p>\n{{/Custody}}" +
    "{{?Fine}}<p><strong>Fine:</strong> {{Fine amount|$____}}, payable to the Court.</p>\n{{/Fine}}" +
    "{{?Restitution|off}}<p><strong>Restitution:</strong> {{Restitution amount|$____}} to {{Restitution to|THE VICTIM}}.</p>\n{{/Restitution}}" +
    "{{?Community service|off}}<p><strong>Community service:</strong> {{Service hours|__}} hours, to be completed by " +
    "{{Service by:date:long|__________}}.</p>\n{{/Community service}}" +
    "{{?Probation|off}}<p><strong>Probation:</strong> {{Probation length|__ months}}, on these conditions:</p>\n" +
    "{{Probation conditions:list|Each condition, one per line.}}\n{{/Probation}}" +
    "{{-- Further orders}}\n" +
    "<p>{{Further orders:textarea|The Defendant is remanded to custody to begin the sentence.}}</p>\n" +
    JUDGE_SIGNATURE,
};

const warrantDecision: FormDef = {
  id: "extra-warrant-decision",
  court: COURT,
  section: JUDGE_SECTION,
  title: "Warrant Decision",
  required: ["Warrant number", "Applicant", "Subject", "Decision", "Judge name"],
  html:
    "{{-- Court & Application}}\n" +
    '<p style="text-align:center"><strong>{{Court name|SAN ANDREAS COURT}}</strong><br />\nCOUNTY OF LOS SANTOS</p>\n' +
    title("{{Warrant type:select:SEARCH WARRANT;ARREST WARRANT|SEARCH WARRANT}}") +
    "<p>Warrant No. {{Warrant number|__________}} · Case No. {{Case number|none yet}}</p>\n" +
    "<p>Application by {{Applicant|OFFICER NAME, BADGE NO.}} of {{Agency|AGENCY}}, received " +
    "{{Application date=today:date:long|__________}}.</p>\n" +
    "<p><strong>Subject:</strong> {{Subject|NAME OR PROPERTY}}<br />\n" +
    "<strong>Location:</strong> {{Location|ADDRESS OR DESCRIPTION}}</p>\n" +
    "{{-- Decision}}\n" +
    "<p>Having reviewed the application and the supporting affidavit, the Court finds that probable cause " +
    "{{Probable cause:select:HAS;HAS NOT|HAS / HAS NOT}} been shown. The application is " +
    "<strong>{{Decision:select:APPROVED;DENIED|APPROVED / DENIED}}</strong>.</p>\n" +
    "{{?Terms of the warrant}}<p><strong>Scope:</strong></p>\n" +
    "{{Scope:paras|<p>What may be searched or seized, or who may be arrested.</p>}}\n" +
    "<p><strong>Valid until:</strong> {{Valid until=today+3:date:long|__________}}</p>\n{{/Terms of the warrant}}" +
    "<p>{{Reasons:textarea|The Court's reasons.}}</p>\n" +
    JUDGE_SIGNATURE,
};

export const EXTRA_FORMS: FormDef[] = [
  generalPetition,
  nameChange,
  generalMotion,
  interrogatories,
  subpoena,
  serviceContract,
  engagementLetter,
  retainerAgreement,
  demandLetter,
  representationLetter,
  rulingOnMotion,
  sentencingOrder,
  warrantDecision,
];
