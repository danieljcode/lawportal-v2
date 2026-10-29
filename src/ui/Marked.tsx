// Text with the search words marked (the Law Library and the Rolodex, LP-16/LP-17/LP-30).
// React renders every piece as text, so nothing typed or imported becomes markup.

import { highlightParts } from "@/lib/precedents";

export default function Marked({ text, terms }: { text: string; terms: readonly string[] }) {
  return <>{highlightParts(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))}</>;
}
