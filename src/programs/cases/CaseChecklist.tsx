// Add checklist (LP-230): puts one of the firm's checklists on a case as open,
// unassigned next actions with no due date, skipping any already on the case.
// The list for the case's matter is picked to start with.

import { useState } from "react";
import { caseStore } from "@/lib/cases";
import { checklistFor, checklistsOrStarter, checklistStore, withChecklist } from "@/lib/checklists";
import { matterOf } from "@/lib/firmRecord";
import type { Case } from "@/lib/types";
import { useChecklistVersion } from "@/ui/useStore";

export default function CaseChecklist({ c }: { c: Case }) {
  useChecklistVersion();
  const lists = checklistsOrStarter(checklistStore().list());
  const [picked, setPicked] = useState("");
  const [status, setStatus] = useState("");
  const list = lists.find((l) => l.id === picked) || checklistFor(lists, matterOf(c));
  if (!list) return null;

  const add = () => {
    const r = withChecklist(c.actions || [], list);
    try {
      if (r.added) caseStore().save({ ...c, actions: r.actions });
      setStatus(
        (r.added ? "Added " + r.added + (r.added === 1 ? " action" : " actions") : "Nothing added") +
          (r.skipped ? "; " + r.skipped + " already on the case or no room." : "."),
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="row case-checklist" id="case-checklist">
      <select
        id="checklist-pick"
        aria-label="Checklist"
        value={list.id}
        onChange={(e) => {
          setPicked(e.target.value);
          setStatus("");
        }}
      >
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name + " (" + l.items.length + ")"}
          </option>
        ))}
      </select>
      <button type="button" className="btn" id="checklist-add" onClick={add}>
        Add checklist
      </button>
      <span className="small muted" role="status" id="checklist-status">
        {status}
      </span>
    </div>
  );
}
