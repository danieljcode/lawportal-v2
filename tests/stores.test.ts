// Client stores: characters, dockets, portfolio (design §Testing; AC 11, 12, 17, 26).
import { describe, expect, it, vi } from "vitest";
import {
  createCharacterStore,
  clean as cleanCharacter,
  FIELDS,
  hasDocket,
  LEGACY_KEY,
  LEGACY_SERVER_KEY,
  CHARS_KEY,
} from "@/lib/characters";
import { createDocketStore, divisionFor, STATUSES } from "@/lib/dockets";
import {
  cleanText,
  cleanUrl,
  complete,
  createPortfolioStore,
  isCommissioner,
  levelFromTitle,
  LEVELS,
  progress,
  render,
  topicTitle,
} from "@/lib/portfolio";
import {
  __resetSetAsideForTests,
  CORRUPT_PREFIX,
  listSetAside,
  memoryKV,
  readJson,
  setAsideVersion,
  writeJson,
  SAVE_FAILED,
  type KV,
} from "@/lib/storage";

/** A memory KV whose keys can be inspected. */
function spyKV(): KV & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    get: (k) => (map.has(k) ? (map.get(k) as string) : null),
    set: (k, v) => {
      map.set(k, v);
    },
    remove: (k) => {
      map.delete(k);
    },
    keys: () => [...map.keys()],
  };
}

function stores(kv: KV = spyKV()) {
  return { kv, chars: createCharacterStore(kv), dockets: createDocketStore(kv), jap: createPortfolioStore(kv) };
}

describe("storage helpers", () => {
  it("sets corrupt JSON aside before removing it, and raises the notice (LP-65)", () => {
    const kv = memoryKV({ lawapp_chars: "[{\"id\":\"abcd1234\",\"name\":\"Ha" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 16, 12));
    const notices = setAsideVersion();
    expect(readJson(kv, "lawapp_chars")).toBeNull();
    expect(kv.get("lawapp_chars")).toBeNull();
    const backup = CORRUPT_PREFIX + "lawapp_chars_" + Date.UTC(2026, 9, 16, 12);
    expect(kv.get(backup)).toBe("[{\"id\":\"abcd1234\",\"name\":\"Ha");
    expect(listSetAside(kv)).toEqual([
      { key: "lawapp_chars", at: "2026-10-16T12:00:00.000Z", raw: "[{\"id\":\"abcd1234\",\"name\":\"Ha" },
    ]);
    expect(setAsideVersion()).toBe(notices + 1);
    expect(warn).toHaveBeenCalled();
    now.mockRestore();
    warn.mockRestore();
  });

  it("keeps the last 3 set-aside copies per key", () => {
    const kv = memoryKV();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let t = 1_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => ++t);
    for (const raw of ["{a", "{b", "{c", "{d"]) {
      kv.set("lawapp_dockets_abcd1234", raw);
      readJson(kv, "lawapp_dockets_abcd1234");
    }
    kv.set("lawapp_jap_abcd1234", "{other");
    readJson(kv, "lawapp_jap_abcd1234");
    expect(listSetAside(kv).map((v) => v.key + ":" + v.raw)).toEqual([
      "lawapp_dockets_abcd1234:{b",
      "lawapp_dockets_abcd1234:{c",
      "lawapp_dockets_abcd1234:{d",
      "lawapp_jap_abcd1234:{other",
    ]);
    expect(kv.get(CORRUPT_PREFIX + "lawapp_dockets_abcd1234_1001")).toBeNull();
    now.mockRestore();
    warn.mockRestore();
  });

  it("leaves a corrupt value in place when its backup can't be written, but keeps a copy for download", () => {
    const base = memoryKV({ lawapp_chars: "{full" });
    const kv: KV = {
      ...base,
      set: (k, v) => {
        if (k.startsWith(CORRUPT_PREFIX)) throw new Error("QuotaExceeded");
        base.set(k, v);
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readJson(kv, "lawapp_chars")).toBeNull();
    expect(kv.get("lawapp_chars")).toBe("{full");
    expect(listSetAside(kv)).toMatchObject([{ key: "lawapp_chars", raw: "{full" }]);
    readJson(kv, "lawapp_chars");
    expect(listSetAside(kv)).toHaveLength(1);
    __resetSetAsideForTests();
    warn.mockRestore();
  });

  it("turns a refused write into the friendly error", () => {
    const kv: KV = { get: () => null, set: () => { throw new Error("QuotaExceeded"); }, remove: () => {} };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => writeJson(kv, "k", 1)).toThrow(SAVE_FAILED);
    warn.mockRestore();
  });
});

describe("dropping the pre-LP-70 server field (LP-71)", () => {
  const OLD = [
    { id: "gtawchar1", name: "Gee Taw", title: "Attorney at Law", bar: "B-12", server: "gtaw", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "fschar001", name: "Sam Style", server: "freestyle", docket: true },
    { id: "newchar01", name: "Already Clean" },
  ];

  it("removes server from every saved character, keeps everything else exactly, and deletes the saved default", () => {
    const { kv, chars, dockets } = stores();
    kv.set(CHARS_KEY, JSON.stringify(OLD));
    kv.set(LEGACY_SERVER_KEY, "gtaw");
    dockets.save("gtawchar1", { caseNumber: "26GJCC00147", plaintiff: "Ann" });

    expect(chars.migrateServerField()).toBe(2);
    const stored = JSON.parse(kv.get(CHARS_KEY)!) as Array<Record<string, unknown>>;
    expect(stored).toEqual([
      { id: "gtawchar1", name: "Gee Taw", title: "Attorney at Law", bar: "B-12", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "fschar001", name: "Sam Style", docket: true },
      { id: "newchar01", name: "Already Clean" },
    ]);
    expect(kv.get(LEGACY_SERVER_KEY)).toBeNull();
    // Dockets keep their case numbers as filed, GJ and all.
    expect(dockets.list("gtawchar1").map((d) => d.caseNumber)).toEqual(["26GJCC00147"]);
  });

  it("is a no-op the second time and on clean data", () => {
    const { kv, chars } = stores();
    kv.set(CHARS_KEY, JSON.stringify(OLD));
    chars.migrateServerField();
    const after = kv.get(CHARS_KEY);
    expect(chars.migrateServerField()).toBe(0);
    expect(kv.get(CHARS_KEY)).toBe(after);
    expect(stores().chars.migrateServerField()).toBe(0); // nothing saved at all
  });
});

describe("characters", () => {
  it("has the 12 fields in order (no Server since LP-70)", () => {
    expect(FIELDS.map((f) => f.key)).toEqual([
      "name", "title", "dob", "gender", "phone", "address", "occupation", "bar", "email", "signature", "notes", "docket",
    ]);
  });

  it("cleans: trims, drops empties, caps at 4000, keeps docket boolean, migrates judge", () => {
    const c = cleanCharacter({ id: "abcd1234", name: "  Ann  ", title: "", notes: "x".repeat(5000), docket: 1, extra: "no" });
    expect(c).toEqual({ id: "abcd1234", name: "Ann", notes: "x".repeat(4000), docket: true });
    expect(cleanCharacter({ id: "bad id!", name: "B", judge: true })).toMatchObject({ name: "B", docket: true });
    expect(cleanCharacter({ id: "bad id!", name: "B" }).id).toMatch(/^[a-z0-9]{4,32}$/);
  });

  it("hasDocket: explicit box, legacy judge, then title", () => {
    expect(hasDocket({ title: "Attorney at Law" })).toBe(true);
    expect(hasDocket({ title: "Attorney at Law", docket: false })).toBe(false);
    expect(hasDocket({ title: "Plumber", judge: true })).toBe(true);
    expect(hasDocket({ title: "Plumber" })).toBe(false);
    expect(hasDocket(null)).toBe(false);
  });

  it("gates J.A.P. and dockets by title (AC 11)", () => {
    const { chars } = stores();
    const c = chars.save({ name: "Cee", title: "Court Commissioner II" });
    expect(isCommissioner(c)).toBe(true);
    expect(hasDocket(c)).toBe(true);
    expect(levelFromTitle(c.title)).toBe("II");
    expect(levelFromTitle("Court Commissioner I")).toBe("I");
    const later = chars.save({ ...c, title: "Attorney at Law" });
    expect(isCommissioner(later)).toBe(false);
    expect(hasDocket(later)).toBe(true);
  });

  it("requires a name", () => {
    const { chars } = stores();
    expect(() => chars.save({ title: "Judge" })).toThrow("A character needs a name.");
    expect(() => chars.save({ name: "   " })).toThrow("A character needs a name.");
  });

  it("caps the list at 200", () => {
    const { chars } = stores();
    for (let i = 0; i < 200; i++) chars.save({ id: `char${String(i).padStart(4, "0")}`, name: "C" + i });
    expect(() => chars.save({ name: "One more" })).toThrow("You can keep up to 200 characters.");
    // Updating an existing one still works at the cap.
    expect(chars.save({ id: "char0000", name: "Renamed" }).name).toBe("Renamed");
  });

  it("duplicates, moves and removes (cascading dockets and J.A.P.)", () => {
    const { kv, chars, dockets, jap } = stores();
    const a = chars.save({ id: "aaaa1111", name: "A" });
    const b = chars.save({ id: "bbbb2222", name: "B" });
    const copy = chars.duplicate(a.id)!;
    expect(copy.name).toBe("A (copy)");
    expect(copy.id).not.toBe(a.id);
    expect(chars.list().map((c) => c.id)).toEqual([a.id, b.id, copy.id]);
    chars.move(copy.id, -1);
    expect(chars.list().map((c) => c.id)).toEqual([a.id, copy.id, b.id]);
    chars.move(a.id, -1); // no-op at the top
    chars.move(b.id, 1); // no-op at the bottom
    expect(chars.list().map((c) => c.id)).toEqual([a.id, copy.id, b.id]);

    dockets.save(a.id, { caseNumber: "90SCCR00001" });
    jap.save(a.id, { level: "I" });
    chars.setActive(a.id);
    chars.remove(a.id);
    expect(chars.get(a.id)).toBeNull();
    expect(chars.activeId()).toBeNull();
    expect((kv as ReturnType<typeof spyKV>).keys().filter((k) => k.includes(a.id))).toEqual([]);
  });

  it("treats a stale active id as none and clears it", () => {
    const { kv, chars } = stores();
    kv.set("lawapp_active_char", "gone1234");
    expect(chars.active()).toBeNull();
    expect(kv.get("lawapp_active_char")).toBeNull();
  });

  it("setActive fires only subscribeActive (AC 26)", () => {
    const { chars } = stores();
    const c = chars.save({ name: "A" });
    const data = vi.fn();
    const active = vi.fn();
    chars.subscribe(data);
    chars.subscribeActive(active);
    chars.setActive(c.id);
    expect(active).toHaveBeenCalledTimes(1);
    expect(data).not.toHaveBeenCalled();
    expect(chars.active()?.id).toBe(c.id);
    const v = chars.version();
    chars.save({ ...c, title: "Judge" });
    expect(data).toHaveBeenCalledTimes(1);
    expect(chars.version()).toBe(v + 1);
    expect(active).toHaveBeenCalledTimes(1);
  });

  it("exports and imports with dockets and J.A.P. (AC 12)", () => {
    const src = stores();
    const a = src.chars.save({ id: "aaaa1111", name: "A", title: "Judge" });
    const b = src.chars.save({ id: "bbbb2222", name: "B" });
    src.dockets.save(a.id, { caseNumber: "90SCCR00001" });
    src.jap.save(b.id, { level: "II", II: { "1.1": [{ num: "90SCCR00002" }] } });
    const doc = src.chars.exportJson();
    expect(doc.app).toBe("jsa-form-generator");
    expect(doc.version).toBe(1);
    // The App adds dockets/jap per character.
    const file = JSON.stringify({
      ...doc,
      characters: doc.characters.map((c) => ({ ...c, dockets: src.dockets.list(c.id), jap: src.jap.get(c.id) })),
    });

    const dst = stores();
    const res = dst.chars.importJson(file);
    expect(res.count).toBe(2);
    for (const { source, character } of res.saved) {
      dst.dockets.replace(character.id, source.dockets);
      dst.jap.replace(character.id, source.jap ?? null);
    }
    expect(dst.chars.list().map((c) => c.name)).toEqual(["A", "B"]);
    expect(dst.dockets.list(a.id).map((d) => d.caseNumber)).toEqual(["90SCCR00001"]);
    expect(dst.jap.get(b.id)?.II["1.1"]).toEqual([{ num: "90SCCR00002" }]);
  });

  it("rejects bad import files", () => {
    const { chars } = stores();
    expect(() => chars.importJson("not json")).toThrow("That file isn't valid JSON.");
    expect(() => chars.importJson('{"x":1}')).toThrow("No characters found in that file.");
    expect(chars.importJson('[{"title":"no name"}, {"name":"Ok"}]').count).toBe(1);
  });

  it("checks the 200 cap before saving anything", () => {
    const { chars } = stores();
    for (let i = 0; i < 199; i++) chars.save({ id: `char${String(i).padStart(4, "0")}`, name: "C" + i });
    const two = JSON.stringify([{ name: "New 1" }, { name: "New 2" }]);
    expect(() => chars.importJson(two)).toThrow("You can keep up to 200 characters.");
    expect(chars.list()).toHaveLength(199);
    const ok = JSON.stringify([{ name: "New 1" }, { id: "char0005", name: "Again" }]);
    expect(chars.importJson(ok).count).toBe(2);
    expect(chars.list()).toHaveLength(200);
  });

  it('stores dockets of an imported "../x" id under its new id (AC 12)', () => {
    const { kv, chars, dockets } = stores();
    const res = chars.importJson(JSON.stringify({ characters: [{ id: "../x", name: "X", dockets: [{ caseNumber: "C1" }] }] }));
    const { source, character } = res.saved[0];
    expect(character.id).not.toBe("../x");
    expect(character.id).toMatch(/^[a-z0-9]{4,32}$/);
    dockets.replace(character.id, source.dockets);
    dockets.replace(source.id as string, source.dockets); // the reference's mistake is a no-op here
    expect(dockets.list(character.id)).toHaveLength(1);
    const keys = (kv as ReturnType<typeof spyKV>).keys();
    expect(keys).not.toContain("lawapp_dockets_../x");
    expect(keys).toContain("lawapp_dockets_" + character.id);
  });

  it("migrates the legacy character list", () => {
    const kv = spyKV();
    kv.set(
      LEGACY_KEY,
      JSON.stringify([
        { id: "0b7c-uuid", fullName: "Old One", title: "Attorney", barNumber: "123", firm: "Doe LLP", phone: "555" },
        { fullName: "" },
      ]),
    );
    const chars = createCharacterStore(kv);
    const fired = vi.fn();
    chars.subscribe(fired);
    expect(chars.migrateLegacy()).toBe(1);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(kv.get(LEGACY_KEY)).toBeNull();
    const [c] = chars.list();
    expect(c).toMatchObject({ name: "Old One", title: "Attorney", bar: "123", phone: "555", notes: "Firm: Doe LLP" });
    // Only once: the new list now exists.
    kv.set(LEGACY_KEY, "[]");
    expect(chars.migrateLegacy()).toBe(0);
  });

  it("sets aside an unreadable legacy list", () => {
    const kv = spyKV();
    kv.set(LEGACY_KEY, "{broken");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(createCharacterStore(kv).migrateLegacy()).toBe(0);
    expect(kv.get(LEGACY_KEY)).toBeNull();
    expect(kv.get(CHARS_KEY)).toBeNull();
    expect(listSetAside(kv)).toMatchObject([{ key: LEGACY_KEY, raw: "{broken" }]);
    warn.mockRestore();
  });
});

describe("dockets", () => {
  const ID = "judge001";

  it("sorts open cases first, then by next date, then newest", () => {
    const { dockets } = stores();
    dockets.save(ID, { caseNumber: "A", status: "Closed", nextDate: "2026-01-01" });
    dockets.save(ID, { caseNumber: "B", nextDate: "2026-03-01" });
    dockets.save(ID, { caseNumber: "C" });
    dockets.save(ID, { caseNumber: "D", nextDate: "2026-02-01" });
    expect(dockets.list(ID).map((d) => d.caseNumber)).toEqual(["D", "B", "C", "A"]);
  });

  it("rejects duplicate case numbers and missing ones", () => {
    const { dockets } = stores();
    dockets.save(ID, { caseNumber: "90sccr00001" });
    expect(() => dockets.save(ID, { caseNumber: "90SCCR00001" })).toThrow("90SCCR00001 is already on this docket.");
    expect(() => dockets.save(ID, { caseNumber: " " })).toThrow("A docket needs a case number.");
  });

  it("cleans links, dates, status and length", () => {
    const { dockets } = stores();
    const d = dockets.save(ID, {
      caseNumber: "X1",
      link: "javascript:alert(1)",
      filed: "2026/01/01",
      nextDate: "2026-01-02",
      status: "Weird" as never,
      notes: "n".repeat(5000),
    })!;
    expect(d.link).toBeUndefined();
    expect(d.filed).toBeUndefined();
    expect(d.nextDate).toBe("2026-01-02");
    expect(d.status).toBe(STATUSES[0]);
    expect(d.notes).toHaveLength(4000);
    expect(dockets.save(ID, { caseNumber: "X2", link: "https://example.com/x" })!.link).toBe("https://example.com/x");
  });

  it("upserts by case number keeping other fields", () => {
    const { dockets } = stores();
    dockets.save(ID, { caseNumber: "90SCCC00042", plaintiff: "P", notes: "keep" });
    const u = dockets.upsert(ID, { caseNumber: "90sccc00042", defendant: "D" })!;
    expect(u).toMatchObject({ plaintiff: "P", defendant: "D", notes: "keep" });
    expect(dockets.list(ID)).toHaveLength(1);
    expect(dockets.findByCase(ID, " 90SCCC00042 ")?.id).toBe(u.id);
    dockets.upsert(ID, { caseNumber: "NEW" });
    expect(dockets.list(ID)).toHaveLength(2);
  });

  it("removes and replaces; empty list removes the key", () => {
    const { kv, dockets } = stores();
    const d = dockets.save(ID, { caseNumber: "A" })!;
    dockets.remove(ID, d.id);
    expect(kv.get("lawapp_dockets_" + ID)).toBeNull();
    dockets.replace(ID, [{ caseNumber: "R1" }, { nope: true }, null]);
    expect(dockets.list(ID).map((x) => x.caseNumber)).toEqual(["R1"]);
    dockets.removeAll(ID);
    expect(dockets.list(ID)).toEqual([]);
  });

  it("ignores invalid character ids", () => {
    const { kv, dockets } = stores();
    expect(dockets.save("../x", { caseNumber: "A" })).toBeNull();
    dockets.replace("../x", [{ caseNumber: "A" }]);
    expect(dockets.list("../x")).toEqual([]);
    expect(dockets.get("../x", "a")).toBeNull();
    expect((kv as ReturnType<typeof spyKV>).keys()).toEqual([]);
  });

  it("only data mutations notify", () => {
    const { dockets } = stores();
    const fn = vi.fn();
    dockets.subscribe(fn);
    dockets.list(ID);
    expect(fn).not.toHaveBeenCalled();
    dockets.save(ID, { caseNumber: "A" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("finds the division from the case code, else the court", () => {
    expect(divisionFor({ caseNumber: "90SCCC00147" })).toBe("CIVIL DIVISION");
    expect(divisionFor({ caseNumber: "2026-CV-1", court: "Superior Court of San Andreas - Traffic Division" })).toBe(
      "TRAFFIC DIVISION",
    );
    expect(divisionFor({ caseNumber: "2026-CV-0042" })).toBeUndefined();
  });
});

describe("portfolio", () => {
  const ID = "comm0001";

  it("renders the reference header and topic title (AC 17)", () => {
    const out = render("I", {}, "Jane Roe");
    expect(out.startsWith("[divbox=transparent][br][/br][size=165][b][center]JUDICIAL ADVANCEMENT PORTFOLIO")).toBe(true);
    expect(out).toContain("[center]Jane Roe - Court Commissioner I[/center][hr]\n");
    expect(out.endsWith("[/divbox]")).toBe(true);
    expect(render("II", null)).toContain("[center]Firstname Lastname - Court Commissioner II[/center]");
    expect(topicTitle("Jane Roe")).toBe("[J.A.P.] Jane Roe");
    expect(topicTitle("  ")).toBe("[J.A.P.] Firstname Lastname");
  });

  it("pads required tasks with placeholder lines and fills entries", () => {
    const out = render("I", {
      "1.1": [{ num: "90SCCR00001", caption: "People v. X", link: "https://f.gta/1" }],
      "2.1": [{ num: "AW-12345" }],
      "3.1": [{ date: "2026-01-02", link: "https://f.gta/t" }],
    });
    expect(out).toContain(
      "[b]1.1. Preside over two trials resolved through summary judgment.[/b]\n[list]\n[*][url=https://f.gta/1][90SCCR00001] People v. X[/url]\n[*][url=LINKTOCASE][XXSCCR00000] People of the State of San Andreas v. John Doe[/url]\n[/list]",
    );
    expect(out).toContain("[*][url=LINKTOWARRANT]AW-12345[/url]");
    expect(out).toContain("[*][url=LINKTOWARRANT]SW-00000[/url]");
    expect(out).toContain("[*][url=https://f.gta/t]02/JAN/2026[/url]");
    expect(out).toContain(", [url=LINKTODISCORDMESSAGE]#courts-csb/#sadcr[/url]");
  });

  it("CC II texts differ from CC I", () => {
    expect(LEVELS.II.sections[1].tasks[0].text).toBe("Review five arrest warrants (include at least one denial).");
    expect(LEVELS.I.sections[1].tasks[0].text).toBe("Review five arrest warrants.");
    expect(render("II", {})).toContain("[b]3.3. Draft an appellate opinion.[/b]\n[color=#444444]Reach out to your supervisor");
  });

  it("cleans text and urls", () => {
    expect(cleanText(" a[b]\u0001c ")).toBe("a(b) c");
    expect(cleanText("x".repeat(400))).toHaveLength(300);
    expect(cleanUrl("https://e.com/a[1]")).toBe("https://e.com/a%5B1%5D");
    expect(cleanUrl("javascript:alert(1)")).toBe("");
    expect(cleanUrl("https://e.com/" + "a".repeat(1000))).toBe("");
  });

  it("counts progress and completeness", () => {
    expect(complete("case", { num: "1", link: "https://x" })).toBe(true);
    expect(complete("case", { num: "1" })).toBe(false);
    const p = progress("I", { "1.1": [{ num: "1", link: "https://x" }, { num: "2", link: "https://y" }, { num: "3", link: "https://z" }] });
    expect(p).toEqual({ done: 2, need: 24 });
  });

  it("stores per character, keeps levels apart and ignores invalid ids", () => {
    const { kv, jap } = stores();
    const saved = jap.save(ID, {
      level: "II",
      I: { "1.1": [{ num: "A", bogus: "x" }, {}] },
      II: { "1.1": [{ num: "B", link: "ftp://no" }] },
    })!;
    expect(saved.I).toEqual({ "1.1": [{ num: "A" }] });
    expect(saved.II).toEqual({ "1.1": [{ num: "B" }] });
    expect(jap.get(ID)?.level).toBe("II");
    jap.replace(ID, null);
    expect(jap.get(ID)).toBeNull();
    expect(jap.save("../x", {})).toBeNull();
    expect((kv as ReturnType<typeof spyKV>).keys()).toEqual([]);
  });
});
