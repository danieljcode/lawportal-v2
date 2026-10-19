// An optional section (`{{?Name}}`) with its "Include:" checkbox (reference condInput).

import { setCond } from "@/lib/formState";
import type { CondEntry } from "@/lib/types";
import { slugId, useFormCtx } from "./FormContext";
import ItemList, { type ScopeProps } from "./ItemList";

export default function CondSection({ entry, scope, path, prefix }: ScopeProps & { entry: CondEntry }) {
  const { onState } = useFormCtx();
  const name = entry.cond.name;
  const key = "?" + name;
  const on = scope[key] === undefined ? entry.cond.on : !!scope[key];
  const id = slugId(prefix + key);

  return (
    <fieldset className="cond">
      <label className="field check cond-toggle" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={on}
          onChange={(e) => {
            const checked = e.target.checked;
            onState((s) => setCond(s, path, name, checked));
          }}
        />
        <span>
          Include: <strong>{name}</strong>
        </span>
      </label>
      {/* Conds share their parent's scope; a hidden body keeps its values. */}
      <div className="cond-body" hidden={!on}>
        <ItemList entries={entry.fields} scope={scope} path={path} prefix={prefix} />
      </div>
    </fieldset>
  );
}
