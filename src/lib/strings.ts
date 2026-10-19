// Pinned UI strings (design §Strings). They replace reference texts that mention
// cookies, outside branding or the remote server. The UI and the tests share them.

export const S_DISCLAIMER = "Personal tool. Always check a filing before posting.";

export const S_DISCLAIMER_EMPTY = "Personal tool. Always check a filing before posting.";

/** Rendered as plain text (no link). */
export const S_CREDIT = "Made by Dan.";

export const S_STORAGE_LOCAL =
  "Characters, dockets and J.A.P. portfolios are saved in this browser's local storage on this device. Export them to keep a backup.";

export const S_STORAGE_MEMORY =
  "This browser is blocking storage, so characters last only until you close this tab. Use Export to keep them.";

export const S_STORAGE_SYNC =
  "This browser keeps a copy of your synced characters, dockets and J.A.P. portfolios in local storage, so the app works while the sync server is unreachable.";

export const S_SYNC_OFF =
  "Save your characters, dockets and J.A.P. portfolios to this app's own server (the computer running it), so other browsers and devices that can reach it get the same data. You get a private sync code; there's no account or password. If the app was started with dev:lan/start:lan, anyone on your network who has the code can read or change the data, and traffic is not encrypted.";

/** The `#sync-on` intro (reference wording); the middle part is bold. */
export const S_SYNC_ON_PARTS = [
  "Your sync code. Enter it on another device to get the same characters and dockets. ",
  "Keep it private:",
  " anyone with it can see and change them.",
] as const;
export const S_SYNC_ON = S_SYNC_ON_PARTS.join("");

export function S_SYNC_APPLY_FAIL(n: number): string {
  return `Couldn't store ${n} synced character(s) in this browser.`;
}

export const S_SYNC_MERGED = "Merged your changes with another device's.";

/** "1 character", "2 cases", "1 character and 3 cases". */
export function S_LOST_ITEMS(characters: number, cases: number): string {
  const part = (n: number, one: string) => (n ? n + " " + one + (n === 1 ? "" : "s") : "");
  return [part(characters, "character"), part(cases, "case")].filter(Boolean).join(" and ");
}

/** After a merge where another device's newer copy replaced this browser's edits. */
export function S_SYNC_LOST(n: number, cases = 0): string {
  if (cases) {
    return `Another device changed ${S_LOST_ITEMS(n, cases)} more recently, so its versions are shown. Yours are kept: use Restore my version to bring them back.`;
  }
  return n === 1
    ? "Another device changed the same character more recently, so its version is shown. Your version is kept: use Restore my version to bring it back."
    : `Another device changed ${n} of the same characters more recently, so its versions are shown. Yours are kept: use Restore my version to bring them back.`;
}

export const S_SET_ASIDE = "Some saved data couldn't be read and was set aside.";
export const S_SET_ASIDE_HINT =
  "Use Download damaged data in the Characters dialog to keep a copy you can fix by hand.";

export const S_JAP_OFF = "Portfolios are saved in this browser. Turn on sync to keep them on this app's server too.";

export const S_JAP_ON = "Saved in this browser and on this app's server.";
