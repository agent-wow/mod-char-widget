// SPDX-License-Identifier: GPL-2.0-or-later
export const STALE_MS = 15000;
export const MAX_PANEL_BYTES = 2 * 1024 * 1024;
export const PANELS = ["info", "reputation", "skills", "talents", "achievements", "quests", "inventory"] as const;
export type Panel = typeof PANELS[number];
export type Presence = "online" | "offline" | "unavailable";
export interface Stat { label: string; value: number; group: string }
export interface Item {
  id: number; name: string; icon: string; quality: number; count: number; level: number;
  required_level: number; inventory_type: number; durability: number; max_durability: number;
  bound: boolean; description: string; armor: number; delay_ms: number; sell_price: number;
  stats: Stat[]; enchants: { id: number; name: string; gem: boolean }[];
  sockets: { color: number; gem_id: number }[];
  spells: { id: number; name: string; trigger: number }[];
  damage: { min: number; max: number; school: number }[];
}
export interface Slot { slot: number; item: Item | null }
export interface Info {
  race: string; class_id: number; level: number; title: string; guild: string;
  xp: number; max_xp: number; rested: number; health: number; max_health: number;
  stats: Stat[]; equipment: Slot[];
}
export interface Reputation {
  factions: { id: number; name: string; group: string; standing: number; rank: number;
    value: number; max: number; watched: boolean; inactive: boolean; at_war: boolean }[];
}
export interface Skills {
  skills: { id: number; name: string; category: string; value: number; max: number;
    permanent_bonus: number; temporary_bonus: number; icon: string }[];
}
export interface Talents {
  class_id: number; active_spec: number; spec_count: number; free_points: number;
  specs: { index: number; points: number[]; ranks: { id: number; rank: number }[] }[];
  glyphs: { slot: number; id: number; spell_id: number; name: string;
    major: boolean; enabled: boolean; icon: string }[];
}
export interface Achievements {
  points: number; faction: number; earned: { id: number; date: number }[];
  progress: { id: number; counter: number; date: number }[];
}
export interface Quest {
  id: number; slot: number; name: string; level: number; group: string; details: string; objectives_text: string;
  status: "incomplete" | "complete" | "failed"; remaining_ms: number | null;
  objectives: { text: string; value: number; max: number }[];
  rewards: { item: Item; choice: boolean }[]; money: number; xp: number;
  reward_stats: Stat[]; reward_text: string[];
}
export interface Quests { quests: Quest[] }
export interface Inventory {
  money: number; honor: number; arena: number;
  containers: { id: string; name: string; kind: "carried" | "bank" | "keyring" | "currency";
    capacity: number; available: boolean; slots: Slot[] }[];
}
export interface PanelData {
  info: Info; reputation: Reputation; skills: Skills; talents: Talents;
  achievements: Achievements; quests: Quests; inventory: Inventory;
}
export interface PresenceData { presence: Presence; revisions?: Partial<Record<Panel, string>> }
export interface Update {
  guid: string; name: string; panel: Panel | "presence"; sequence: string; age_ms: number;
  catalog_revision: string; data: PanelData[Panel] | PresenceData;
}
export interface Batch { schema_version: 1; source_id: string; process_id: string; updates: Update[] }
export interface AchievementDefinition {
  id: number; name: string; description: string; category: number; points: number;
  flags: number; faction: number; icon: string; ref: number; count: number;
}
export interface Criterion {
  id: number; achievement: number; name: string; type: number; asset: number; target: number | null; order: number;
}
export interface Category { id: number; parent: number; name: string; order: number }
export interface Tree { id: number; name: string; class_mask: number; page: number; icon: string }
export interface Talent {
  id: number; tree: number; row: number; col: number; depends_on: number; depends_rank: number;
  ranks: { id: number; name: string; icon: string }[];
}
export interface Catalog {
  achievements: AchievementDefinition[];
  criteria: Criterion[];
  categories: Category[];
  trees: Tree[];
  talents: Talent[];
}
export type CatalogEntry = { [K in keyof Catalog]: { kind: K; data: Catalog[K][number] } }[keyof Catalog];
export interface CatalogChunk {
  schema_version: 1; source_id: string; process_id: string; revision: string;
  chunk_index: number; chunk_count: number; entries: CatalogEntry[];
}
export interface PanelView { sequence: string; age_ms: number; stale: boolean; data: PanelData[Panel] }
export interface View {
  source_id: string; process_id: string; guid: string; name: string; presence: Presence;
  stale: boolean; age_ms: number; catalog_revision: string; sequence: string;
  panels: Partial<Record<Panel, PanelView>>;
}

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 1024): v is string => typeof v === "string" && v.length <= max;
const identity = (v: unknown): v is string => text(v, 256) && v.length > 0;
const num = (v: unknown, min = -1e12, max = 1e12): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const int = (v: unknown, min = 0, max = 0xffffffff): v is number => num(v, min, max) && Number.isInteger(v);
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const list = (v: unknown, check: (v: unknown) => boolean, max = 10000): boolean =>
  Array.isArray(v) && v.length <= max && v.every(check);
const unique = (v: unknown, key: string): boolean => Array.isArray(v) &&
  new Set(v.map((x) => object(x) ? x[key] : undefined)).size === v.length;
const icon = (v: unknown): boolean => text(v, 128) && /^(?:[a-z0-9_]{1,128})?$/.test(v);
export const sequence = (v: unknown): v is string => typeof v === "string" &&
  /^[1-9][0-9]{0,19}$/.test(v) && BigInt(v) <= 18446744073709551615n;
const revision = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(v);
const stat = (v: unknown): boolean => object(v) && text(v.label) && text(v.group) && num(v.value);
function item(v: unknown): boolean {
  return object(v) && int(v.id, 1) && text(v.name) && icon(v.icon) && int(v.quality, 0, 7) && int(v.count) &&
    int(v.level) && int(v.required_level) && int(v.inventory_type) && int(v.durability) && int(v.max_durability) &&
    bool(v.bound) && text(v.description, 16384) && int(v.armor) && int(v.delay_ms) && int(v.sell_price) &&
    list(v.stats, stat, 64) && list(v.enchants, (e) => object(e) && int(e.id) && text(e.name) && bool(e.gem), 16) &&
    list(v.sockets, (s) => object(s) && int(s.color) && int(s.gem_id), 3) &&
    list(v.spells, (s) => object(s) && int(s.id) && text(s.name) && int(s.trigger), 5) &&
    list(v.damage, (d) => object(d) && num(d.min, 0) && num(d.max, 0) && int(d.school, 0, 6), 5);
}
const slot = (v: unknown): boolean => object(v) && int(v.slot, 0, 255) && (v.item === null || item(v.item));
const slots = (v: unknown): boolean => list(v, slot, 256) && unique(v, "slot");
function quest(v: unknown): boolean {
  return object(v) && int(v.id, 1) && int(v.slot, 0, 24) && text(v.name) && int(v.level, -1, 255) &&
    text(v.group) && text(v.details, 65536) && text(v.objectives_text, 16384) &&
    ["incomplete", "complete", "failed"].includes(v.status as string) &&
    (v.remaining_ms === null || int(v.remaining_ms)) &&
    list(v.objectives, (o) => object(o) && text(o.text) && num(o.value) && num(o.max, 0), 32) &&
    list(v.rewards, (r) => object(r) && item(r.item) && bool(r.choice), 10) && num(v.money) && int(v.xp) &&
    list(v.reward_stats, stat, 16) && list(v.reward_text, (t) => text(t), 16);
}
export function isPanelData(panel: Panel, v: unknown): boolean {
  if (!object(v)) return false;
  switch (panel) {
    case "info": return text(v.race) && int(v.class_id, 1, 11) && int(v.level, 1, 255) &&
      text(v.title) && text(v.guild) && int(v.xp) && int(v.max_xp) && num(v.rested, 0) &&
      int(v.health) && int(v.max_health) && list(v.stats, stat, 256) && slots(v.equipment);
    case "reputation": return list(v.factions, (f) => object(f) && int(f.id, 1) && text(f.name) && text(f.group) &&
      int(f.standing, -42000, 42999) && int(f.rank, 0, 7) && num(f.value, 0) && num(f.max, 1) &&
      bool(f.watched) && bool(f.inactive) && bool(f.at_war), 1024) && unique(v.factions, "id");
    case "skills": return list(v.skills, (s) => object(s) && int(s.id, 1) && text(s.name) && text(s.category) &&
      int(s.value, 0, 65535) && int(s.max, 0, 65535) && int(s.permanent_bonus, -32768, 32767) &&
      int(s.temporary_bonus, -32768, 32767) && icon(s.icon), 127) && unique(v.skills, "id");
    case "talents": return int(v.class_id, 1, 11) && int(v.active_spec, 0, 1) && int(v.spec_count, 1, 2) &&
      v.active_spec < v.spec_count && int(v.free_points) && list(v.specs, (s) => object(s) &&
        int(s.index, 0, (v.spec_count as number) - 1) && Array.isArray(s.points) && s.points.length === 3 &&
        s.points.every((p) => int(p)) && list(s.ranks, (r) => object(r) && int(r.id, 1) && int(r.rank, 1, 5), 512) &&
        unique(s.ranks, "id"), 2) && (v.specs as unknown[]).length === v.spec_count && unique(v.specs, "index") &&
      list(v.glyphs, (g) => object(g) && int(g.slot, 0, 5) && int(g.id) && int(g.spell_id) && text(g.name) &&
        bool(g.major) && bool(g.enabled) && icon(g.icon), 6) && unique(v.glyphs, "slot");
    case "achievements": return int(v.points) && int(v.faction, 0, 1) &&
      list(v.earned, (e) => object(e) && int(e.id, 1) && int(e.date)) &&
      unique(v.earned, "id") && list(v.progress, (p) => object(p) && int(p.id, 1) && int(p.counter) && int(p.date),
        30000) && unique(v.progress, "id");
    case "quests": return list(v.quests, quest, 25) && unique(v.quests, "id") && unique(v.quests, "slot");
    case "inventory": return int(v.money) && int(v.honor) && int(v.arena) &&
      list(v.containers, (c) => object(c) && identity(c.id) && text(c.name) &&
        ["carried", "bank", "keyring", "currency"].includes(c.kind as string) &&
        int(c.capacity, 0, 256) && bool(c.available) && slots(c.slots) &&
        (c.slots as unknown[]).length === c.capacity, 16) && unique(v.containers, "id");
  }
}
function update(v: unknown): boolean {
  if (!object(v) || !identity(v.guid) || !identity(v.name) || !sequence(v.sequence) ||
    !int(v.age_ms, 0, 86400000) || !revision(v.catalog_revision)) return false;
  if (v.panel === "presence") {
    if (!object(v.data) || !["online", "offline", "unavailable"].includes(v.data.presence as string)) return false;
    const revisions = v.data.revisions;
    return v.data.presence !== "online" || (object(revisions) && PANELS.every((p) => sequence(revisions[p])));
  }
  return PANELS.includes(v.panel as Panel) && isPanelData(v.panel as Panel, v.data) &&
    new TextEncoder().encode(JSON.stringify(v)).length <= MAX_PANEL_BYTES;
}
export function isBatch(v: unknown): v is Batch {
  return object(v) && v.schema_version === 1 && identity(v.source_id) && revision(v.process_id) &&
    list(v.updates, update, 100);
}
function catalogEntry(v: unknown): boolean {
  if (!object(v) || !object(v.data) || !int(v.data.id, 1)) return false;
  const d = v.data;
  switch (v.kind) {
    case "achievements": return text(d.name) && text(d.description, 16384) && int(d.category) &&
      int(d.points) && int(d.flags) && int(d.faction, -1, 1) && icon(d.icon) && int(d.ref) && int(d.count);
    case "criteria": return int(d.achievement, 1) && text(d.name, 4096) && int(d.type) && int(d.asset) &&
      (d.target === null || num(d.target, 0)) && int(d.order);
    case "categories": return int(d.parent, -1) && text(d.name) && int(d.order);
    case "trees": return text(d.name) && int(d.class_mask) && int(d.page, 0, 2) && icon(d.icon);
    case "talents": return int(d.tree, 1) && int(d.row, 0, 10) && int(d.col, 0, 3) &&
      int(d.depends_on) && int(d.depends_rank, 0, 5) && list(d.ranks, (r) => object(r) &&
        int(r.id, 1) && text(r.name) && icon(r.icon), 5) && (d.ranks as unknown[]).length > 0;
    default: return false;
  }
}
export function isCatalogChunk(v: unknown): v is CatalogChunk {
  return object(v) && v.schema_version === 1 && identity(v.source_id) && revision(v.process_id) &&
    revision(v.revision) && int(v.chunk_count, 1, 64) && int(v.chunk_index, 0, v.chunk_count - 1) &&
    list(v.entries, catalogEntry, 5000);
}
