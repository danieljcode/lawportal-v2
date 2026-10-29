// The Rolodex's store (LP-30): cleaning, saving, order, search and the route.
import { describe, expect, it } from "vitest";
import { cleanContact, createContactStore, filterContacts, CONTACTS_KEY, MAX_CONTACTS } from "@/lib/contacts";
import { isBackedUp } from "@/lib/backup";
import { memoryKV } from "@/lib/storage";
import { parseHash, hashFor, pageTitle } from "@/shell/useRoute";

describe("contacts (LP-30)", () => {
  it("cleans untrusted input: needs a name, keeps known fields, defaults the type", () => {
    expect(cleanContact({ name: "  " })).toBeNull();
    expect(cleanContact(null)).toBeNull();
    const c = cleanContact({ name: " Judy Bench ", type: "wizard", phone: "555-0100", evil: "<b>", notes: "" })!;
    expect(c).toMatchObject({ name: "Judy Bench", type: "client", phone: "555-0100" });
    expect(c).not.toHaveProperty("evil");
    expect(c).not.toHaveProperty("notes");
    expect(c.updated).toBe(c.created);
  });

  it("saves, updates, lists A–Z and removes", () => {
    const store = createContactStore(memoryKV());
    const zed = store.save({ name: "Zed's Garage", type: "business" });
    const amy = store.save({ name: "Amy Adams", type: "witness" });
    expect(store.list().map((c) => c.name)).toEqual(["Amy Adams", "Zed's Garage"]);
    const moved = store.save({ ...amy, phone: "555-0199" });
    expect(moved.id).toBe(amy.id);
    expect(moved.created).toBe(amy.created);
    expect(store.get(amy.id)?.phone).toBe("555-0199");
    store.remove(zed.id);
    expect(store.list().map((c) => c.id)).toEqual([amy.id]);
    expect(() => store.save({ name: "" })).toThrow(/name/);
  });

  it("stops at MAX_CONTACTS new contacts", () => {
    const store = createContactStore(memoryKV());
    store.replaceAll(Array.from({ length: MAX_CONTACTS }, (_, i) => ({ name: "C" + i })));
    expect(store.list()).toHaveLength(MAX_CONTACTS);
    expect(() => store.save({ name: "One more" })).toThrow(/up to/);
  });

  it("searches every word across the fields, and filters by type", () => {
    const store = createContactStore(memoryKV());
    store.save({ name: "Judy Bench", type: "judge", address: "Mission Row" });
    store.save({ name: "Bob Badge", type: "officer", notes: "Mission Row precinct" });
    const all = store.list();
    expect(filterContacts(all, { q: "mission row" }).map((c) => c.name)).toEqual(["Bob Badge", "Judy Bench"]);
    expect(filterContacts(all, { q: "mission", type: "judge" }).map((c) => c.name)).toEqual(["Judy Bench"]);
    expect(filterContacts(all, { q: "officer" }).map((c) => c.name)).toEqual(["Bob Badge"]);
    expect(filterContacts(all, {})).toHaveLength(2);
  });

  it("is in the full backup", () => {
    expect(isBackedUp(CONTACTS_KEY)).toBe(true);
  });

  it("opens at #clients/rolodex", () => {
    const r = parseHash("#clients/rolodex");
    expect(r).toEqual({ program: "clients", page: "rolodex" });
    expect(hashFor(r)).toBe("#clients/rolodex");
    expect(pageTitle(r, null)).toBe("Rolodex");
  });
});
