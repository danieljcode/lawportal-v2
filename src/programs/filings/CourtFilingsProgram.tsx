// The Court Filings program (LP-103, LP-105): the court forms as its navigation
// pane, the open form (or the "pick a form" page) and its forum preview. The
// output of the open form, and whether its panel crashed, live here; the form's
// filing tools go up to the shell's Form menu.

import { useCallback, useState } from "react";
import { ALL_FORMS, getForm } from "@/data";
import { EMPTY_HTML } from "@/lib/safeHtml";
import EmptyState from "./EmptyState";
import ErrorBoundary from "@/ui/ErrorBoundary";
import FormView, { type FormOutput } from "./FormView";
import OutputPane from "./OutputPane";
import Sidebar from "./Sidebar";
import { hashFor } from "@/shell/useRoute";
import type { ProgramProps } from "@/shell/program";

const EMPTY_OUTPUT: FormOutput = {
  finalHtml: EMPTY_HTML,
  previewHtml: EMPTY_HTML,
  missing: [],
  jumpTo: () => {},
  onFiled: () => {},
};

export default function CourtFilingsProgram({ shell }: ProgramProps) {
  const { active } = shell;
  // The shell knows the open form only by its index entry (LP-133); its template comes with this program.
  const form = shell.form ? getForm(shell.form.id) || null : null;
  const [highlight, setHighlight] = useState(true);
  /** The last output FormView reported, with the form it belongs to (out is null when that template failed to compile). */
  const [output, setOutput] = useState<{ formId: string; out: FormOutput | null } | null>(null);
  const onOutput = useCallback((o: FormOutput | null, formId: string) => setOutput({ formId, out: o }), []);
  // Only the leaving form's own output is dropped, so this can't race a newer form's publish.
  const onOutputGone = useCallback((formId: string) => setOutput((p) => (p && p.formId === formId ? null : p)), []);
  // Another form's output (only within the render before FormView's layout effect publishes) shows as empty;
  // null only when this form's template failed to compile (the pane hides).
  const formOutput = form && output && output.formId === form.id ? output.out : EMPTY_OUTPUT;
  // A form whose panel crashed (LP-88) shows no preview, so nothing half-made can be copied.
  const [crashedForm, setCrashedForm] = useState<string | null>(null);
  const formCrashed = !!form && crashedForm === form.id;
  const showOutput = !!form && formOutput !== null && !formCrashed;

  return (
    // "with-output" adds the third grid column (the form's preview).
    <div className={"layout" + (showOutput ? " with-output" : "")}>
      <Sidebar forms={ALL_FORMS} current={hashFor(shell.route).slice(1)} />
      <main className="editor" id={shell.visible ? "editor" : undefined}>
        {form ? (
          <ErrorBoundary
            where="this form"
            resetKey={form.id}
            onError={() => setCrashedForm(form.id)}
            onReset={() => setCrashedForm(null)}
          >
            <FormView
              key={form.id}
              form={form}
              activeCharacter={active}
              highlight={highlight}
              onOutput={onOutput}
              onOutputGone={onOutputGone}
              docketRequest={shell.docketRequest}
              draftRequest={shell.draftRequest}
              onDocketBar={shell.onDocketBar}
              onTools={shell.onFormTools}
            />
          </ErrorBoundary>
        ) : (
          <EmptyState />
        )}
      </main>
      {form && formOutput && !formCrashed && (
        <ErrorBoundary where="the forum preview" resetKey={form.id}>
          <OutputPane
            form={form}
            finalHtml={formOutput.finalHtml}
            previewHtml={formOutput.previewHtml}
            missing={formOutput.missing}
            onJump={formOutput.jumpTo}
            highlight={highlight}
            onHighlight={setHighlight}
            onFiled={formOutput.onFiled}
            onOpenHistory={shell.openFilings}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
