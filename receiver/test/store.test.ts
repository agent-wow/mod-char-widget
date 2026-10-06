// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, test } from "bun:test";
import { batch, catalogChunk, panelData } from "../examples/fixtures.ts";
import { isBatch, isCatalogChunk, isPanelData, STALE_MS } from "../src/schema.ts";
import { SelectionError, Store } from "../src/store.ts";

describe("schema and state", () => {
  test("all seven full panels, including carried/bank slots and both specs, validate", () => {
    expect(isBatch(batch())).toBe(true);
    expect(isCatalogChunk(catalogChunk())).toBe(true);
    const data = panelData();
    expect(data.talents.specs).toHaveLength(2);
    expect(data.inventory.containers.filter((c) => c.kind === "bank")).toHaveLength(8);
    data.talents.specs[1]!.index = 0;
    expect(isPanelData("talents", data.talents)).toBe(false);
    data.inventory.containers[0]!.slots[1]!.slot = data.inventory.containers[0]!.slots[0]!.slot;
    expect(isPanelData("inventory", data.inventory)).toBe(false);
  });
  test("malformed nested values, duplicate quests, oversized panels and invalid sequences are rejected", () => {
    const value = batch(); value.updates[0]!.sequence = "18446744073709551616";
    expect(isBatch(value)).toBe(false);
    value.updates[0]!.sequence = "01"; expect(isBatch(value)).toBe(false);
    const data = panelData(); data.info.health = NaN; expect(isPanelData("info", data.info)).toBe(false);
    data.quests.quests.push(data.quests.quests[0]!); expect(isPanelData("quests", data.quests)).toBe(false);
    const large = batch();
    const item = (large.updates[6]!.data as typeof data.inventory).containers[0]!.slots[1]!.item!;
    item.icon = "../../private"; expect(isBatch(large)).toBe(false);
  });
  test("catalogue-required response and atomic chunk publication recover receiver restarts", () => {
    const store = new Store(); expect(() => store.ingest(batch())).toThrow("catalog_required");
    expect(store.view("realm-1", "Alice")).toBeNull();
    const catalog = catalogChunk(); const middle = Math.floor(catalog.entries.length / 2);
    store.ingestCatalog({ ...catalog, chunk_count: 2, chunk_index: 1, entries: catalog.entries.slice(middle) });
    expect(store.catalog("realm-1", "demo-process", "demo-process")).toBeUndefined();
    store.ingestCatalog({ ...catalog, chunk_count: 2, chunk_index: 0, entries: catalog.entries.slice(0, middle) });
    store.ingest(batch()); expect(store.view("realm-1", "Alice")?.panels.inventory).toBeDefined();
    store.ingestCatalog({ ...catalog, chunk_count: 2, chunk_index: 0, entries: catalog.entries.slice(0, middle) });
    expect(() => store.ingestCatalog({ ...catalog, chunk_count: 2, entries: [] })).toThrow("Immutable catalogue");
  });
  test("sequence ordering is per panel; duplicates do not extend presence freshness", () => {
    let now = 0; const store = new Store(() => now); store.ingestCatalog(catalogChunk()); store.ingest(batch());
    now = STALE_MS - 1; store.ingest(batch()); expect(store.view("realm-1", "Alice")?.stale).toBe(false);
    now = STALE_MS; const stale = store.view("realm-1", "Alice");
    expect(stale?.stale).toBe(true); expect(stale?.panels.info).toBeDefined();
    const update = batch(100); update.updates = update.updates.filter((u) => u.panel === "presence");
    store.ingest(update); expect(store.view("realm-1", "Alice")?.stale).toBe(false);
    expect(store.view("realm-1", "Alice")?.panels.info?.sequence).toBe("1");
  });
  test("offline panels are retained, older queued panels cannot overwrite logout, and login recovers", () => {
    const store = new Store(); store.ingestCatalog(catalogChunk()); store.ingest(batch());
    const logout = batch(100); logout.updates = [logout.updates.at(-1)!];
    logout.updates[0]!.data = { presence: "offline" }; store.ingest(logout);
    store.ingest(batch(50)); expect(store.view("realm-1", "Alice")?.presence).toBe("offline");
    expect(store.view("realm-1", "Alice")?.panels.info?.sequence).toBe("1");
    store.ingest(batch(200)); expect(store.view("realm-1", "Alice")?.presence).toBe("online");
  });
  test("presence revisions distinguish unchanged content from a missed panel update", () => {
    const store = new Store(); store.ingestCatalog(catalogChunk()); store.ingest(batch());
    const heartbeat = batch(100); heartbeat.updates = [heartbeat.updates.at(-1)!];
    store.ingest(heartbeat);
    expect(store.view("realm-1", "Alice")?.stale).toBe(false);
    expect(store.view("realm-1", "Alice")?.panels.info?.stale).toBe(true);
    store.ingest(batch(100));
    expect(store.view("realm-1", "Alice")?.panels.info?.stale).toBe(false);
  });
  test("retained quest age freezes at logout even for a newly connected browser", () => {
    let now = 0; const store = new Store(() => now); store.ingestCatalog(catalogChunk()); store.ingest(batch());
    now = 2000; const offline = batch(20); offline.updates = [offline.updates.at(-1)!];
    offline.updates[0]!.data = { presence: "offline" }; store.ingest(offline);
    now = 90000;
    expect(store.view("realm-1", "Alice")?.panels.quests?.age_ms).toBe(2000);
  });
  test("a new process retires the old one; expired updates cannot switch generation", () => {
    const store = new Store(); store.ingestCatalog(catalogChunk()); store.ingest(batch());
    store.ingestCatalog(catalogChunk("new"));
    const expired = batch(1, "Alice", 0, "new"); expired.updates.forEach((u) => { u.age_ms = STALE_MS; });
    store.ingest(expired); expect(store.view("realm-1", "Alice")?.process_id).toBe("demo-process");
    store.ingest(batch(1, "Alice", 0, "new")); store.ingest(batch(500));
    expect(store.view("realm-1", "Alice")?.process_id).toBe("new");
  });
  test("source/name selection has no unfiltered fallback and detects ambiguity", () => {
    const store = new Store(); store.ingestCatalog(catalogChunk()); store.ingest(batch());
    const params = new URLSearchParams({ source: "realm-1", character: "alice" });
    expect(store.resolve(params).guid).toBe("Alice");
    expect(() => store.resolve(new URLSearchParams({ source: "realm-2", character: "alice" }))).toThrow();
    const other = batch(20); other.updates.forEach((u) => { u.guid = "another-guid"; }); store.ingest(other);
    expect(() => store.resolve(params)).toThrow("Ambiguous");
    params.set("guid", "Alice"); expect(() => store.resolve(params)).toThrow("Select a source");
  });
  test("capacity evicts stale entries first and failed admission leaves existing data intact", () => {
    let now = 0; const store = new Store(() => now, 256 * 1024 * 1024, 1);
    store.ingestCatalog(catalogChunk()); store.ingest(batch());
    expect(() => store.ingest(batch(20, "Bob"))).toThrow("State capacity");
    expect(store.view("realm-1", "Alice")).not.toBeNull();
    now = STALE_MS; store.ingest(batch(20, "Bob"));
    expect(store.view("realm-1", "Alice")).toBeNull(); expect(store.view("realm-1", "Bob")).not.toBeNull();
  });
  test("duplicate metadata IDs never publish an incomplete or corrupt catalogue", () => {
    const store = new Store(); const value = catalogChunk(); value.entries.push(value.entries[0]!);
    expect(() => store.ingestCatalog(value)).toThrow("Duplicate catalogue");
    expect(store.catalog("realm-1", "demo-process", "demo-process")).toBeUndefined();
    try { store.ingest(batch()); } catch (error) { expect((error as SelectionError).status).toBe(409); }
  });
});
