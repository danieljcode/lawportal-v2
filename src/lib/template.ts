// Token template engine for form HTML.
//
// Templates are the forum's own markup with {{tokens}} where the filer types
// something:
//   {{Label[=prefill][@charField][:type[:opt1;opt2]][>tag][|fallback]}}  a field
//   {{#Name[|count]}} … {{/Name}}      a repeating block (default 1 item, |0 allowed)
//   {{?Name[|off]}} … {{/Name}}        an optional section (on unless |off)
//   {{$index}} {{$word}} {{$WORD}} {{$letter}} {{$roman}}   position inside a block
//   {{$roman after Name}}              the numeral after block Name's last item
//   {{-- Section name}}                starts an input-form section (renders nothing)
//
// An empty field renders its fallback (the original placeholder HTML), so an
// untouched form reproduces the directory template exactly. Behaviour follows
// the reference engine; see .agents/tasks/jsa-investigation.md §b.
//
// The engine lives in template/ (LP-7): parse.ts (compile, fields), prefill.ts,
// render.ts (render, formatDate), escape.ts (escapeHtml) and plain.ts. This file
// re-exports them, so imports from "@/lib/template" keep working.

export * from "./template/escape";
export * from "./template/form";
export * from "./template/parse";
export * from "./template/plain";
export * from "./template/prefill";
export * from "./template/render";
