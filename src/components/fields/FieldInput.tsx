// One field input, following the reference fieldInput (INV §a "Field inputs by type").

import { useRef } from "react";
import { FIELDS as CHARACTER_FIELDS } from "@/lib/characters";
import { applyPrefills, autoDate, hasDependents, setValue, todayDate } from "@/lib/formState";
import { plain } from "@/lib/template";
import type { Field } from "@/lib/types";
import { slugId, useFormCtx } from "./FormContext";
import type { ScopeProps } from "./ItemList";

const HELP: Partial<Record<Field["type"], string>> = {
  paras: "Each line becomes its own paragraph.",
  list: "One item per line.",
  spoiler: "Paste links (images show inline) or text, one per line. Goes inside a spoiler.",
  image: "Link to an image, or plain text.",
};

const MULTILINE = /^(textarea|list|spoiler|paras)$/;

function characterTag(key: string): string {
  return CHARACTER_FIELDS.find((c) => c.key === key)?.label || key;
}

export default function FieldInput({
  field: f,
  scope,
  path,
  prefix,
  inline,
}: ScopeProps & { field: Field; inline?: boolean }) {
  const { entries, onState, now } = useFormCtx();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = slugId(prefix + f.label);
  const raw = scope[f.label];
  const value = typeof raw === "string" ? raw : "";
  const hint = plain(f.fallback);

  const change = (v: string | boolean) =>
    onState((s) => {
      const next = setValue(s, path, f.label, v);
      // Dates computed from this one (e.g. a schedule from the judgement) follow it,
      // using the server-offset `now` so a reflow stays on the active server's year.
      return hasDependents(entries, next.values, f.label) ? applyPrefills(entries, next, now) : next;
    });

  // Prefilled case numbers end in XXX: select it so typing replaces just that part.
  const selectXXX = () => {
    const input = inputRef.current;
    if (!input) return;
    const i = input.value.lastIndexOf("XXX");
    if (i >= 0 && input.selectionStart === input.selectionEnd) input.setSelectionRange(i, i + 3);
  };

  let input: React.ReactElement;
  switch (f.type) {
    case "textarea":
    case "list":
    case "spoiler":
    case "paras":
      input = (
        <textarea
          id={id}
          rows={f.type === "textarea" || f.type === "paras" ? 5 : 3}
          placeholder={hint.slice(0, 160)}
          value={value}
          aria-label={inline ? f.label : undefined}
          onChange={(e) => change(e.target.value)}
        />
      );
      break;
    case "select":
      input = (
        <select
          id={id}
          value={value}
          aria-label={inline ? f.label : undefined}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">{hint ? "— keep “" + hint.slice(0, 40) + "” —" : "—"}</option>
          {/* A value from elsewhere (a loaded docket) that isn't an option is still shown, not blanked. */}
          {(value && !f.options.includes(value) ? [...f.options, value] : f.options).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "check":
      return (
        <label className="field check">
          <input id={id} type="checkbox" checked={!!raw} onChange={(e) => change(e.target.checked)} />
          <span>{f.label}</span>
        </label>
      );
    case "date":
      input = (
        <input
          id={id}
          type="date"
          value={value}
          aria-label={inline ? f.label : undefined}
          onChange={(e) => change(e.target.value)}
        />
      );
      break;
    default:
      input = (
        <input
          ref={inputRef}
          id={id}
          type={f.type === "url" || f.type === "image" ? "url" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          list={/name/i.test(f.label) ? "character-names" : undefined}
          placeholder={inline ? f.label : hint.slice(0, 120)}
          aria-label={inline ? f.label : undefined}
          value={value}
          onChange={(e) => change(e.target.value)}
          onFocus={f.prefill ? () => setTimeout(selectXXX, 0) : undefined}
          onMouseUp={f.prefill ? selectXXX : undefined}
        />
      );
  }

  // Inside a checkbox row: no label above, the field name as placeholder.
  if (inline) return input;

  const buttons: React.ReactElement[] = [];
  if (f.type === "date") {
    buttons.push(
      <button
        key="today"
        type="button"
        className="mini"
        onClick={() => onState((s) => todayDate(entries, s, path, f.label, now))}
      >
        Today
      </button>,
    );
    if (f.prefill) {
      buttons.push(
        <button
          key="auto"
          type="button"
          className="mini"
          title={"Recalculate (" + f.prefill + ")"}
          onClick={() => onState((s) => autoDate(entries, s, path, f.label, now))}
        >
          Auto
        </button>,
      );
    }
  }
  const help = HELP[f.type];

  return (
    <div className={"field" + (MULTILINE.test(f.type) ? " wide" : "")}>
      <label htmlFor={id}>
        {f.label}
        {f.character && (
          <span className="tag" title="Filled from the active character">
            {characterTag(f.character)}
          </span>
        )}
      </label>
      {buttons.length ? (
        <div className="inline">
          {input}
          {buttons}
        </div>
      ) : (
        input
      )}
      {help && <p className="help">{help}</p>}
    </div>
  );
}
