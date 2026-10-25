// The form split into collapsible group boxes at each `{{-- Name}}` marker (reference renderSections).

import { sectionMeta, type Segment } from "@/lib/formState";
import type { Values } from "@/lib/types";
import ItemList from "./ItemList";

export interface SectionsProps {
  segments: Segment[];
  values: Values;
  collapsed: ReadonlySet<string>;
  onToggle(name: string, open: boolean): void;
}

function metaText(m: { filled: number; total: number; ticked: number }): string {
  const parts: string[] = [];
  if (m.total) parts.push(m.filled + " of " + m.total + " filled");
  if (m.ticked) parts.push(m.ticked + " ticked");
  return parts.join(" · ");
}

export default function Sections({ segments, values, collapsed, onToggle }: SectionsProps) {
  return (
    <>
      {segments.map((sg) => {
        const meta = sectionMeta(sg.entries, values);
        const text = metaText(meta);
        return (
          <details
            key={sg.name}
            className={"section" + (meta.done ? " done" : "")}
            open={!collapsed.has(sg.name)}
            onToggle={(e) => onToggle(sg.name, e.currentTarget.open)}
          >
            <summary>
              <span className="section-title">{sg.name}</span>
              {text && <span className="section-meta">{text}</span>}
            </summary>
            <div className="section-body">
              <ItemList entries={sg.entries} scope={values} path={[]} prefix="" />
            </div>
          </details>
        );
      })}
    </>
  );
}
