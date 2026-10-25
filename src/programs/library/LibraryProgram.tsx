// The Law Library program (LP-103, LP-108): Penal Code (#library/penal-code, and
// a chapter at #library/penal-code/<chapter>) and Precedents (#library/precedents)
// in its navigation pane, the chapters listed under Penal Code.

import { useMemo } from "react";
import { chapterFromSlug, chapters, chapterSlug, PENAL_CODE } from "@/lib/penalCode";
import ErrorBoundary from "@/ui/ErrorBoundary";
import LawLibraryView from "./LawLibraryView";
import { navigate } from "@/shell/useRoute";
import type { ProgramProps } from "@/shell/program";

export default function LibraryProgram({ shell }: ProgramProps) {
  const r = shell.route;
  const page = r.program === "library" ? r.page : "penal-code";
  const chapter = r.program === "library" ? chapterFromSlug(r.chapter) : "";
  const list = useMemo(
    () =>
      chapters().map((c) => ({
        name: c,
        slug: chapterSlug(c),
        count: PENAL_CODE.charges.filter((x) => x.chapter === c && x.status !== "retired").length,
      })),
    [],
  );

  const link = (href: string, text: string, on: boolean, id: string) => (
    <a href={href} id={id} className={on ? "active" : undefined} aria-current={on ? "page" : undefined}>
      {text}
    </a>
  );

  return (
    <div className="layout">
      <nav className="sidebar library-nav" id="library-nav" aria-label="Law Library">
        <div className="tree">
          <details open>
            <summary>Penal Code</summary>
            <ul>
              <li>
                {link("#library/penal-code", "All charges", page === "penal-code" && !chapter, "library-nav-code")}
              </li>
              {list.map((c) => (
                <li key={c.slug}>
                  {link(
                    "#library/penal-code/" + c.slug,
                    c.name + " (" + c.count + ")",
                    page === "penal-code" && chapter === c.name,
                    "library-nav-" + c.slug,
                  )}
                </li>
              ))}
            </ul>
          </details>
          <details open>
            <summary>The firm</summary>
            <ul>
              <li>{link("#library/precedents", "Precedents", page === "precedents", "library-nav-precedents")}</li>
            </ul>
          </details>
        </div>
      </nav>
      <main className="editor" id={shell.visible ? "editor" : undefined}>
        <ErrorBoundary where="the Law Library" resetKey={page}>
          <LawLibraryView
            tab={page === "precedents" ? "precedents" : "code"}
            chapter={chapter}
            onChapter={(c) => navigate("#library/penal-code" + (c ? "/" + chapterSlug(c) : ""))}
          />
        </ErrorBoundary>
      </main>
    </div>
  );
}
