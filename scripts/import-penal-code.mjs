// Import the FreestyleRP penal code (LP-17) into src/data/penal-code.json, the
// one data file the Law Library reads. Run it when the server changes laws:
//
//   npm run penal-code                 fetch the "Penal Code" tab of the sheet
//   npm run penal-code -- file.csv     use a CSV saved from that tab instead
//
// The sheet's chapter rows ("Offenses Involving Theft") group the charges that
// follow; a charge row starts "PC <number>". Change notes and previous values
// are the review's working notes and stay out of the app. The file records
// today's date as "last updated", shown in the Law Library.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SHEET = "https://docs.google.com/spreadsheets/d/144cGVpsx3BPC7cBbHqnUnHJIolLh9-cyEif_qjZNpcY";
const TAB = "Penal Code";
const OUT = path.resolve(import.meta.dirname, "../src/data/penal-code.json");

/** RFC 4180 CSV: quoted fields, "" for a quote, newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
const num = (s) => {
  const n = Number(clean(s).replace(/[$,]/g, ""));
  return clean(s) !== "" && Number.isFinite(n) ? n : undefined;
};
const STATUSES = { new: "new", amended: "amended", review: "review", retired: "retired", unchanged: "unchanged" };
const CLASSES = ["Capital", "Felony", "Misdemeanor", "Infraction"];

/** The charges in a CSV of the Penal Code tab, in the sheet's order. */
export function chargesFrom(rows) {
  const charges = [];
  let chapter = "";
  for (const r of rows) {
    const first = clean(r[0]);
    // The title cell runs into the first chapter: "… PC # Crimes Against Persons".
    const inHeader = /PC #\s*(.+)$/.exec(first);
    if (inHeader) {
      chapter = clean(inHeader[1]);
      continue;
    }
    const m = /^PC\s*(\d+)$/i.exec(first);
    if (!m) {
      if (first && r.slice(1).every((c) => !clean(c))) chapter = first;
      continue;
    }
    const [, , cls, jail, min, max, fine, description, penalties, status] = r.map(clean);
    const title = clean(r[1]);
    if (!title) continue; // an empty retired slot
    const charge = {
      section: "PC " + m[1],
      chapter,
      title,
      class: CLASSES.includes(cls) ? cls : "Felony",
      jail: num(jail),
      min: num(min),
      max: num(max),
      fine: num(fine),
      description,
      penalties: penalties || undefined,
      status: STATUSES[status.toLowerCase()] || "unchanged",
    };
    charges.push(Object.fromEntries(Object.entries(charge).filter(([, v]) => v !== undefined && v !== "")));
  }
  return charges;
}

async function main() {
  const file = process.argv[2];
  let csv;
  if (file) {
    csv = readFileSync(file, "utf8");
  } else {
    const url = SHEET + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(TAB);
    const res = await fetch(url);
    if (!res.ok || !/csv/.test(res.headers.get("content-type") || "")) {
      throw new Error(`Couldn't download the sheet (${res.status}). Is it shared with "Anyone with the link"?`);
    }
    csv = await res.text();
  }
  const charges = chargesFrom(parseCsv(csv));
  if (charges.length < 50) throw new Error(`Only ${charges.length} charges found: is that the Penal Code tab?`);
  const sections = new Set();
  for (const c of charges) {
    if (sections.has(c.section)) throw new Error("Two charges are " + c.section);
    sections.add(c.section);
  }
  const data = {
    title: "State of San Andreas Penal Code",
    note: "Revised draft: subject to change until FreestyleRP staff sign it off.",
    source: SHEET,
    updated: new Date().toISOString().slice(0, 10),
    charges,
  };
  writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote ${charges.length} charges to ${path.relative(process.cwd(), OUT)} (updated ${data.updated}).`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
