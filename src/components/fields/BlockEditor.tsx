// A repeatable block (`{{#Name|n}}`): items with ↑ ↓ Remove, then "+ Add" (reference blockInput).

import { addItem, afterAddItem, moveItem, removeItem, singular } from "@/lib/formState";
import type { BlockEntry, Values } from "@/lib/types";
import { useFormCtx } from "./FormContext";
import ItemList, { type ScopeProps } from "./ItemList";

function isItem(v: unknown): v is Values {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export default function BlockEditor({ entry, scope, path, prefix }: ScopeProps & { entry: BlockEntry }) {
  const { entries, character, onState, now } = useFormCtx();
  const name = entry.block.name;
  const raw = scope["#" + name];
  const items = Array.isArray(raw) ? raw : [];
  const one = singular(name);

  return (
    <fieldset className="block">
      <legend>{name}</legend>
      {items.map((item, i) => (
        <div className="item" key={i}>
          <div className="item-head">
            <span className="item-num">{one + " " + (i + 1)}</span>
            <span className="spacer" />
            <button
              type="button"
              className="mini"
              title="Move up"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => onState((s) => moveItem(s, path, name, i, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              className="mini"
              title="Move down"
              aria-label="Move down"
              disabled={i === items.length - 1}
              onClick={() => onState((s) => moveItem(s, path, name, i, 1))}
            >
              ↓
            </button>
            <button type="button" className="mini danger-quiet" onClick={() => onState((s) => removeItem(s, path, name, i))}>
              Remove
            </button>
          </div>
          <div className="item-body">
            <ItemList
              entries={entry.fields}
              scope={isItem(item) ? item : {}}
              path={[...path, { block: name, index: i }]}
              prefix={prefix + name + i + "-"}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn add"
        // R6: materialise the new item's nested blocks, prefill, then the non-force character fill.
        // `now` is the server-offset date so a new item's date prefills land on the active server's year.
        onClick={() => onState((s) => afterAddItem(entries, addItem(s, path, name), character, now))}
      >
        {"+ Add " + one.toLowerCase()}
      </button>
    </fieldset>
  );
}
