// SPDX-License-Identifier: GPL-2.0-or-later
import { batch, catalogChunk } from "./fixtures.ts";
const endpoint = new URL(process.env.CHAR_WIDGET_DEMO_ENDPOINT ?? "http://127.0.0.1:3002/characters");
const token = process.env.CHAR_WIDGET_BEARER_TOKEN;
const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const processId = `demo-${crypto.randomUUID()}`;
async function post(url: URL, value: unknown) {
  return fetch(url, { method: "POST", headers, body: JSON.stringify(value), signal: AbortSignal.timeout(5000) });
}
async function catalog() {
  const url = new URL(endpoint); url.pathname = url.pathname.replace(/characters$/, "catalogs");
  const response = await post(url, catalogChunk(processId));
  if (!response.ok) throw new Error(`Catalogue rejected: ${response.status}`);
}
let sequence = 1;
let tick = 0;
console.error("Synthetic characters: Alice, Empty, Offline, A very long character name for layout checks");
for (;;) {
  try {
    if (tick === 0) await catalog();
    for (const name of ["Alice", "Empty", "Offline", "A very long character name for layout checks"]) {
      const value = batch(sequence, name, tick, processId); sequence += 8;
      if (name === "Empty") for (const update of value.updates) {
        if (update.panel === "quests") update.data = { quests: [] };
        if (update.panel === "skills") update.data = { skills: [] };
        if (update.panel === "reputation") update.data = { factions: [] };
        if (update.panel === "achievements") update.data = { points: 0, faction: 1, earned: [], progress: [] };
      }
      if (name === "Offline") value.updates.at(-1)!.data = { presence: "offline" };
      let response = await post(endpoint, value);
      if (response.status === 409) { await catalog(); response = await post(endpoint, value); }
      if (!response.ok) throw new Error(`Demo batch rejected: ${response.status}`);
    }
    ++tick;
  } catch (error) { console.error(error instanceof Error ? error.message : "Demo delivery failed"); }
  await Bun.sleep(2000);
}
