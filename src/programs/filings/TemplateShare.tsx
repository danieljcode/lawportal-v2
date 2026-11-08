// Share templates (LP-50, #filings/edit/share): download some of the firm's own templates
// as a .lawtpl.json file, or read one, see each template before adding it, and choose
// what to do when one has the same title as a template already here.

import { useMemo, useState, type ChangeEvent } from "react";
import { getForm } from "@/data";
import { addImported, exportFile, exportName, readFile, type ClashChoice, type Incoming } from "@/data/shareTemplates";
import { templateHtml } from "@/data/myTemplates";
import { templateStore } from "@/lib/customTemplates";
import { download } from "@/lib/download";
import { compile, render } from "@/lib/template";
import { useTemplateVersion } from "@/ui/useStore";

function Preview({ it }: { it: Incoming }) {
  const html = useMemo(() => {
    try {
      return render(compile(templateHtml(it.template)));
    } catch {
      return null;
    }
  }, [it]);
  return html === null ? (
    <p className="error">This template can&apos;t be shown.</p>
  ) : (
    // Engine output only: the template's words are escaped by templateHtml.
    <div className="preview post" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default function TemplateShare() {
  const version = useTemplateVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the store's version
  const mine = useMemo(() => templateStore().list(), [version]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const picked = mine.filter((t) => !off.has(t.id));

  const [incoming, setIncoming] = useState<Incoming[] | null>(null);
  const [choices, setChoices] = useState<Record<number, ClashChoice>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const addable = (incoming || []).filter((it, i) => !it.problem && choices[i] !== "skip").length;

  const toggle = (id: string) => {
    const next = new Set(off);
    if (!next.delete(id)) next.add(id);
    setOff(next);
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setError("");
    setDone("");
    setIncoming(null);
    setChoices({});
    if (!file) return;
    try {
      setIncoming(readFile(await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const add = () => {
    try {
      const n = addImported(incoming || [], choices);
      setIncoming(null);
      setChoices({});
      setDone(n === 1 ? "Added 1 template to My Templates." : `Added ${n} templates to My Templates.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="form-view template-builder" id="template-share" aria-labelledby="share-head">
      <div className="form-head">
        <div>
          <p className="crumb muted">My Templates</p>
          <h2 id="share-head">Share templates</h2>
        </div>
      </div>

      <h3>Export</h3>
      {mine.length ? (
        <>
          <ul className="share-list" id="share-mine">
            {mine.map((t) => (
              <li key={t.id}>
                <label>
                  <input type="checkbox" checked={!off.has(t.id)} onChange={() => toggle(t.id)} /> {t.title}
                </label>
              </li>
            ))}
          </ul>
          <p className="row">
            <button
              type="button"
              className="btn primary"
              id="share-export"
              disabled={!picked.length}
              onClick={() => download(exportFile(picked), exportName(picked))}
            >
              {picked.length === 1 ? "Download 1 template" : `Download ${picked.length} templates`}
            </button>
          </p>
          <p className="small muted">Send the file to another player; they import it here.</p>
        </>
      ) : (
        <p className="small muted">You have no templates yet. Make one with + New template.</p>
      )}

      <h3>Import</h3>
      <p className="tb-fields">
        <label htmlFor="share-file">Template file (.lawtpl.json)</label>
        <input id="share-file" type="file" accept=".json,application/json" onChange={pickFile} />
      </p>
      <p className="error" role="alert" id="share-error">
        {error}
      </p>
      <p className="small" role="status" id="share-done">
        {done}
      </p>
      {incoming && (
        <>
          <ol className="tb-blocks" id="share-incoming">
            {incoming.map((it, i) => {
              const source = it.template.source && getForm(it.template.source);
              return (
                <li key={i} className="tb-block">
                  <div className="row tb-block-head">
                    <strong>{it.template.title}</strong>
                    <span className="small muted">
                      {source ? "My version of " + source.title : "Own template"} · {it.template.blocks.length}{" "}
                      {it.template.blocks.length === 1 ? "block" : "blocks"}
                    </span>
                  </div>
                  {it.problem ? (
                    <p className="error" id={"share-problem-" + i}>
                      Can&apos;t be added. {it.problem}
                    </p>
                  ) : (
                    <>
                      {it.clash && (
                        <p className="tb-fields">
                          <label htmlFor={"share-clash-" + i}>You already have {it.clash.title}</label>
                          <select
                            id={"share-clash-" + i}
                            value={choices[i] || "rename"}
                            onChange={(e) => setChoices({ ...choices, [i]: e.target.value as ClashChoice })}
                          >
                            <option value="rename">Add it with a new name</option>
                            <option value="replace">Replace mine</option>
                            <option value="skip">Skip it</option>
                          </select>
                        </p>
                      )}
                      <details>
                        <summary>Preview</summary>
                        <div className="post-frame">
                          <Preview it={it} />
                        </div>
                      </details>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="row tb-actions">
            <button type="button" className="btn primary" id="share-import" disabled={!addable} onClick={add}>
              {addable === 1 ? "Add 1 template" : `Add ${addable} templates`}
            </button>
            <button type="button" className="btn" onClick={() => setIncoming(null)}>
              Cancel
            </button>
          </p>
        </>
      )}
    </section>
  );
}
