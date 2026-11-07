// The firm's next-action checklists in Settings (LP-230): pick one, rename it,
// set its matter, and add, remove and reorder its items. Each change saves
// straight away and syncs. The first change turns the starter lists into the
// firm's own; "Back to the starter lists" undoes every change.

import { useState, type FormEvent } from "react";
import { checklistsOrStarter, checklistStore, MAX_CHECKLIST_ITEMS, type Checklist } from "@/lib/checklists";
import { MATTERS } from "@/lib/firmRecord";
import { useChecklistVersion } from "@/ui/useStore";

export default function ChecklistSettings() {
  useChecklistVersion();
  const own = checklistStore().list();
  const lists = checklistsOrStarter(own);
  const [picked, setPicked] = useState("");
  const [name, setName] = useState<{ id: string; value: string } | null>(null);
  const [item, setItem] = useState("");
  const [error, setError] = useState("");
  const list = lists.find((l) => l.id === picked) || lists[0];

  const save = (input: Partial<Checklist>): Checklist | null => {
    try {
      const c = checklistStore().save(input);
      setError("");
      return c;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };
  const setItems = (items: string[]) => save({ ...list, items });
  const move = (i: number, by: number) => {
    const items = [...list.items];
    [items[i], items[i + by]] = [items[i + by], items[i]];
    setItems(items);
  };
  const addItem = (e: FormEvent) => {
    e.preventDefault();
    const title = item.trim();
    if (!title) return setError("Write the next action, like Call the client.");
    if (list.items.some((x) => x.toLowerCase() === title.toLowerCase())) return setError("That's already on the list.");
    if (setItems([...list.items, title])) setItem("");
  };

  return (
    <>
      <p className="muted">
        {"Routine next actions for each kind of case. Add checklist under a case's Next actions puts them on the case."}
      </p>
      <ul className="control-items letterhead-fields">
        <li>
          <label className="control-theme">
            <span>Checklist</span>
            <select id="checklists-pick" value={list.id} onChange={(e) => setPicked(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            id="checklists-new"
            onClick={() => {
              const c = save({ name: "New checklist", matter: "Other", items: [] });
              if (c) setPicked(c.id);
            }}
          >
            New checklist
          </button>
        </li>
        <li>
          <label className="control-theme">
            <span>Name</span>
            <input
              id="checklists-name"
              type="text"
              maxLength={80}
              value={name && name.id === list.id ? name.value : list.name}
              onChange={(e) => {
                setName({ id: list.id, value: e.target.value });
                if (e.target.value.trim()) save({ ...list, name: e.target.value });
                else setError("Give the checklist a name, like Criminal defence.");
              }}
            />
          </label>
        </li>
        <li>
          <label className="control-theme">
            <span>Matter</span>
            <select
              id="checklists-matter"
              value={list.matter}
              onChange={(e) => save({ ...list, matter: e.target.value })}
            >
              {[...new Set([...MATTERS, list.matter])].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </li>
      </ul>
      {list.items.length ? (
        <ol className="checklist-items" id="checklists-items">
          {list.items.map((x, i) => (
            <li key={x}>
              <span>{x}</span>
              <button
                type="button"
                className="mini"
                aria-label={"Move up: " + x}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="mini"
                aria-label={"Move down: " + x}
                disabled={i === list.items.length - 1}
                onClick={() => move(i, 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="mini danger-quiet"
                aria-label={"Remove: " + x}
                onClick={() => setItems(list.items.filter((y) => y !== x))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="small muted">No items yet.</p>
      )}
      {list.items.length < MAX_CHECKLIST_ITEMS && (
        <form className="row checklist-add" id="checklists-add" noValidate onSubmit={addItem} aria-label="Add an item">
          <input
            type="text"
            id="checklists-item"
            maxLength={120}
            placeholder="Call the client, File the answer…"
            aria-label="New item"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
          <button type="submit" className="btn">
            Add item
          </button>
        </form>
      )}
      <p className="row checklist-manage">
        <button
          type="button"
          className="btn"
          id="checklists-remove"
          onClick={() => {
            if (!window.confirm("Remove the " + list.name + " checklist?")) return;
            checklistStore().remove(list.id);
            setPicked("");
          }}
        >
          Remove checklist
        </button>
        {own.length > 0 && (
          <button
            type="button"
            className="btn"
            id="checklists-reset"
            onClick={() => {
              if (!window.confirm("Go back to the starter checklists? Every change to them is lost.")) return;
              checklistStore().reset();
              setPicked("");
            }}
          >
            Back to the starter lists
          </button>
        )}
      </p>
      <p className="error" role="alert" id="checklists-error">
        {error}
      </p>
    </>
  );
}
