// The template builder (LP-49, #filings/edit/<new|id>): a title and a list of
// blocks (heading, paragraph, field, repeating list, signature) the firm adds,
// moves and deletes, with a live preview of the filing. Saving keeps it under
// My Templates in the forms list (synced, in the backup) and opens it as a form.
// #filings/edit/copy/<formId> (LP-225) starts from a form: its wording as
// paragraphs, the rest as fixed Original text blocks whose fields can be renamed.

import { Fragment, useMemo, useState, type FormEvent } from "react";
import { copyOfForm, originalFields, originalGlimpse, templateHtml } from "@/data/myTemplates";
import {
  MAX_BLOCKS,
  MY_PREFIX,
  templateStore,
  type BlockFieldType,
  type BlockKind,
  type TemplateBlock,
} from "@/lib/customTemplates";
import { compile, render } from "@/lib/template";
import { navigate } from "@/shell/useRoute";

type AddKind = Exclude<BlockKind, "original">;
const ADD: Array<[AddKind, string]> = [
  ["heading", "Heading"],
  ["paragraph", "Paragraph"],
  ["field", "Field"],
  ["list", "Repeating list"],
  ["signature", "Signature"],
];
const KIND_NAME = { ...Object.fromEntries(ADD), original: "Original text" } as Record<BlockKind, string>;
const FIELD_TYPE_NAMES: Record<BlockFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  date: "Date",
  number: "Number",
};
const NEW_BLOCK: Record<AddKind, TemplateBlock> = {
  heading: { kind: "heading", text: "" },
  paragraph: { kind: "paragraph", text: "" },
  field: { kind: "field", text: "", type: "text" },
  list: { kind: "list", text: "" },
  signature: { kind: "signature", text: "Attorney" },
};

function BlockEditor({ b, i, set }: { b: TemplateBlock; i: number; set: (b: TemplateBlock) => void }) {
  const id = "tb-block-" + i;
  if (b.kind === "original") {
    return (
      <p className="small muted tb-glimpse" id={id}>
        {originalGlimpse(b)}
      </p>
    );
  }
  const label = { heading: "Heading", paragraph: "Text", field: "Label", list: "Name", signature: "Role" }[b.kind];
  return (
    <div className="tb-fields">
      <label htmlFor={id}>{label}</label>
      {b.kind === "paragraph" ? (
        <textarea
          id={id}
          rows={4}
          maxLength={4000}
          value={b.text}
          onChange={(e) => set({ ...b, text: e.target.value })}
        />
      ) : (
        <input
          id={id}
          type="text"
          maxLength={120}
          value={b.text}
          placeholder={b.kind === "field" ? "Defendant name" : b.kind === "list" ? "Allegations" : undefined}
          onChange={(e) => set({ ...b, text: e.target.value })}
        />
      )}
      {b.kind === "field" && (
        <>
          <label htmlFor={id + "-type"}>Answer</label>
          <select
            id={id + "-type"}
            value={b.type || "text"}
            onChange={(e) => set({ ...b, type: e.target.value as BlockFieldType })}
          >
            {Object.entries(FIELD_TYPE_NAMES).map(([v, name]) => (
              <option key={v} value={v}>
                {name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

export default function TemplateBuilder({ edit }: { edit: string }) {
  const copyFrom = edit.startsWith("copy/") ? edit.slice(5) : null;
  const existing = edit === "new" || copyFrom ? undefined : templateStore().get(edit);
  // useState keeps the first one, so the copy is only made once.
  const [start] = useState(() => existing || (copyFrom ? copyOfForm(copyFrom) : undefined));
  const [title, setTitle] = useState(start ? start.title : "");
  const [blocks, setBlocks] = useState<TemplateBlock[]>(start ? start.blocks : []);
  const [renames, setRenames] = useState<Record<string, string>>(start?.renames || {});
  const source = start?.source;
  const [error, setError] = useState("");
  const fields = useMemo(() => originalFields({ blocks }), [blocks]);

  const preview = useMemo(() => {
    try {
      return render(compile(templateHtml({ title: title.trim() || "Untitled template", blocks, source, renames })));
    } catch {
      return null;
    }
  }, [title, blocks, source, renames]);

  if (edit !== "new" && !start) {
    return (
      <section className="form-view" id="template-builder">
        <h2>Template builder</h2>
        <p className="muted">
          {copyFrom
            ? "That form isn't available to copy."
            : "That template is gone. It may have been deleted on another device."}
        </p>
        <p>
          <a className="btn" href="#filings/edit/new">
            New template
          </a>
        </p>
      </section>
    );
  }

  const setAt = (i: number, b: TemplateBlock) => setBlocks(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, by: number) => {
    const next = [...blocks];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setBlocks(next);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      const t = templateStore().save({ id: existing?.id, title, blocks, source, renames });
      navigate("#filings/" + MY_PREFIX + t.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="form-view template-builder" id="template-builder" aria-labelledby="tb-title-head">
      <div className="form-head">
        <div>
          <p className="crumb muted">My Templates</p>
          <h2 id="tb-title-head">{existing ? "Edit template" : copyFrom ? "Make my own version" : "New template"}</h2>
        </div>
      </div>
      <form id="tb-form" noValidate onSubmit={save}>
        <p className="tb-fields">
          <label htmlFor="tb-title">Title</label>
          <input
            id="tb-title"
            type="text"
            maxLength={120}
            placeholder="MOTION TO CONTINUE"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </p>
        {blocks.length ? (
          <ol className="tb-blocks" id="tb-blocks">
            {blocks.map((b, i) => (
              <li key={i} className={"tb-block tb-" + b.kind}>
                <div className="row tb-block-head">
                  <strong>{KIND_NAME[b.kind]}</strong>
                  <span className="tb-moves">
                    <button
                      type="button"
                      className="mini"
                      aria-label={"Move up: block " + (i + 1)}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="mini"
                      aria-label={"Move down: block " + (i + 1)}
                      disabled={i === blocks.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="mini danger-quiet"
                      aria-label={"Delete: block " + (i + 1)}
                      onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}
                    >
                      Delete
                    </button>
                  </span>
                </div>
                <BlockEditor b={b} i={i} set={(nb) => setAt(i, nb)} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="small muted">No blocks yet. Add a heading, some text and the fields to fill in.</p>
        )}
        {fields.length > 0 && (
          <fieldset className="tb-renames" id="tb-renames">
            <legend>Fields in the original text</legend>
            <p className="small muted">Rename a field here; it keeps how it fills in.</p>
            <div className="tb-fields">
              {fields.map((l, i) => (
                <Fragment key={l}>
                  <label htmlFor={"tb-rename-" + i}>{l}</label>
                  <input
                    id={"tb-rename-" + i}
                    type="text"
                    maxLength={80}
                    value={renames[l] ?? l}
                    onChange={(e) => setRenames({ ...renames, [l]: e.target.value })}
                  />
                </Fragment>
              ))}
            </div>
          </fieldset>
        )}
        {blocks.length < MAX_BLOCKS && (
          <p className="row tb-add" role="group" aria-label="Add a block">
            <span className="small muted">Add:</span>
            {ADD.map(([kind, name]) => (
              <button
                key={kind}
                type="button"
                className="btn"
                id={"tb-add-" + kind}
                onClick={() => setBlocks([...blocks, NEW_BLOCK[kind]])}
              >
                {name}
              </button>
            ))}
          </p>
        )}
        <p className="row tb-actions">
          <button type="submit" className="btn primary" id="tb-save">
            Save template
          </button>
          <a
            className="btn"
            href={existing ? "#filings/" + MY_PREFIX + existing.id : copyFrom ? "#filings/" + copyFrom : "#filings"}
          >
            Cancel
          </a>
          {existing && (
            <button
              type="button"
              className="btn"
              id="tb-delete"
              onClick={() => {
                if (!window.confirm("Delete the " + existing.title + " template?")) return;
                templateStore().remove(existing.id);
                navigate("#filings");
              }}
            >
              Delete template
            </button>
          )}
        </p>
        <p className="error" role="alert" id="tb-error">
          {error}
        </p>
      </form>
      <h3>Preview</h3>
      <div className="post-frame">
        {preview === null ? (
          <p className="error">This template can&apos;t be shown.</p>
        ) : (
          // Engine output only: the firm's words are escaped by templateHtml.
          <div className="preview post" id="tb-preview" dangerouslySetInnerHTML={{ __html: preview }} />
        )}
      </div>
    </section>
  );
}
