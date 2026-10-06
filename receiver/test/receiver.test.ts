// SPDX-License-Identifier: GPL-2.0-or-later
import { afterEach, expect, test } from "bun:test";
import { batch, catalogChunk } from "../examples/fixtures.ts";
import { createReceiver } from "../src/receiver.ts";
import { snapshotStream } from "../src/stream.ts";
import { Store } from "../src/store.ts";
const running: ReturnType<typeof createReceiver>[] = [];
afterEach(async () => { await Promise.all(running.splice(0).map((r) => r.stop())); });
function start(token?: string) {
  const r = createReceiver({ host: "127.0.0.1", port: 0, token });
  running.push(r);
  return r;
}
async function post(r: ReturnType<typeof createReceiver>, path: string, value: unknown, token?: string) {
  return fetch(new URL(path, r.server.url), { method: "POST", headers: { "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value) });
}
test("authenticated ingestion, atomic validation, catalogue replay, discovery and panel filtering", async () => {
  const r = start("secret");
  expect((await post(r, "/characters", batch())).status).toBe(401);
  expect((await post(r, "/characters", batch(), "secret")).status).toBe(409);
  expect((await post(r, "/catalogs", catalogChunk(), "secret")).status).toBe(204);
  const invalid = batch(); invalid.updates[6]!.data = { money: 1 } as never;
  expect((await post(r, "/characters", invalid, "secret")).status).toBe(422);
  expect(r.store.view("realm-1", "Alice")).toBeNull();
  expect((await post(r, "/characters", batch(), "secret")).status).toBe(204);
  const response = await fetch(new URL("/api/character?source=realm-1&character=alice&panel=inventory", r.server.url));
  expect(response.headers.get("cache-control")).toBe("no-store");
  const view = await response.json(); expect(Object.keys(view.panels)).toEqual(["inventory"]);
  const discovery = await fetch(new URL("/api/characters?source=realm-1", r.server.url));
  expect((await discovery.json()).characters[0].name).toBe("Alice");
  const catalog = await fetch(new URL("/api/catalog?source=realm-1&process=demo-process&revision=demo-process",
    r.server.url));
  expect((await catalog.json()).talents.length).toBeGreaterThan(0);
});
test("invalid media, JSON, selectors, methods, and paths fail without affecting state", async () => {
  const r = start();
  expect((await fetch(new URL("/characters", r.server.url), { method: "POST", body: "{}" })).status).toBe(415);
  expect((await fetch(new URL("/characters", r.server.url))).status).toBe(405);
  expect((await fetch(new URL("/api/character?source=realm-1", r.server.url))).status).toBe(400);
  expect((await fetch(new URL("/missing", r.server.url))).status).toBe(404);
  expect((await fetch(new URL("/characters", r.server.url), { method: "POST",
    headers: { "Content-Type": "application/json" }, body: "{" })).status).toBe(400);
  const widget = await fetch(new URL("/widget", r.server.url));
  expect(widget.headers.get("content-security-policy")).toContain("default-src 'self'");
});
test("SSE emits initial identity and each panel, reconnects to latest state, and retains stale data", async () => {
  let now = 0; const store = new Store(() => now); store.ingestCatalog(catalogChunk()); store.ingest(batch());
  const abort = new AbortController(); const stream = snapshotStream(store, "realm-1", "Alice", abort.signal);
  const reader = stream.stream.getReader(); const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain("event: snapshot");
  let panelEvents = 0;
  while (panelEvents < 7) if (decoder.decode((await reader.read()).value).includes("event: panel")) ++panelEvents;
  now = 15000;
  const stale = decoder.decode((await reader.read()).value); expect(stale).toContain('"stale":true');
  abort.abort(); expect(stream.closed).toBe(true); await reader.cancel();
  store.ingest(batch(100));
  const next = snapshotStream(store, "realm-1", "Alice", new AbortController().signal, undefined, "inventory");
  const nextReader = next.stream.getReader(); await nextReader.read();
  expect(decoder.decode((await nextReader.read()).value)).toContain('"sequence":"106"');
  await nextReader.cancel(); expect(next.closed).toBe(true);
});
test("SSE rejects an event larger than its buffering budget and closes on shutdown", async () => {
  const r = start(); r.store.ingestCatalog(catalogChunk()); r.store.ingest(batch());
  const stream = snapshotStream(r.store, "realm-1", "Alice", new AbortController().signal, undefined, "all", 1);
  expect(stream.closed).toBe(true);
  const abort = new AbortController();
  const response = await fetch(new URL("/api/character/stream?source=realm-1&guid=Alice", r.server.url),
    { signal: abort.signal });
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  abort.abort(); await r.stop();
});
