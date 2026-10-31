// The Help program (LP-94): Contents, Search, and topics that link to each other, with a Back
// of its own through the topics read, like Windows 3.0 Help. Each program's Help menu opens its
// topic (#help/<program id>). The topics are Markdown files (topics.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { searchTerms } from "@/lib/precedents";
import ErrorBoundary from "@/ui/ErrorBoundary";
import Marked from "@/ui/Marked";
import type { ProgramProps } from "@/shell/program";
import { navigate } from "@/shell/useRoute";
import Markdown from "./Markdown";
import { CONTENTS, TOPICS, searchTopics } from "./topics";

const hrefOf = (id: string) => "#help" + (id ? "/" + id : "");

function HelpView({ shell }: ProgramProps) {
  const id = shell.route.program === "help" ? shell.route.topic || "" : "";
  const topic = TOPICS.find((t) => t.id === id);
  const [q, setQ] = useState("");
  // The topics read, newest last ("" is Contents); Back steps through them.
  const [trail, setTrail] = useState<string[]>([]);
  const backing = useRef(false);
  useEffect(() => {
    const back = backing.current;
    backing.current = false;
    setTrail((t) => (back ? t.slice(0, -1) : t.at(-1) === id ? t : [...t, id]));
    setQ("");
  }, [id]);

  const terms = useMemo(() => searchTerms(q), [q]);
  const found = useMemo(() => searchTopics(terms), [terms]);
  const link = (t: { id: string; title: string }) => (
    <li key={t.id}>
      <a href={hrefOf(t.id)} id={"help-link-" + t.id}>
        <Marked text={t.title} terms={terms} />
      </a>
    </li>
  );

  return (
    <section id="help" className="form-view help">
      <div className="help-bar" role="toolbar" aria-label="Help">
        <button type="button" className="btn" id="help-contents" onClick={() => navigate("#help")}>
          Contents
        </button>
        <button
          type="button"
          className="btn"
          id="help-back"
          disabled={trail.length < 2}
          onClick={() => {
            backing.current = true;
            navigate(hrefOf(trail[trail.length - 2]));
          }}
        >
          Back
        </button>
        <input
          type="search"
          id="help-q"
          className="help-search"
          placeholder="Search Help"
          aria-label="Search Help"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="help-page">
        {terms.length ? (
          <>
            <h2 id="help-results">Search</h2>
            <p className="small muted" role="status">
              {found.length ? found.length + (found.length === 1 ? " topic" : " topics") : "No topics found."}
            </p>
            <ul className="help-list">{found.map(link)}</ul>
          </>
        ) : topic ? (
          <article className="help-topic" aria-label={topic.title}>
            <Markdown text={topic.text} />
          </article>
        ) : (
          <>
            <h2 id="help-title">Contents</h2>
            {id && <p className="small muted">There&apos;s no Help topic called “{id}”.</p>}
            {CONTENTS.map((s, i) => (
              <section key={s.heading} aria-labelledby={"help-s" + i}>
                <h3 id={"help-s" + i}>{s.heading}</h3>
                <ul className="help-list">{s.topics.map(link)}</ul>
              </section>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

export default function HelpProgram(props: ProgramProps) {
  return (
    <div className="layout no-nav">
      <main className="editor" id={props.shell.visible ? "editor" : undefined}>
        <ErrorBoundary where="Help" resetKey="help">
          <HelpView {...props} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
