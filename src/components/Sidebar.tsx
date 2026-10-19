// Searchable form list grouped by court (FR2, INV §a Sidebar), as an Explorer-style tree.

import { useMemo, useState } from "react";
import type { FormDef } from "@/lib/types";
import { S_CREDIT, S_DISCLAIMER } from "@/lib/strings";

const JAP_NAME = "Judicial Advancement Portfolio";
const JAP_SEARCH = (JAP_NAME + " j.a.p. jap court commissioners").toLowerCase();
const CASES_SEARCH = "case file cases firm docket upcoming deadlines hearings";

interface Group {
  court: string;
  /** Runs of forms sharing a section label (a new run starts whenever the section changes). */
  runs: Array<{ section: string; forms: FormDef[] }>;
}

function group(forms: FormDef[], q: string): Group[] {
  const groups: Group[] = [];
  for (const f of forms) {
    if (q && (f.title + " " + f.court + " " + f.section).toLowerCase().indexOf(q) < 0) continue;
    let g = groups.find((x) => x.court === f.court);
    if (!g) groups.push((g = { court: f.court, runs: [] }));
    const last = g.runs[g.runs.length - 1];
    if (last && last.section === f.section) last.forms.push(f);
    else g.runs.push({ section: f.section, forms: [f] });
  }
  return groups;
}

export interface SidebarProps {
  forms: FormDef[];
  /** The open form's id, "jap", or null on the start page. */
  current: string | null;
  /** Show the Court Commissioners group. */
  commissioner: boolean;
}

export default function Sidebar({ forms, current, commissioner }: SidebarProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => group(forms, q), [forms, q]);
  const showJap = commissioner && (!q || JAP_SEARCH.indexOf(q) >= 0);
  const showCases = !q || CASES_SEARCH.indexOf(q) >= 0;

  const link = (href: string, text: string, on: boolean) => (
    <a href={href} className={on ? "active" : undefined} aria-current={on ? "page" : undefined}>
      {text}
    </a>
  );

  return (
    <nav className="sidebar" id="sidebar" aria-label="Forms">
      <input
        type="search"
        id="form-search"
        placeholder="Search forms…"
        aria-label="Search forms"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div id="form-list" className="tree">
        {showCases && (
          <details open>
            <summary>The firm</summary>
            <ul>
              <li>{link("#cases", "Case File", current === "cases")}</li>
              <li>{link("#upcoming", "Upcoming", current === "upcoming")}</li>
            </ul>
          </details>
        )}
        {showJap ? (
          <details open>
            <summary>Court Commissioners</summary>
            <ul>
              <li>{link("#jap", JAP_NAME + " (J.A.P.)", current === "jap")}</li>
            </ul>
          </details>
        ) : (
          !groups.length && !showCases && <p className="muted small">No forms match.</p>
        )}
        {groups.map((g) => (
          <details open key={g.court}>
            <summary>{g.court}</summary>
            {g.runs.map((run, i) => (
              <div key={i} className="tree-run">
                {run.section && <p className="section-label">{run.section}</p>}
                <ul>
                  {run.forms.map((f) => (
                    <li key={f.id}>{link("#" + f.id, f.title, current === f.id)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        ))}
      </div>
      <p className="sidebar-foot muted">{S_CREDIT}</p>
      <p className="disclaimer">{S_DISCLAIMER}</p>
    </nav>
  );
}
