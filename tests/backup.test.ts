// Full backup and restore (LP-1).
import { describe, expect, it } from "vitest";
import {
  backupFilename,
  backupText,
  countsOf,
  daysSinceBackup,
  LAST_BACKUP_KEY,
  makeBackup,
  needsBackupReminder,
  parseFile,
  restoreBackup,
  restorePreview,
  type BackupDoc,
} from "@/lib/backup";
import { memoryKV, SAVE_FAILED, type KV } from "@/lib/storage";

const NOW = new Date("2026-10-19T12:00:00Z");
const CHARS = JSON.stringify([
  { id: "char0001", name: "Ann Lee" },
  { id: "char0002", name: "Bo Day" },
]);

/** A browser with a bit of everything, including device-only keys and something unrelated. */
function filled(): KV {
  return memoryKV({
    lawapp_chars: CHARS,
    lawapp_active_char: "char0001",
    lawapp_dockets_char0001: JSON.stringify([
      { id: "d1", caseNumber: "90SCCR00001" },
      { id: "d2", caseNumber: "90SCCC00002" },
    ]),
    lawapp_jap_char0002: JSON.stringify({ level: "I", I: {}, II: {} }),
    "lawapp_draft_civil-complaint": JSON.stringify({ values: { "Plaintiff name": "Ann" } }),
    lawapp_theme: "dark",
    lawapp_discord: JSON.stringify({ limit: 4000 }),
    lawapp_changelog_seen: "stamp",
    lawapp_corrupt_lawapp_chars_1: "{half writ",
    lawapp_sync_lost: JSON.stringify({ characters: [] }),
    lawapp_sync_code: "JSA-ABCD-EFGH-JKLM-NPQR-STUV",
    lawapp_sync_rev: "7",
    lawapp_sync_base: "{}",
    other_app_key: "not ours",
  });
}

describe("making a backup", () => {
  it("holds every lawapp_ key exactly as stored, except the sync code and device-only keys", () => {
    const doc = makeBackup(filled(), NOW);
    expect(doc).toMatchObject({ app: "jsa-form-generator", kind: "backup", version: 1, created: NOW.toISOString() });
    expect(Object.keys(doc.data).sort()).toEqual([
      "lawapp_active_char",
      "lawapp_changelog_seen",
      "lawapp_chars",
      "lawapp_corrupt_lawapp_chars_1",
      "lawapp_discord",
      "lawapp_dockets_char0001",
      "lawapp_draft_civil-complaint",
      "lawapp_jap_char0002",
      "lawapp_sync_lost",
      "lawapp_theme",
    ]);
    expect(doc.data.lawapp_chars).toBe(CHARS);
    expect(doc.data.lawapp_corrupt_lawapp_chars_1).toBe("{half writ");
  });

  it("is named by the date and remembers when it was made, without backing that date up", () => {
    expect(backupFilename(NOW)).toBe("lawapp-backup-2026-10-19.json");
    const kv = filled();
    const doc = JSON.parse(backupText(kv, NOW)) as BackupDoc;
    expect(kv.get(LAST_BACKUP_KEY)).toBe(NOW.toISOString());
    expect(doc.data).not.toHaveProperty(LAST_BACKUP_KEY);
    expect(makeBackup(kv, NOW).data).not.toHaveProperty(LAST_BACKUP_KEY);
  });

  it("explains when storage can't be listed", () => {
    const kv: KV = { get: () => null, set: () => {}, remove: () => {} };
    expect(() => makeBackup(kv)).toThrow("can't be listed");
  });
});

describe("reading a chosen file", () => {
  it("recognises a backup and keeps only keys a backup may hold", () => {
    const text = JSON.stringify({
      kind: "backup",
      version: 1,
      created: NOW.toISOString(),
      appVersion: "0.2.0",
      data: { lawapp_chars: CHARS, lawapp_sync_code: "JSA-XXXX", evil_key: "x", lawapp_theme: 5 },
    });
    const parsed = parseFile(text);
    expect(parsed.kind).toBe("backup");
    if (parsed.kind === "backup") expect(parsed.doc.data).toEqual({ lawapp_chars: CHARS });
  });

  it("recognises older characters-only exports, including ones with a server field", () => {
    expect(
      parseFile(
        JSON.stringify({ app: "jsa-form-generator", version: 1, characters: [{ name: "A", server: "other" }] }),
      ),
    ).toEqual({
      kind: "characters",
    });
    expect(parseFile(JSON.stringify([{ name: "A" }]))).toEqual({ kind: "characters" });
  });

  it("says plainly what's wrong with anything else", () => {
    expect(() => parseFile("{not json")).toThrow("That file isn't valid JSON.");
    expect(() => parseFile(JSON.stringify({ hello: 1 }))).toThrow("That isn't a backup or a characters file");
    expect(() => parseFile(JSON.stringify({ kind: "backup", version: 2, data: {} }))).toThrow("newer version");
    expect(() => parseFile(JSON.stringify({ kind: "backup", version: 1, data: [] }))).toThrow("damaged");
  });
});

describe("the restore preview", () => {
  it("counts what's there now and what's in the backup", () => {
    expect(countsOf(makeBackup(filled()).data)).toEqual({ characters: 2, dockets: 2, portfolios: 1, drafts: 1 });
    expect(countsOf({})).toEqual({ characters: 0, dockets: 0, portfolios: 0, drafts: 0 });
  });

  it("lists the changes and says it can't be undone", () => {
    const text = restorePreview(
      { characters: 3, dockets: 7, portfolios: 1, drafts: 4 },
      { characters: 5, dockets: 9, portfolios: 1, drafts: 6 },
      NOW.toISOString(),
      true,
    );
    expect(text).toContain("This replaces everything saved in this browser:");
    expect(text).toContain("• Characters: 3 now → 5 in the backup");
    expect(text).toContain("• Cases: 7 now → 9 in the backup");
    expect(text).toContain("• Form drafts: 4 now → 6 in the backup");
    expect(text).toContain("the restored data will be sent to the sync server");
    expect(text).toContain("This can't be undone");
    expect(restorePreview(countsOf({}), countsOf({}), "", false)).toContain("an unknown date");
  });
});

describe("restoring", () => {
  it("replaces everything: the browser ends up exactly as the backup, sync code and other apps untouched", () => {
    const source = filled();
    const doc = makeBackup(source, NOW);
    const kv = memoryKV({
      lawapp_chars: JSON.stringify([{ id: "char0009", name: "Newer" }]),
      lawapp_dockets_char0009: "[]",
      "lawapp_draft_misc-order-decree": "{}",
      lawapp_sync_code: "JSA-MINE-MINE-MINE-MINE-MINE",
      lawapp_sync_rev: "3",
      other_app_key: "keep me",
    });
    restoreBackup(kv, doc);
    expect(makeBackup(kv, NOW).data).toEqual(doc.data);
    expect(kv.get("lawapp_dockets_char0009")).toBeNull();
    expect(kv.get("lawapp_draft_misc-order-decree")).toBeNull();
    expect(kv.get("lawapp_sync_code")).toBe("JSA-MINE-MINE-MINE-MINE-MINE");
    expect(kv.get("lawapp_sync_rev")).toBe("3");
    expect(kv.get("other_app_key")).toBe("keep me");
    // Sync is on, so the restored data goes to the server next time.
    expect(kv.get("lawapp_sync_dirty")).toBe("1");
  });

  it("doesn't mark anything for sync when sync is off", () => {
    const kv = memoryKV();
    restoreBackup(kv, makeBackup(filled(), NOW));
    expect(kv.get("lawapp_chars")).toBe(CHARS);
    expect(kv.get("lawapp_sync_dirty")).toBeNull();
  });

  it("puts everything back if storage refuses a write part-way", () => {
    const base = memoryKV({ lawapp_chars: "[]", lawapp_theme: "light", lawapp_draft_x: "{}" });
    let writes = 0;
    const kv: KV = {
      ...base,
      set: (k, v) => {
        if (++writes === 3) throw new Error("QuotaExceeded");
        base.set(k, v);
      },
    };
    const before = makeBackup(base, NOW).data;
    expect(() => restoreBackup(kv, makeBackup(filled(), NOW))).toThrow(SAVE_FAILED);
    expect(makeBackup(base, NOW).data).toEqual(before);
  });
});

describe("the 30-day reminder", () => {
  const withChars = () => memoryKV({ lawapp_chars: CHARS });

  it("shows when sync is off, there are characters and no backup in 30 days", () => {
    expect(needsBackupReminder(withChars(), NOW)).toBe(true); // never backed up
    const kv = withChars();
    kv.set(LAST_BACKUP_KEY, new Date(NOW.getTime() - 31 * 86_400_000).toISOString());
    expect(daysSinceBackup(kv, NOW)).toBe(31);
    expect(needsBackupReminder(kv, NOW)).toBe(true);
  });

  it("stays quiet after a recent backup, with sync on, or with nothing to lose", () => {
    const recent = withChars();
    recent.set(LAST_BACKUP_KEY, new Date(NOW.getTime() - 10 * 86_400_000).toISOString());
    expect(needsBackupReminder(recent, NOW)).toBe(false);
    const synced = withChars();
    synced.set("lawapp_sync_code", "JSA-ABCD-EFGH-JKLM-NPQR-STUV");
    expect(needsBackupReminder(synced, NOW)).toBe(false);
    expect(needsBackupReminder(memoryKV(), NOW)).toBe(false);
    expect(daysSinceBackup(memoryKV(), NOW)).toBeNull();
  });

  it("reads only the sync code, the characters and the last backup (LP-152)", () => {
    const kv = withChars();
    kv.set("lawapp_cases", "[]");
    const read: string[] = [];
    const spy = { ...kv, get: (key: string) => (read.push(key), kv.get(key)), keys: undefined };
    expect(needsBackupReminder(spy, NOW)).toBe(true);
    expect(read).toEqual(["lawapp_sync_code", "lawapp_chars", LAST_BACKUP_KEY]);
  });
});
