// The little Markdown Help's topics are written in (LP-94): # to ### headings, paragraphs,
// "- " and "1. " lists, **bold**, `code` and [links](#help/topic). React renders every piece as
// text, so nothing in a topic becomes markup; a link goes only to a hash in the app or https.

import { createElement, type ReactNode } from "react";

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    out.push(text.slice(at, m.index));
    const key = out.length;
    if (m[1] !== undefined) out.push(<strong key={key}>{inline(m[1])}</strong>);
    else if (m[2] !== undefined) out.push(<code key={key}>{m[2]}</code>);
    else if (m[4].startsWith("#"))
      out.push(
        <a key={key} href={m[4]}>
          {m[3]}
        </a>,
      );
    else if (m[4].startsWith("https://"))
      out.push(
        <a key={key} href={m[4]} target="_blank" rel="noreferrer">
          {m[3]}
        </a>,
      );
    else out.push(m[3]);
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

/** A list's items: each starts with its marker; a line without one continues the item before. */
const items = (block: string, marker: RegExp) =>
  block
    .split(new RegExp("\\n(?=" + marker.source + ")"))
    .map((it, i) => <li key={i}>{inline(it.replace(marker, "").replace(/\s*\n\s*/g, " "))}</li>);

export default function Markdown({ text }: { text: string }) {
  return (
    <>
      {text
        .replace(/\r\n?/g, "\n") // a Windows checkout's line endings
        .trim()
        .split(/\n\s*\n/)
        .map((block, i) => {
          const h = /^(#{1,3}) (.+)$/.exec(block);
          // "#" is the topic's title, under the program's own heading.
          if (h) return createElement("h" + (h[1].length + 1), { key: i }, inline(h[2]));
          if (/^- /.test(block)) return <ul key={i}>{items(block, /- /)}</ul>;
          if (/^\d+\. /.test(block)) return <ol key={i}>{items(block, /\d+\. /)}</ol>;
          return <p key={i}>{inline(block.replace(/\s*\n\s*/g, " "))}</p>;
        })}
    </>
  );
}
