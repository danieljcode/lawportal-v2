// The J.A.P. output window (INV §a aside#jap-output): topic title, Copy title,
// Copy BBCode and the readonly BBCode. It reads the saved portfolio, which the
// J.A.P. view writes on every edit.

import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { clean, levelFromTitle, portfolioStore, render, topicTitle } from "@/lib/portfolio";
import type { Character } from "@/lib/types";
import { usePortfolioVersion } from "./useStore";

export default function JapOutput({ character }: { character: Character }) {
  const version = usePortfolioVersion();
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const bbcode = useMemo(() => {
    // version is the change signal; the store is read fresh when it moves.
    const p = (version >= 0 && portfolioStore().get(character.id)) || clean({ level: levelFromTitle(character.title) });
    return render(p.level, p[p.level], character.name);
  }, [character.id, character.name, character.title, version]);
  const topic = topicTitle(character.name);

  const copy = async (text: string, what: string) => {
    const ok = await copyText(text);
    setStatus(
      ok
        ? { text: what + " copied.", bad: false }
        : { text: "Copy failed: select the text and press Ctrl+C.", bad: true },
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 4000);
  };

  return (
    <aside className="output window" id="jap-output" aria-labelledby="jap-output-title">
      <div className="title-bar">
        <span className="title-bar-text" id="jap-output-title">
          Forum post (BBCode)
        </span>
      </div>
      <div className="window-body output-body">
        <div className="jap-topic">
          <span className="muted small">Topic title</span>
          <code id="jap-topic">{topic}</code>
          <button className="mini" id="jap-copy-title" type="button" onClick={() => copy(topic, "Title")}>
            Copy title
          </button>
        </div>
        <div className="copy-row">
          <button className="btn primary" id="jap-copy" type="button" onClick={() => copy(bbcode, "BBCode")}>
            Copy BBCode
          </button>
        </div>
        <p className="note">
          Paste it into the post box as it is. Anything you haven&apos;t filled in yet keeps the template&apos;s
          placeholder.
        </p>
        <textarea
          id="jap-bbcode"
          className="code-area"
          readOnly
          spellCheck={false}
          aria-label="Portfolio BBCode"
          value={bbcode}
        />
      </div>
      <div className="status-bar">
        <span
          className={"status" + (status ? (status.bad ? " bad" : " good") : "")}
          id="jap-status"
          role="status"
          aria-live="polite"
        >
          {status ? status.text : ""}
        </span>
      </div>
    </aside>
  );
}
