// The start page (FR3, INV §a Editor: #empty-state). It also holds the
// startup screen setting (LP-21) until there's a Desktop settings program.

import { useState } from "react";
import { bootEnabled, setBootEnabled } from "@/lib/boot";
import { S_CREDIT, S_DISCLAIMER_EMPTY } from "@/lib/strings";

export default function EmptyState() {
  const [boot, setBoot] = useState(bootEnabled);
  return (
    <div className="empty" id="empty-state">
      <p className="eyebrow">Court filings, ready to paste</p>
      <h2>Pick a form to get started</h2>
      <p className="lede">
        Choose a petition from the list, fill in the fields, then copy the result straight into the forum&apos;s post
        editor.
      </p>
      <ol className="steps">
        <li>
          <span className="step-num" aria-hidden="true">
            1
          </span>
          <div>
            <strong>Add your character</strong>
            <p>
              Under <em>Characters</em>, so names, titles and contact details fill in for you.
            </p>
          </div>
        </li>
        <li>
          <span className="step-num" aria-hidden="true">
            2
          </span>
          <div>
            <strong>Fill in the form</strong>
            <p>Anything you leave empty keeps the template&apos;s placeholder, so nothing goes missing.</p>
          </div>
        </li>
        <li>
          <span className="step-num" aria-hidden="true">
            3
          </span>
          <div>
            <strong>Copy for forum</strong>
            <p>Paste into the editor. Tables, bold text, sizes and spoilers come through intact.</p>
          </div>
        </li>
      </ol>
      <label className="check boot-setting">
        <input
          type="checkbox"
          id="boot-setting"
          checked={boot}
          onChange={(e) => {
            setBootEnabled(e.target.checked);
            setBoot(e.target.checked);
          }}
        />
        <span>Show the startup screen when the office system starts (once per browser session)</span>
      </label>
      <p className="disclaimer">{S_DISCLAIMER_EMPTY}</p>
      <p className="disclaimer">{S_CREDIT}</p>
    </div>
  );
}
