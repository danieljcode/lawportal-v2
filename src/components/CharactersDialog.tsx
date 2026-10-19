// The Characters dialog (FR9, INV §a #characters-dialog): the sync panel, the
// storage note, the character list with its row actions, the New/Edit form,
// Export / Import, and the full backup and restore (LP-1).

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  backupFilename,
  backupText,
  countsOf,
  currentData,
  daysSinceBackup,
  needsBackupReminder,
  parseFile,
  restoreBackup,
  restorePreview,
} from "@/lib/backup";
import { checkFileSize, EXPORT_FILENAME, exportText, importedMessage, importText } from "@/lib/characterFile";
import { characterStore, FIELDS, hasDocket, titleKeepsDocket } from "@/lib/characters";
import { docketStore } from "@/lib/dockets";
import { portfolioStore } from "@/lib/portfolio";
import { backend, defaultKV, listSetAside } from "@/lib/storage";
import { S_STORAGE_LOCAL, S_STORAGE_MEMORY, S_STORAGE_SYNC } from "@/lib/strings";
import * as sync from "@/lib/sync";
import type { Character } from "@/lib/types";
import Dialog from "./Dialog";
import SyncPanel from "./SyncPanel";
import { useDocketVersion, useSetAsideVersion, useSyncState } from "./useStore";

export const DAMAGED_FILENAME = "court-filing-damaged-data.json";

/** "today", "yesterday" or "<n> days ago". */
function daysAgo(days: number): string {
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
}

function download(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface CharactersDialogProps {
  open: boolean;
  onClose(): void;
  characters: Character[];
  activeId: string | null;
  /** Open the Dockets dialog for a character (closes this one). */
  onDockets(charId: string): void;
  /** Turn sync on as soon as the dialog opens (J.A.P. "Turn on sync"). */
  autoSync?: boolean;
  onAutoSyncDone?(): void;
}

export default function CharactersDialog(p: CharactersDialogProps) {
  return (
    <Dialog open={p.open} onClose={p.onClose} id="characters-dialog" titleId="characters-title" title="Characters">
      <CharactersBody {...p} />
    </Dialog>
  );
}

type FormValues = Record<string, string | boolean>;

interface Editing {
  id: string | null;
  values: FormValues;
  /** The docket box follows the title until it is toggled by hand. */
  followTitle: boolean;
  error: string;
}

function startEdit(c: Character | null): Editing {
  const values: FormValues = {};
  for (const f of FIELDS) {
    if (f.checkbox) {
      values[f.key] = hasDocket(c);
    } else if (f.selectOptions) {
      const current = c && (c[f.key] as string | undefined);
      const firstVal = f.selectOptions[0]?.split(":")[0] || "";
      values[f.key] = current || firstVal;
    } else {
      values[f.key] = (c && (c[f.key] as string | undefined)) || "";
    }
  }
  return { id: c ? c.id : null, values, followTitle: !c || c.docket === undefined, error: "" };
}

function CharactersBody({ characters, activeId, onDockets, autoSync, onAutoSyncDone }: CharactersDialogProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useDocketVersion(); // the "Dockets (n)" counts follow docket changes
  useSyncState(); // the storage note follows sync on/off
  useSetAsideVersion(); // the download button appears once something is set aside
  const hasDamaged = listSetAside(defaultKV()).length > 0;

  const restoreRef = useRef<HTMLInputElement>(null);
  /** Bumped after a backup, so the note re-reads the backup date. */
  const [backupBump, setBackupBump] = useState(0);
  const days = backupBump >= 0 ? daysSinceBackup(defaultKV()) : null;
  const remind = needsBackupReminder(defaultKV());
  const backupNote =
    (days === null ? "No full backup made in this browser yet." : "Last full backup: " + daysAgo(days) + ".") +
    (remind
      ? " Sync is off, so a backup is the only copy of your work outside this browser: back up now and keep the file safe."
      : " A full backup holds characters, dockets, J.A.P., form drafts and settings.");

  const store = characterStore();
  const syncOn = !!sync.code();
  const storageNote = backend() === "memory" ? S_STORAGE_MEMORY : syncOn ? S_STORAGE_SYNC : S_STORAGE_LOCAL;

  const edit = (c: Character | null) => {
    setEditing(startEdit(c));
    // Focus the name field once the form has rendered.
    requestAnimationFrame(() => document.getElementById("char-name")?.focus());
  };

  const setField = (key: string, value: string | boolean) => {
    setEditing((e) => {
      if (!e) return e;
      const values = { ...e.values, [key]: value };
      let followTitle = e.followTitle;
      if (key === "docket") followTitle = false;
      else if (key === "title" && followTitle) values.docket = titleKeepsDocket(String(value));
      return { ...e, values, followTitle };
    });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      const saved = store.save({ ...editing.values, id: editing.id || undefined });
      if (!store.activeId()) store.setActive(saved.id);
      setEditing(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setEditing((x) => (x ? { ...x, error: message } : x));
    }
  };

  const remove = (c: Character) => {
    const n = docketStore().list(c.id).length;
    const what = n ? " and their " + n + " docket entr" + (n === 1 ? "y" : "ies") : "";
    if (!confirm("Delete " + c.name + what + "? This cannot be undone.")) return;
    store.remove(c.id);
    docketStore().removeAll(c.id);
    portfolioStore().remove(c.id);
    if (editing && editing.id === c.id) setEditing(null);
  };

  const exportFile = () => download(exportText(), EXPORT_FILENAME);

  // Each value exactly as it was stored, with where and when it was set aside.
  const downloadDamaged = () =>
    download(
      JSON.stringify({ app: "jsa-form-generator", setAside: listSetAside(defaultKV()) }, null, 2),
      DAMAGED_FILENAME,
    );

  // Full backup (LP-1): everything this browser has saved, in one file.
  const backUp = () => {
    const now = new Date();
    download(backupText(defaultKV(), now), backupFilename(now));
    setBackupBump((n) => n + 1);
  };

  const restoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      checkFileSize(file.size);
      const text = await file.text();
      const parsed = parseFile(text);
      if (parsed.kind === "characters") {
        // An older characters-only export: imported the usual way, merged by id.
        alert("That's a characters file, not a full backup. " + importedMessage(importText(text)));
        return;
      }
      const kv = defaultKV();
      const question = restorePreview(
        countsOf(currentData(kv)),
        countsOf(parsed.doc.data),
        parsed.doc.created,
        !!sync.code(),
      );
      if (!confirm(question)) return;
      restoreBackup(kv, parsed.doc);
      // Every store, the theme and the open form re-read what was restored.
      window.location.reload();
    } catch (err) {
      alert("Could not restore: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      input.value = "";
    }
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      checkFileSize(file.size);
      const n = importText(await file.text());
      alert(importedMessage(n));
    } catch (err) {
      alert("Could not import: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      input.value = "";
    }
  };

  return (
    <>
      <SyncPanel autoEnable={autoSync} onAutoEnableDone={onAutoSyncDone} />
      <p className="muted small" id="storage-note">
        {storageNote}
      </p>
      <div className="char-layout">
        <div>
          <ul className="char-list" id="char-list">
            {!characters.length && <li className="muted small">No characters yet.</li>}
            {characters.map((c, i) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id} className={isActive ? "current" : ""}>
                  <div className="char-name">
                    <strong>{c.name}</strong>
                    {c.title && <span className="muted small">{c.title}</span>}
                    {isActive && <span className="tag">active</span>}
                  </div>
                  <div className="char-actions">
                    {!isActive && (
                      <button type="button" className="mini" onClick={() => store.setActive(c.id)}>
                        Use
                      </button>
                    )}
                    <button type="button" className="mini" onClick={() => edit(c)}>
                      Edit
                    </button>
                    {hasDocket(c) && (
                      <button type="button" className="mini" onClick={() => onDockets(c.id)}>
                        {"Dockets (" + docketStore().list(c.id).length + ")"}
                      </button>
                    )}
                    <button type="button" className="mini" onClick={() => store.duplicate(c.id)}>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="mini"
                      aria-label={"Move " + c.name + " up"}
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => store.move(c.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="mini"
                      aria-label={"Move " + c.name + " down"}
                      title="Move down"
                      disabled={i === characters.length - 1}
                      onClick={() => store.move(c.id, 1)}
                    >
                      ↓
                    </button>
                    <button type="button" className="mini danger-quiet" onClick={() => remove(c)}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="row">
            <button type="button" className="btn primary" id="new-character" onClick={() => edit(null)}>
              New character
            </button>
          </div>
          <div className="row">
            <button type="button" className="btn" id="export-characters" onClick={exportFile}>
              Export
            </button>
            <button type="button" className="btn" id="import-button" onClick={() => fileRef.current?.click()}>
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              id="import-characters"
              accept="application/json,.json"
              aria-label="Import characters"
              hidden
              onChange={importFile}
            />
            {hasDamaged && (
              <button type="button" className="btn" id="download-damaged" onClick={downloadDamaged}>
                Download damaged data
              </button>
            )}
          </div>
          <div className="backup-box" id="backup-box">
            <p className={"small" + (remind ? " warn" : "")} id="backup-note">
              {backupNote}
            </p>
            <div className="row">
              <button type="button" className="btn" id="backup-all" onClick={backUp}>
                Back up everything
              </button>
              <button type="button" className="btn" id="restore-button" onClick={() => restoreRef.current?.click()}>
                Restore backup
              </button>
              <input
                ref={restoreRef}
                type="file"
                id="restore-file"
                accept="application/json,.json"
                aria-label="Restore backup"
                hidden
                onChange={restoreFile}
              />
            </div>
          </div>
        </div>
        {editing && (
          <form id="char-form" className="char-form" noValidate onSubmit={save} aria-labelledby="char-form-title">
            <h3 id="char-form-title">
              {editing.id ? "Edit " + (store.get(editing.id)?.name || "character") : "New character"}
            </h3>
            <div id="char-fields">
              {FIELDS.map((f) => {
                const fid = "char-" + f.key;
                const help = f.hint ? (
                  <p className="help" id={fid + "-help"}>
                    {f.hint}
                  </p>
                ) : null;
                if (f.checkbox) {
                  return (
                    <div className="field" key={f.key}>
                      <label className="field check" htmlFor={fid}>
                        <input
                          id={fid}
                          name={f.key}
                          type="checkbox"
                          checked={!!editing.values[f.key]}
                          aria-describedby={f.hint ? fid + "-help" : undefined}
                          onChange={(e) => setField(f.key, e.target.checked)}
                        />
                        <span>{f.label}</span>
                      </label>
                      {help}
                    </div>
                  );
                }
                const common = {
                  id: fid,
                  name: f.key,
                  value: String(editing.values[f.key] || ""),
                  "aria-describedby": f.hint ? fid + "-help" : undefined,
                };
                if (f.selectOptions) {
                  return (
                    <div className="field" key={f.key}>
                      <label htmlFor={fid}>{f.label}</label>
                      <select {...common} onChange={(e) => setField(f.key, e.target.value)}>
                        {f.selectOptions.map((o) => {
                          const [val, label] = o.split(":");
                          return (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      {help}
                    </div>
                  );
                }
                return (
                  <div className="field" key={f.key}>
                    <label htmlFor={fid}>{f.label + (f.required ? " *" : "")}</label>
                    {f.multiline ? (
                      <textarea {...common} rows={3} onChange={(e) => setField(f.key, e.target.value)} />
                    ) : (
                      <input
                        {...common}
                        type="text"
                        required={f.required}
                        aria-required={f.required || undefined}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                    )}
                    {help}
                  </div>
                );
              })}
            </div>
            <p className="error" id="char-error" role="alert">
              {editing.error}
            </p>
            <div className="row">
              <button className="btn primary" type="submit">
                Save
              </button>
              <button className="btn" type="button" id="cancel-character" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
