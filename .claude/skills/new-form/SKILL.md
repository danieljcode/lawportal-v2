---
name: new-form
description:
  How to add or change a form or template in lawportal-v2 safely - an Additional Template in src/data/extra-forms.ts,
  or one of the 39 generated court forms. Use whenever a task adds, edits or fixes a court form, firm letter, judge
  template, motion, petition or any other FormDef, or touches its tokens, required fields or snapshots.
argument-hint: <form to add or change>
---

# Add or change a form

The full rules are in [docs/templates-and-forms.md](../../../docs/templates-and-forms.md); read the parts you need
(token syntax, required fields, escaping). This is the checklist for doing it without breaking them. `$ARGUMENTS`, if
given, says which form.

## First: which kind of form is it?

- **One of the 39 court forms** (Criminal, Civil, Traffic, Small Claims, Appellate, Supreme, general): they live in
  `src/data/forms.json`, which is **generated. Never edit it by hand.** Change the generator instead and re-run
  `npm run port-forms`:
  - wording and court names: `scripts/freestyle-wording.mjs`
  - court names, courthouses, case-number shape: `src/lib/courts.ts`
  - required fields: the rule in `scripts/required-fields.mjs`
  - old forum links: `scripts/scrub-links.mjs`

  `port-forms` needs the private reference data in `.agents/reference/jsa`. If it isn't there, stop and tell the user
  how to get it (the clone command is in the doc's "Reference data" section). A test fails if `forms.json` isn't
  exactly what `port-forms` writes now.

- **An Additional Template** (the firm's own: petitions, motions, discovery, contracts, Firm Letters, Judge): it's a
  `FormDef` in `src/data/extra-forms.ts`, edited directly. The rest of this skill is about these.

## Rules every form keeps

1. **Court forms never carry firm branding.** Anything posted to the forum must look official: no firm name, colours
   or letterhead from `src/branding.ts` in a template. A firm name is a plain field (`{{Firm|FIRM NAME}}`), as in the
   letters.
2. **User text is never markup.** Every value goes through `escapeHtml` in `render()`. Never loosen escaping, never
   call `trustAsSafeHtml` or cast to `SafeHtml` outside the renderers, and never relax `tests/xss.test.ts` or
   `tests/safeHtml.test.ts`. If a field needs structure, express it in the template (a `list`, `paras` or `>tag`
   wrap), not in the value.
3. **The template HTML passes the safety check** (`scripts/template-safety.mjs`): no `script`, `iframe`, `style`,
   `form`, `input`, `button`, `svg` or other dangerous tags, no `on…=` attributes, and every `href`/`src` is
   `http(s)` (or an image `data:` URL). Fallbacks count too.
4. **FreestyleRP wording.** Use FreestyleRP court names (for example "San Andreas Court"), not the old forum's. The
   world is set in 1990: dates come from prefills such as `=today` or `=today+21`, which the app shifts by
   `YEAR_OFFSET` (`src/lib/freestyle.ts`). Never write a real year into a template.
5. **British English** in help text, comments and the "What's new" entry. The legal wording inside a form follows the
   court style the other forms use.

## Adding an Additional Template

1. **Copy the closest existing form** in `src/data/extra-forms.ts` and reuse its helpers rather than new HTML:
   `COURT_LINE`, `ADVERSARY_CAPTION`, `CASE_NO`, `title()`, `heading()`, `signature(role)`, `spoiler()`,
   `EXHIBIT_LIST`, and the letter and judge signatures. Keep the same shape:

   ```ts
   const myForm: FormDef = {
     id: "extra-my-form", // lowercase, unique, starts with "extra-"
     court: COURT, // always "Additional Templates"
     section: "Motions", // sidebar group: Petitions, Motions, Discovery, Contracts, LETTER_SECTION, JUDGE_SECTION
     title: "My Form",
     required: ["Case number", "Name"], // labels that must be filled before copying; never a tick box
     html:
       "{{-- Court & Caption}}\n" +
       ADVERSARY_CAPTION +
       "{{-- Body}}\n" +
       // …
       "{{-- Signature}}\n" +
       signature("Attorney for the Plaintiff"),
   };
   ```

2. **Label carefully.** Fields with the same label share one value. These labels are wired to other features, so use
   them exactly when you mean them:
   - `Case number`: gets the docket bar; a prefill like `YYSCCR00XXX` becomes its placeholder.
   - `Courthouse`, `Division`, `Court name`, the plaintiff/defendant name labels and `Filing date`: filled when a case
     is loaded (`docketToForm` in `src/lib/formState.ts`).
   - `Filing date` records a filing when saved to the Case File. Letters use `Letter date` and judge forms
     `Order date` so they don't.
   - Character fields: `{{@name}}` or `{{Label@title}}` (`name`, `title`, `bar`, `signature`…).
   - `{{Exhibits@exhibits|…}}`: the case's exhibit list, never typed.

3. **Register it** in the `EXTRA_FORMS` array at the bottom of the file, in the place it belongs in its section.

4. **Update the tests and counts:**
   - `tests/extra-forms.test.ts`: add a `SPEC` entry (section, title, the `{{-- …}}` section names in order, and
     headings), in the same order as `EXTRA_FORMS`. Update the counts in "adds thirteen forms…" (`52` = 39 + the
     number of templates) and in its title.
   - Rewrite the forms' index with `npx vitest run -u tests/form-index.test.ts` (also after changing a form's id,
     title, court or section): the shell lists forms from `src/data/form-index.json`.
   - Update the template count in `README.md`, `docs/architecture.md` and `docs/templates-and-forms.md` (each says
     13 / Thirteen today), and add the form to the README's and the doc's lists if it's a new kind.

5. **Add a "What's new" entry** in `src/data/changelog.ts` (newest first, today's real date as `YYYY-MM-DD`, type
   `new`).

## Changing an existing form

- Keep its `id`: saved drafts and the Case File refer to forms by id.
- Renaming a label loses what users have already typed in it, and can break `required`, the docket fill and the
  `SPEC` headings. Do it only when the task asks, and say so.
- Update `required` if you add, rename or remove a field it names.

## Check it

```bash
npx vitest run tests/extra-forms.test.ts tests/template-safety.test.ts tests/xss.test.ts tests/required.test.ts
npm test
```

- The Discord, layout and parity snapshots cover every form, so a new or changed form changes them. Update only the
  suites that fail and are meant to change, for example `npx vitest run -u tests/discord.test.ts`. Then **read the
  snapshot diff**: only the form you touched should move. If another form's output moved, find out why before going
  on.
- On Windows, if `git diff --ignore-cr-at-eol tests/__snapshots__` shows nothing, the change is only line endings:
  `git checkout -- tests/__snapshots__`.
- Finish with `npm run lint`, `npm run format:check` and `npm run build`. The build also type-checks the `SafeHtml`
  sinks.
- If the app is running (`npm run dev`), `npm run smoke:preview` checks every form's preview in a browser. Open the
  form, fill it in and look at the forum preview, the BBCode and the Discord output.

When it's ready to ship, the user can run `/lp-ship LP-<n>`.
