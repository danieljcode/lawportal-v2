// HTML → Discord markdown for pasting into a Discord message.
//
// The engine's final HTML is converted into a small line-based IR (DiscordDoc)
// and then serialized. Inline formatting lives on runs and never crosses a line,
// so the splitter (discordSplit.ts) can cut anywhere between runs and still
// produce balanced spans. Every HTML text node is escaped: in the final HTML,
// the template's intended formatting lives only in tags, which map to markdown.
// Client-only by default (DOMParser); tests pass a jsdom parser.
//
// The converter lives in discord/ (LP-7): model.ts (types, constants), escape.ts,
// serialize.ts, dom.ts (reading the HTML), builder.ts (the line IR), tables.ts
// (code-block tables) and convert.ts (the walker and the API). This file
// re-exports the public API, so imports from "@/lib/discord" keep working.

export { htmlToDiscordDoc, toDiscord } from "./discord/convert";
export { headingFor } from "./discord/dom";
export { escapeMarkdown } from "./discord/escape";
export { MARKERS, RULE } from "./discord/model";
export type { DiscordDoc, DiscordOptions, DLine, Mark, Run, TablesMode } from "./discord/model";
export { serializeLine, serializeRuns } from "./discord/serialize";
