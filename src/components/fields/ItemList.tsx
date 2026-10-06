// Renders one layout() list (a section body, a block item or a cond body).
// Grouping comes only from layout(); this file just maps items to components.

import type { ScopePath } from "@/lib/formState";
import { layout } from "@/lib/formState";
import type { Entry, Values } from "@/lib/types";
import BlockEditor from "./BlockEditor";
import Checklist from "./Checklist";
import CondSection from "./CondSection";
import FieldInput from "./FieldInput";

export interface ScopeProps {
  /** The values object this list reads (the form values, or a block item). */
  scope: Values;
  path: ScopePath;
  /** Id prefix: "" at the top, then `<block><i>-` per block level. */
  prefix: string;
}

export default function ItemList({ entries, scope, path, prefix }: ScopeProps & { entries: Entry[] }) {
  return (
    <>
      {layout(entries).map((item, i) => {
        switch (item.kind) {
          case "checklist":
            return <Checklist key={i} rows={item.rows} scope={scope} path={path} prefix={prefix} />;
          case "field":
            return <FieldInput key={i} field={item.field} scope={scope} path={path} prefix={prefix} />;
          case "block":
            return <BlockEditor key={i} entry={item.entry} scope={scope} path={path} prefix={prefix} />;
          case "cond":
            return <CondSection key={i} entry={item.entry} scope={scope} path={path} prefix={prefix} />;
        }
      })}
    </>
  );
}
