// Text with the search words marked (the Law Library's highlighting, LP-16/LP-17).
// React renders every piece as text, so nothing typed or imported becomes markup.

import { highlightParts } from "@/lib/precedents";

export default function Marked({ text, terms }: { text: string; terms: readonly string[] }) {
  return <>{highlightParts(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))}</>;
}
