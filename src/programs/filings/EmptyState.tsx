// Court Filings with no form open (FR3, INV §a Editor: #empty-state): how
// filing works, in three steps. The home screen is the Program Manager (LP-104).

import { S_CREDIT, S_DISCLAIMER_EMPTY } from "@/lib/strings";

export default function EmptyState() {
  return (
    <div className="empty" id="empty-state">
      <p className="eyebrow">Court filings, ready to send</p>
      <h2>Pick a form to get started</h2>
      <p className="lede">
        Choose a petition from the list, fill in the fields, then download it as a Word file or PDF, or copy it for
        Discord.
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
            <strong>Download or copy for Discord</strong>
            <p>Download .docx or PDF keeps the layout. The Discord tab splits it into messages that fit.</p>
          </div>
        </li>
      </ol>
      <p className="disclaimer">{S_DISCLAIMER_EMPTY}</p>
      <p className="disclaimer">{S_CREDIT}</p>
    </div>
  );
}
