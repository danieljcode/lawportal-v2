// The J.A.P. output window (INV §a aside#jap-output): the portfolio as Discord messages, each with
// its own Copy button (LP-224, the forum post went with LP-223). It reads the saved portfolio, which
// the J.A.P. view writes on every edit.

import { useEffect, useMemo, useRef, useState } from "react";
import { clean, levelFromTitle, portfolioHtml, portfolioStore } from "@/lib/portfolio";
import type { Character } from "@/lib/types";
import DiscordPanel from "@/ui/DiscordPanel";
import { usePortfolioVersion } from "@/ui/useStore";

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

  const html = useMemo(() => {
    // version is the change signal; the store is read fresh when it moves.
    const p = (version >= 0 && portfolioStore().get(character.id)) || clean({ level: levelFromTitle(character.title) });
    return portfolioHtml(p.level, p[p.level], character.name);
  }, [character.id, character.name, character.title, version]);

  const flash = (text: string, bad: boolean) => {
    setStatus({ text, bad });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 4000);
  };

  return (
    <aside className="output window" id="jap-output" aria-labelledby="jap-output-title">
      <div className="title-bar">
        <span className="title-bar-text" id="jap-output-title">
          Discord
        </span>
      </div>
      <div className="window-body output-body">
        <DiscordPanel finalHtml={html} onStatus={flash} asTab={false} />
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
