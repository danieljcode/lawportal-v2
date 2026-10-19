// The Discord tab of the output pane: the filing as Discord markdown, split into
// messages, each with a dark Discord-style preview (or the raw text), its
// character count and its own Copy button. Mounted only while the tab is shown.

import { useMemo, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { htmlToDiscordDoc } from "@/lib/discord";
import { renderDiscordHtml } from "@/lib/discordPreview";
import { readDiscordSettings, writeDiscordSettings, type DiscordSettings } from "@/lib/discordSettings";
import { splitDiscord } from "@/lib/discordSplit";
import type { SafeHtml } from "@/lib/safeHtml";
import { SAVE_FAILED } from "@/lib/storage";

export interface DiscordPanelProps {
  finalHtml: SafeHtml;
  onStatus(text: string, bad: boolean): void;
  /** Runs a copy, or first asks about empty required fields (LP-87). */
  guard?(what: string, run: () => void): void;
  /** A part was copied (filing history, LP-15). */
  onCopied?(): void;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function DiscordPanel({ finalHtml, onStatus, guard = (_, run) => run(), onCopied }: DiscordPanelProps) {
  // App is client-only (AppLoader, ssr: false), so storage can be read in the initializer.
  const [settings, setSettings] = useState<DiscordSettings>(() => readDiscordSettings());
  const { limit, tables, markers } = settings;

  const parts = useMemo(
    () => splitDiscord(htmlToDiscordDoc(finalHtml, { tables }), { limit, markers }),
    [finalHtml, tables, limit, markers],
  );

  // A different number of parts starts every part on the preview again (set while rendering, not in an effect).
  const [raw, setRaw] = useState<boolean[]>([]);
  if (raw.length !== parts.length) setRaw(parts.map(() => false));

  const update = (patch: Partial<DiscordSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (!writeDiscordSettings(next)) onStatus(SAVE_FAILED, true);
  };

  const copy = async (i: number) => {
    const ok = await copyText(parts[i]);
    if (ok) onCopied?.();
    onStatus(
      ok ? `Part ${i + 1} copied. Paste it into Discord.` : "Copy failed: select the text and press Ctrl+C.",
      !ok,
    );
  };

  const n = parts.length;

  return (
    <div id="discord-pane" role="tabpanel" aria-labelledby="tab-discord">
      <div className="dc-settings">
        <label htmlFor="dc-limit">Limit</label>
        <select
          id="dc-limit"
          value={limit}
          onChange={(e) => update({ limit: e.target.value === "4000" ? 4000 : 2000 })}
        >
          <option value="2000">2,000 (standard)</option>
          <option value="4000">4,000 (Nitro)</option>
        </select>
        <label htmlFor="dc-tables">Tables</label>
        <select
          id="dc-tables"
          value={tables}
          onChange={(e) => update({ tables: e.target.value === "lines" ? "lines" : "code" })}
        >
          <option value="code">Code block</option>
          <option value="lines">Plain lines</option>
        </select>
        <label className="toggle">
          <input
            type="checkbox"
            className="win-check"
            id="dc-markers"
            checked={markers}
            onChange={(e) => update({ markers: e.target.checked })}
          />{" "}
          Part markers
        </label>
      </div>
      <p className="note">
        Discord has no tables, colours or alignment. Unfilled fields keep their placeholder text. The preview is a close
        approximation of Discord.
      </p>
      <p id="dc-summary" className="note" aria-live="polite">
        {n === 1 ? "1 part" : `${fmt(n)} parts`}, up to {fmt(limit)} characters each
      </p>
      {n === 0 ? (
        <p className="note">Nothing to send yet.</p>
      ) : (
        parts.map((part, i) => {
          const showRaw = raw[i] === true;
          return (
            <section className="dc-part" id={"dc-part-" + (i + 1)} key={i} aria-label={`Part ${i + 1} of ${n}`}>
              <div className="dc-part-head">
                <strong>
                  Part {i + 1} of {n}
                </strong>
                <span className="dc-count" id={"dc-count-" + (i + 1)}>
                  {fmt(part.length)} / {fmt(limit)}
                </span>
                <button
                  type="button"
                  className="mini"
                  id={"dc-raw-" + (i + 1)}
                  aria-pressed={showRaw}
                  onClick={() => setRaw((r) => parts.map((_, j) => (j === i ? !showRaw : r[j] === true)))}
                >
                  Raw
                </button>
                <button
                  type="button"
                  className="btn"
                  id={"dc-copy-" + (i + 1)}
                  onClick={() => guard("Copy", () => void copy(i))}
                >
                  Copy part {i + 1}
                </button>
              </div>
              {showRaw ? (
                <textarea
                  className="code-area dc-raw"
                  readOnly
                  spellCheck={false}
                  aria-label={`Part ${i + 1} markdown`}
                  value={part}
                />
              ) : (
                <div className="dc-frame">
                  <div
                    className="dc-message"
                    // renderDiscordHtml escapes every piece of text; hrefs are http(s) only.
                    dangerouslySetInnerHTML={{ __html: renderDiscordHtml(part) }}
                  />
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
