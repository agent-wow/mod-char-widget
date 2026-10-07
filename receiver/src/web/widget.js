// SPDX-License-Identifier: GPL-2.0-or-later
import { resolveObserver, validFollow, SelectionError } from "./follow.js";
import { PanelRenderer, labels, symbols, el } from "./render.js";
/** @typedef {import('../schema.ts').View} View */
/** @typedef {import('../schema.ts').Catalog} Catalog */
/** @typedef {import('../schema.ts').Panel} Panel */
const panels = /** @type {Panel[]} */ (Object.keys(labels));
const params = new URLSearchParams(location.search);
const follow = params.get("follow") === "watch";
const mode = params.get("panel") ?? "all";
const source = params.get("source");
const character = params.get("character");
let guid = params.get("guid");
let selected = mode === "all" ? "info" : mode;
/** @type {View | null} */ let view = null;
/** @type {Catalog} */ let catalog = { achievements: [], criteria: [], categories: [], trees: [], talents: [] };
/** @type {EventSource | null} */ let connection = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
let failures = 0;
let stopped = false;
let received = performance.now();
let catalogKey = "";
let loadingKey = "";
const renderers = new Map();
const byId = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const status = byId("connection");
/** @param {string} [message] */
function setStatus(message = "") {
  status.textContent = message;
  status.hidden = !message;
}
for (const panel of panels) {
  if (mode !== "all" && mode !== panel) continue;
  const section = el("section", "panel"); section.id = `panel-${panel}`;
  section.setAttribute("aria-label", labels[panel]); section.hidden = panel !== selected;
  byId("panels").append(section); renderers.set(panel, new PanelRenderer(panel, section));
  const button = el("button", `tab ${panel === selected ? "active" : ""}`);
  button.append(el("span", "", symbols[panel]), document.createTextNode(labels[panel]));
  button.setAttribute("aria-selected", String(panel === selected));
  button.onclick = () => {
    selected = panel;
    for (const p of panels) { const node = document.getElementById(`panel-${p}`); if (node) node.hidden = p !== panel; }
    for (const b of byId("tabs").children) { b.classList.toggle("active", b === button);
      b.setAttribute("aria-selected", String(b === button)); }
    display();
  };
  byId("tabs").append(button);
}
/** @param {Panel | undefined} [changed] */
function display(changed) {
  if (!view) return;
  document.title = `${view.name} — Character panels`;
  byId("window").setAttribute("aria-label", `${view.name} — Character panels`);
  setStatus(view.stale ? "Stale · Showing last known state" : view.presence === "offline" ? "Offline" :
    view.presence === "unavailable" ? "Unavailable · Character changing maps…" :
    catalogKey ? "" : "Loading catalogue…");
  if (view.presence === "online" && !view.stale && view.panels[/** @type {Panel} */ (selected)]?.stale) {
    setStatus("Waiting for current panel data…");
  }
  for (const [panel, renderer] of renderers) renderer.update(view, catalog, panel === changed);
}
async function loadCatalog() {
  if (!view || stopped) return;
  const target = `${view.process_id}:${view.catalog_revision}`;
  if (catalogKey === target || loadingKey === target) return;
  loadingKey = target;
  try {
    const query = new URLSearchParams({ source: view.source_id, process: view.process_id,
      revision: view.catalog_revision });
    const response = await fetch(`/api/catalog?${query}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Catalogue unavailable");
    const value = /** @type {Catalog} */ (await response.json());
    if (!view || target !== `${view.process_id}:${view.catalog_revision}`) return;
    catalog = value; catalogKey = target;
    for (const [panel, renderer] of renderers) {
      if (["talents", "achievements"].includes(panel)) renderer.update(view, catalog, true);
      else renderer.catalog = catalog;
    }
    display();
  } catch { setStatus("Waiting for display catalogue…"); }
  finally { if (loadingKey === target) loadingKey = ""; }
}
/** @param {View | null} next @param {boolean} [replace] */
function snapshot(next, replace = true) {
  if (!next) {
    view = null;
    for (const renderer of renderers.values()) renderer.reset();
    setStatus("Waiting for observer or character data…"); return;
  }
  const same = view?.guid === next.guid && view.process_id === next.process_id &&
    view.catalog_revision === next.catalog_revision;
  if (!same) for (const renderer of renderers.values()) renderer.reset();
  const prior = same ? view?.panels : undefined;
  view = { ...next, panels: replace ? next.panels : { ...prior, ...next.panels } };
  received = performance.now(); if (!follow) guid = next.guid;
  if (!same) { catalogKey = "";
    catalog = { achievements: [], criteria: [], categories: [], trees: [], talents: [] }; }
  for (const panel of Object.keys(next.panels)) {
    renderers.get(panel)?.update(view, catalog, true);
  }
  display(); void loadCatalog();
}
async function connect() {
  if (stopped) return;
  try {
    guid = await resolveObserver(source, guid, character, follow);
    const query = new URLSearchParams({ source: source ?? "", panel: mode });
    if (follow) query.set("follow", "watch");
    query.set(guid ? "guid" : "character", guid ?? character ?? "");
    const response = await fetch(`/api/character?${query}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      const body = await response.json(); setStatus(body.error);
      if ([400, 409].includes(response.status)) return;
      throw new Error("Waiting");
    }
    snapshot(await response.json());
    if (guid) { query.delete("character"); query.set("guid", guid); }
    connection?.close();
    const current = new EventSource(`/api/character/stream?${query}`); connection = current;
    current.onopen = () => { if (connection !== current || stopped) return; failures = 0; };
    current.addEventListener("snapshot", (event) => {
      if (connection === current && !stopped) snapshot(JSON.parse(event.data), false);
    });
    current.addEventListener("presence", (event) => {
      if (connection === current && !stopped) snapshot(JSON.parse(event.data), false);
    });
    current.addEventListener("panel", (event) => {
      if (connection !== current || stopped) return;
      if (!view) return;
      const data = JSON.parse(event.data);
      if (!panels.includes(data.panel)) return;
      view.panels[/** @type {Panel} */ (data.panel)] = {
        sequence: data.sequence, age_ms: data.age_ms, stale: data.stale, data: data.data };
      display(data.panel);
    });
    current.onerror = () => {
      if (connection !== current || stopped) return;
      current.close(); setStatus("Reconnecting…"); schedule();
    };
  } catch (error) {
    if (error instanceof SelectionError) {
      setStatus(error.message);
      if ([400, 409].includes(error.status)) { stopped = true; return; }
    }
    schedule();
  }
}
function schedule() {
  if (stopped) return;
  clearTimeout(timer); timer = setTimeout(() => { void connect(); }, Math.min(1000 * 2 ** failures++, 10000));
}
const ticker = setInterval(() => {
  if (view && view.presence !== "offline" && !view.stale && view.age_ms + performance.now() - received >= 15000) {
    view.stale = true;
    display();
  }
  renderers.get(selected)?.tick();
  if (view && !catalogKey && !loadingKey) void loadCatalog();
}, 500);
if (!validFollow(params) || !source || Boolean(guid) === Boolean(character) ||
  (mode !== "all" && !panels.includes(/** @type {Panel} */ (mode)))) {
  setStatus("Use /widget?source=realm-1&character=Alice&panel=all");
} else {
  document.title = `${character ?? "Character"} — Character panels`;
  for (const renderer of renderers.values()) renderer.render();
  void connect();
}
window.addEventListener("pagehide", () => {
  stopped = true; connection?.close(); clearTimeout(timer); clearInterval(ticker);
});
