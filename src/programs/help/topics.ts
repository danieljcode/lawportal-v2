// Help's topics (LP-94): one Markdown file each in topics/, its first line "# Title". A topic
// named after a program is that program's "Help on" topic. A new topic is a file plus a line here.

import cases from "./topics/cases.md";
import characters from "./topics/characters.md";
import clients from "./topics/clients.md";
import control from "./topics/control.md";
import filings from "./topics/filings.md";
import find from "./topics/find.md";
import forum from "./topics/forum.md";
import help from "./topics/help.md";
import home from "./topics/home.md";
import jap from "./topics/jap.md";
import ledger from "./topics/ledger.md";
import library from "./topics/library.md";
import sync from "./topics/sync.md";
import themes from "./topics/themes.md";

export interface Topic {
  id: string;
  title: string;
  text: string;
  /** What a search looks in: the words, lowercase, without the Markdown or link addresses. */
  words: string;
}

const topic = (id: string, text: string): Topic => ({
  id,
  title: /^# (.+)/.exec(text)?.[1] ?? id,
  text,
  words: text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*`]/g, "")
    .toLowerCase(),
});

/** The Contents page's sections, in order. */
export const CONTENTS: readonly { heading: string; topics: readonly Topic[] }[] = [
  {
    heading: "Programs",
    topics: [
      topic("filings", filings),
      topic("cases", cases),
      topic("clients", clients),
      topic("library", library),
      topic("ledger", ledger),
      topic("find", find),
      topic("jap", jap),
      topic("control", control),
    ],
  },
  {
    heading: "How to",
    topics: [
      topic("home", home),
      topic("forum", forum),
      topic("characters", characters),
      topic("sync", sync),
      topic("themes", themes),
      topic("help", help),
    ],
  },
];

export const TOPICS: readonly Topic[] = CONTENTS.flatMap((s) => s.topics);

/** The topics holding every search word, ignoring case. */
export function searchTopics(terms: readonly string[]): Topic[] {
  return terms.length ? TOPICS.filter((t) => terms.every((w) => t.words.includes(w))) : [];
}
