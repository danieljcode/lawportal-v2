// The sync status in the top bar (modern) and the taskbar tray (Classic), LP-109:
// a dot and its word ("Synced", "Offline"…), linking to Settings, where Sync is.
// Nothing shows while sync is off on this device.

import { BADGES, type SyncStatus } from "@/lib/sync";

export default function SyncDot({ status }: { status: SyncStatus | null }) {
  if (!status) return null;
  const label = "Sync: " + (BADGES[status] || "on");
  return (
    <a className="btn sync-status" id="sync-status" href="#control" title={label} aria-label={label}>
      <span className={"sync-dot " + status} id="sync-dot" aria-hidden="true" />
      <span className="sync-word">{BADGES[status] || "On"}</span>
    </a>
  );
}
