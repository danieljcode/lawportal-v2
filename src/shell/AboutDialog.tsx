// Help → About (LP-22): what the system is, who it's licensed to, the version
// and the credits. Everything named comes from src/branding.ts.

import { appTitle, BRANDING } from "@/branding";
import { S_CREDIT } from "@/lib/strings";
import { APP_VERSION } from "@/lib/version";
import Dialog from "@/ui/Dialog";

export default function AboutDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      id="about-dialog"
      className="about"
      titleId="about-title"
      title={"About " + BRANDING.productName}
    >
      <AboutContent />
      <div className="row">
        <button type="button" className="btn primary" onClick={onClose}>
          OK
        </button>
      </div>
    </Dialog>
  );
}

/** The dialog's text, also shown in Settings (LP-109). */
export function AboutContent() {
  return (
    <>
      <div className="about-head">
        {BRANDING.logo ? (
          // A 48px logo from branding, possibly a data: URL: next/image would add nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="about-logo" src={BRANDING.logo} alt="" width={48} height={48} />
        ) : (
          // No logo yet: the favicon's scales, in the firm's colours.
          <span
            className="about-logo about-mark"
            aria-hidden="true"
            style={{ background: BRANDING.colours.primary, color: BRANDING.colours.accent }}
          >
            ⚖
          </span>
        )}
        <div>
          <p className="about-name">
            <strong>{appTitle()}</strong>
          </p>
          <p className="small" id="about-version">
            Version {APP_VERSION}
          </p>
        </div>
      </div>
      <hr />
      <p id="about-licence">
        Licensed to <strong>{BRANDING.firmName}</strong>
      </p>
      <p className="small">
        Court filings for the FreestyleRP server: forms, the firm&apos;s cases and evidence, and the Law Library.
        Filings posted to the forum carry no firm branding.
      </p>
      <hr />
      <ul className="small about-credits" id="about-credits">
        <li>{S_CREDIT} All rights reserved.</li>
        <li>Court forms: adapted from third-party templates (see LICENSE).</li>
        {/* Not read from the penal code, so its 115 KB loads with the Law Library only (LP-122). */}
        <li>State of San Andreas Penal Code: FreestyleRP.</li>
      </ul>
    </>
  );
}
