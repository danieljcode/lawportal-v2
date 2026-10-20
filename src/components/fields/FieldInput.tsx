// One field input, following the reference fieldInput (INV §a "Field inputs by type").

import { useRef } from "react";
import { FIELDS as CHARACTER_FIELDS } from "@/lib/characters";
import { exhibitMarker } from "@/lib/exhibits";
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

/** Fields that take an "Insert exhibit" reference (LP-13): the written boxes, not names, dates or links. */
const TAKES_EXHIBITS = /^(textarea|list|paras)$/;

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
  const { entries, onState, now, required, exhibits } = useFormCtx();
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const id = slugId(prefix + f.label);
  const raw = scope[f.label];
  const value = typeof raw === "string" ? raw : "";
  const hint = plain(f.fallback);
  // Required and still empty (LP-87): a quiet tag by the label, and the copy buttons warn.
  const missing = f.type !== "check" && required.has(f.label) && !value.trim();

  const change = (v: string | boolean) =>
    onState((s) => {
      const next = setValue(s, path, f.label, v);
      // Dates computed from this one (e.g. a schedule from the judgement) follow it,
      // using the server-offset `now` so a reflow stays on the active server's year.
      return hasDependents(entries, next.values, f.label) ? applyPrefills(entries, next, now) : next;
    }, id);

  // Prefilled case numbers end in XXX: select it so typing replaces just that part.
  const selectXXX = () => {
    const input = inputRef.current;
    if (!input) return;
    const i = input.value.lastIndexOf("XXX");
    if (i >= 0 && input.selectionStart === input.selectionEnd) input.setSelectionRange(i, i + 3);
  };

  // The exhibit list (LP-13) comes from the case's evidence; nothing to type.
  if (f.character === "exhibits") {
    return (
      <div className="field wide">
        <label>{f.label}</label>
        <p className="help" id={id}>
          {exhibits.length
            ? "From the case's evidence: " + exhibits.length + (exhibits.length === 1 ? " exhibit." : " exhibits.")
            : "Filled from the evidence of the case with this case number. Add exhibits in the Case File."}
        </p>
      </div>
    );
  }

  // Insert a reference at the cursor (or in place of the selection); it keeps the exhibit's id.
  const insertExhibit = (exhibitId: string) => {
    const ref = exhibits.find((e) => e.id === exhibitId);
    if (!ref) return;
    const el = areaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const marker = exhibitMarker(ref);
    change(value.slice(0, start) + marker + value.slice(end));
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + marker.length, start + marker.length);
    }, 0);
  };

  let input: React.ReactElement;
  switch (f.type) {
    case "textarea":
    case "list":
    case "spoiler":
    case "paras":
      input = (
        <textarea
          ref={areaRef}
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
  const picker =
    exhibits.length > 0 && TAKES_EXHIBITS.test(f.type) ? (
      <select
        className="exhibit-insert"
        aria-label={"Insert exhibit into " + f.label}
        value=""
        onChange={(e) => insertExhibit(e.target.value)}
      >
        <option value="">Insert exhibit…</option>
        {exhibits.map((e) => (
          <option key={e.id} value={e.id}>
            {"Exhibit " + e.letter + " (" + e.title + ")"}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <div className={"field" + (MULTILINE.test(f.type) ? " wide" : "") + (missing ? " missing" : "")}>
      <label htmlFor={id}>
        {f.label}
        {missing && <span className="tag req">Required</span>}
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
      {picker && <div className="row">{picker}</div>}
      {help && <p className="help">{help}</p>}
    </div>
  );
}
