// A run of checkbox options with inline detail inputs (reference checkRow).

import { useRef } from "react";
import { setValue, type ChecklistRow } from "@/lib/formState";
import FieldInput from "./FieldInput";
import { slugId, useFormCtx } from "./FormContext";
import type { ScopeProps } from "./ItemList";

function Row({ row, scope, path, prefix }: ScopeProps & { row: ChecklistRow }) {
  const { onState } = useFormCtx();
  const boxRef = useRef<HTMLSpanElement>(null);
  const { check: f, details, sub, text } = row;
  const id = slugId(prefix + f.label);
  const on = !!scope[f.label];
  const showDetails = on || details.some((d) => !!scope[d.label]);

  return (
    <div className={"check-row" + (sub ? " sub" : "") + (on ? " on" : "")}>
      <label htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={on}
          onChange={(e) => {
            const checked = e.target.checked;
            onState((s) => setValue(s, path, f.label, checked));
            if (checked && details.length) {
              // Focus the first detail once the row has re-rendered with it visible.
              setTimeout(() => boxRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus(), 0);
            }
          }}
        />
        <span>{text}</span>
      </label>
      {details.length > 0 && (
        <span className="check-detail" ref={boxRef} hidden={!showDetails}>
          {details.map((d) => (
            <FieldInput key={d.label} field={d} scope={scope} path={path} prefix={prefix} inline />
          ))}
        </span>
      )}
    </div>
  );
}

export default function Checklist({ rows, scope, path, prefix }: ScopeProps & { rows: ChecklistRow[] }) {
  return (
    <div className="checklist" role="group">
      {rows.map((row) => (
        <Row key={row.check.label} row={row} scope={scope} path={path} prefix={prefix} />
      ))}
    </div>
  );
}
