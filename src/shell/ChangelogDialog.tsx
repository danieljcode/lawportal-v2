// "What's new" (FR15, INV §a #changelog-dialog, §e.5). Opening it is handled
// by App, which marks the entries seen and hides the unread dot. Settings
// (LP-109) shows the same list as a section.

import { CHANGELOG } from "@/data/changelog";
import { friendlyDate, LOG_TYPES } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";
import Dialog from "@/ui/Dialog";

export default function ChangelogDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      id="changelog-dialog"
      className="changelog"
      titleId="changelog-title"
      title="What's new"
    >
      <ChangelogList />
    </Dialog>
  );
}

export function ChangelogList() {
  return (
    <>
      <p className="muted small" id="app-version">
        Version {APP_VERSION}
      </p>
      <div id="changelog-list">
        {CHANGELOG.map((entry) => (
          <article className="log-entry" key={entry.date + "|" + (entry.title || "")}>
            <header>
              <time dateTime={entry.date}>{friendlyDate(entry.date)}</time>
              {entry.version && <span className="log-version">v{entry.version}</span>}
              {entry.title && <span className="log-title">{entry.title}</span>}
            </header>
            {LOG_TYPES.map(([type, label]) => {
              const items = entry.items.filter((i) => i.type === type);
              if (!items.length) return null;
              return (
                <div className="log-group" key={type}>
                  <h4 className={"log-type " + type}>{label}</h4>
                  <ul>
                    {items.map((i) => (
                      <li key={i.text}>{i.text}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </>
  );
}
