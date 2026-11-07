// Court Filings' navigation pane: the searchable list of court forms grouped by court
// and section (FR2, INV §a Sidebar), as an Explorer-style tree. Forms only (LP-105):
// the firm's programs and the J.A.P. open from the Program Manager. The firm's own
// templates (LP-49) come first, under My Templates, each with an Edit link.

import { useMemo, useState } from "react";
import { MY_PREFIX, MY_TEMPLATES } from "@/lib/customTemplates";
import type { FormDef } from "@/lib/types";
import { S_CREDIT, S_DISCLAIMER } from "@/lib/strings";

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
  /** Where the window is: the route's hash without "#" ("filings/<formId>"). */
  current: string | null;
}

export default function Sidebar({ forms, current }: SidebarProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => group(forms, q), [forms, q]);

  const link = (href: string, text: string, id?: string) => {
    const on = current === href.slice(1);
    return (
      <a href={href} id={id} className={on ? "active" : undefined} aria-current={on ? "page" : undefined}>
        {text}
      </a>
    );
  };

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
      <p className="new-template">{link("#filings/edit/new", "+ New template", "new-template")}</p>
      <div id="form-list" className="tree">
        {!groups.length && <p className="muted small">No forms match.</p>}
        {groups.map((g) => (
          <details open key={g.court}>
            <summary>{g.court}</summary>
            {g.runs.map((run, i) => (
              <div key={i} className="tree-run">
                {run.section && <p className="section-label">{run.section}</p>}
                <ul>
                  {run.forms.map((f) => (
                    <li key={f.id} className={g.court === MY_TEMPLATES ? "my-template" : undefined}>
                      {link("#filings/" + f.id, f.title)}
                      {g.court === MY_TEMPLATES && (
                        <a
                          className="tree-edit"
                          href={"#filings/edit/" + f.id.slice(MY_PREFIX.length)}
                          aria-label={"Edit template: " + f.title}
                        >
                          Edit
                        </a>
                      )}
                    </li>
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
