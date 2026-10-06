// SPDX-License-Identifier: GPL-2.0-or-later
import type { Batch, CatalogChunk, CatalogEntry, Item, PanelData } from "../src/schema.ts";
import { PANELS } from "../src/schema.ts";

export const sampleItem = (id = 1, name = "Valorous Frostfire Robe", quality = 4): Item => ({
  id, name, quality, icon: "inv_chest_cloth_25", count: 1, level: 213, required_level: 80, inventory_type: 5,
  durability: 85, max_durability: 100, bound: true, description: "The threads shimmer with a quiet arcane light.",
  armor: 280, delay_ms: 0, sell_price: 52340, stats: [
    { label: "Intellect", value: 72, group: "Item" }, { label: "Stamina", value: 54, group: "Item" },
    { label: "Spell power", value: 96, group: "Item" },
  ], enchants: [{ id: 1, name: "+10 All Stats", gem: false }, { id: 2, name: "+19 Spell Power", gem: true }],
  sockets: [{ color: 2, gem_id: 39998 }], spells: [], damage: [],
});
export function catalogChunk(process = "demo-process"): CatalogChunk {
  const entries: CatalogEntry[] = [];
  const names = ["The Explorer", "Loremaster of Northrend", "Epic", "Northrend Gourmet", "A Silver Confidant",
    "Higher Learning", "Master of Wintergrasp", "The Keymaster", "World Explorer", "Well Read",
    "The Dalaran Heist", "Into the Frozen Heart", "Friend of the Kirin Tor", "The Long Road Home"];
  for (let i = 1; i <= 65; ++i) {
    entries.push({ kind: "achievements", data: { id: i, name: names[(i - 1) % names.length]! +
      (i > names.length ? ` ${Math.ceil(i / names.length)}` : ""),
    description: "Discover the stories and forgotten places of Northrend.", category: i % 2 + 1,
    points: 10, flags: 0, faction: -1, icon: "achievement_zone_northrend_01", ref: 0, count: 0 } });
    for (let j = 0; j < 3; ++j) entries.push({ kind: "criteria", data: { id: i * 10 + j,
      achievement: i, name: ["Explore the Dragonblight", "Explore the Storm Peaks", "Explore Icecrown"][j]!,
      type: 0, asset: 1, target: 10, order: j } });
  }
  entries.push({ kind: "categories", data: { id: 1, parent: -1, name: "Exploration", order: 0 } },
    { kind: "categories", data: { id: 2, parent: -1, name: "Quests", order: 1 } });
  for (let tree = 0; tree < 3; ++tree) {
    entries.push({ kind: "trees", data: { id: tree + 1, name: ["Arcane", "Fire", "Frost"][tree]!,
      class_mask: 128, page: tree, icon: "spell_frost_frostbolt02" } });
    for (let row = 0; row < 11; ++row) for (let col = 0; col < 4; ++col) {
      if ((row + col) % 3 === 0) continue;
      const id = tree * 100 + row * 4 + col + 1;
      entries.push({ kind: "talents", data: { id, tree: tree + 1, row, col,
        depends_on: row > 0 && (row + col - 1) % 3 !== 0 ? id - 4 : 0, depends_rank: 3,
        ranks: Array.from({ length: 3 }, (_, rank) => ({ id: 1000 + id * 3 + rank,
          name: ["Arcane Focus", "Burning Determination", "Frost Warding"][tree]!,
          icon: ["spell_holy_magicalsentry", "spell_fire_flamebolt", "spell_frost_frostbolt02"][tree]! })) } });
    }
  }
  return { schema_version: 1, source_id: "realm-1", process_id: process, revision: process,
    chunk_index: 0, chunk_count: 1, entries };
}
export function panelData(tick = 0): PanelData {
  return {
    info: { race: "Human", class_id: 8, level: 80, title: "Alice the Explorer", guild: "The Winterguard",
      xp: 0, max_xp: 0, rested: 0, health: 18950, max_health: 21300,
      stats: ["Strength", "Agility", "Stamina", "Intellect", "Spirit"].map((label, i) =>
        ({ label, value: [43, 51, 982, 1210, 645][i]!, group: "Attributes" })).concat([
        { label: "Spell power", value: 2450, group: "Spell" }, { label: "Crit %", value: 29.7, group: "Spell" },
        { label: "Armor", value: 2100, group: "Defense" }, { label: "Dodge %", value: 4.1, group: "Defense" },
      ]), equipment: Array.from({ length: 19 }, (_, slot) => ({ slot,
        item: [3, 17].includes(slot) ? null : { ...sampleItem(slot + 1, ["Crown of the Kirin Tor", "Sapphire Amulet",
          "Mantle of Winter", "Fine Shirt", "Valorous Frostfire Robe"][slot] ?? "Runed Frostweave Equipment"),
        icon: slot === 0 ? "inv_helmet_15" : slot === 15 ? "inv_staff_13" : "inv_chest_cloth_25" } })) },
    reputation: { factions: [
      { id: 1, name: "Kirin Tor", group: "Wrath of the Lich King", standing: 42000, rank: 7, value: 999, max: 1000,
        watched: true, inactive: false, at_war: false },
      { id: 2, name: "The Wyrmrest Accord", group: "Wrath of the Lich King", standing: 24000, rank: 6,
        value: 3000 + tick % 200, max: 21000, watched: false, inactive: false, at_war: false },
      { id: 3, name: "Argent Crusade", group: "Wrath of the Lich King", standing: 14000, rank: 5,
        value: 5000, max: 12000, watched: false, inactive: false, at_war: false },
      { id: 4, name: "The Kalu'ak", group: "Wrath of the Lich King", standing: 8700, rank: 4,
        value: 5700, max: 6000, watched: false, inactive: false, at_war: false },
      { id: 5, name: "Stormwind", group: "Alliance", standing: 42000, rank: 7, value: 999, max: 1000,
        watched: false, inactive: false, at_war: false },
      { id: 6, name: "Booty Bay", group: "Steamwheedle Cartel", standing: -8000, rank: 0, value: 34000, max: 36000,
        watched: false, inactive: true, at_war: true },
    ] },
    skills: { skills: ["Tailoring", "Enchanting", "Cooking", "First Aid", "Fishing", "Staves", "Defense", "Common"]
      .map((name, i) => ({ id: i + 1, name, category: i < 2 ? "Professions" : i < 5 ? "Secondary skills" :
        i === 7 ? "Languages" : "Weapon skills", value: [450, 432, 425, 450, 310, 399, 400, 300][i]!,
      max: i < 5 ? 450 : i === 7 ? 300 : 400, permanent_bonus: 0, temporary_bonus: i === 1 ? 10 : 0,
      icon: i === 0 ? "trade_tailoring" : i === 1 ? "trade_engraving" : "trade_fishing" })) },
    talents: { class_id: 8, active_spec: 0, spec_count: 2, free_points: 0,
      specs: [{ index: 0, points: [57, 3, 11], ranks: [{ id: 2, rank: 3 }, { id: 3, rank: 3 },
        { id: 5, rank: 3 }, { id: 6, rank: 3 }, { id: 9, rank: 3 }, { id: 102, rank: 3 }, { id: 202, rank: 3 }] },
      { index: 1, points: [18, 0, 53], ranks: [{ id: 2, rank: 3 }, { id: 202, rank: 3 }, { id: 203, rank: 3 }] }],
      glyphs: Array.from({ length: 6 }, (_, slot) => ({ slot, id: slot + 1, spell_id: 42842,
        name: ["Glyph of Arcane Blast", "Glyph of Molten Armor", "Glyph of Arcane Missiles",
          "Glyph of Slow Fall", "Glyph of Arcane Intellect", "Glyph of the Penguin"][slot]!,
        major: slot < 3, enabled: true, icon: "inv_glyph_major_mage" })) },
    achievements: { points: 1280, faction: 1, earned: [{ id: 1, date: 1791200000 }, { id: 3, date: 1791200100 }],
      progress: [{ id: 20, counter: 7, date: 1791200200 }, { id: 21, counter: 10, date: 1791200200 }] },
    quests: { quests: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, slot: i,
      name: ["The Last Line Of Defense", "A Hero's Welcome", "The Battle For The Undercity",
        "A Letter For Home", "The Frozen Heart"][i % 5]!, level: 80, group: i < 4 ? "Icecrown" : "Dragonblight",
      details: "Beyond the walls, the frozen wastes stir with restless shadows. " +
        "The Argent Crusade needs your help.\n\n" +
        "Gather supplies from the fallen encampment and return before the next assault begins.",
      objectives_text: "Recover the supplies and defend the encampment.", status: i === 2 ? "complete" : "incomplete",
      remaining_ms: i === 0 ? Math.max(0, 600000 - tick * 2000) : null,
      objectives: [{ text: "Scourge forces defeated", value: Math.min(10, 6 + tick % 5), max: 10 },
        { text: "Crusader supplies recovered", value: 3, max: 5 }],
      rewards: [{ item: sampleItem(100, "Signet of the Crusade", 3), choice: true }], money: 132300, xp: 22050,
      reward_stats: [{ group: "Reputation", label: "Argent Crusade", value: 250 }], reward_text: [] })) },
    inventory: { money: 24832571, honor: 42500, arena: 1534,
      containers: [{ id: "backpack", name: "Backpack", kind: "carried", capacity: 16, available: true,
        slots: Array.from({ length: 16 }, (_, slot) => ({ slot: slot + 23, item: slot % 4 === 0 ? null :
          { ...sampleItem(slot + 100, slot % 2 ? "Frostweave Cloth" : "Runic Mana Potion", 1),
            icon: slot % 2 ? "inv_fabric_frostweave" : "inv_alchemy_elixir_02", count: 1 + (slot * 3) % 20 } })) },
      ...Array.from({ length: 4 }, (_, i) => ({ id: `bag-${19 + i}`, name: "Frostweave Bag", kind: "carried" as const,
        capacity: 20, available: true, slots: Array.from({ length: 20 }, (_, slot) => ({ slot,
          item: slot % 3 ? { ...sampleItem(200 + slot, "Infinite Dust", 2),
            icon: "inv_enchant_dustinfinite", count: 20 } : null })) })),
      { id: "bank", name: "Bank", kind: "bank", capacity: 28, available: true,
        slots: Array.from({ length: 28 }, (_, slot) => ({ slot: slot + 39,
          item: slot % 2 ? sampleItem(300 + slot, "Treasured Keepsake", 3) : null })) },
      ...Array.from({ length: 7 }, (_, i) => ({ id: `bag-${67 + i}`, name: `Bank bag ${i + 1}`, kind: "bank" as const,
        capacity: i < 2 ? 20 : 0, available: i < 4, slots: Array.from({ length: i < 2 ? 20 : 0 }, (_, slot) => ({ slot,
          item: sampleItem(400 + slot, "Stored Expedition Gear", 3) })) })),
      { id: "keyring", name: "Keyring", kind: "keyring", capacity: 32, available: true,
        slots: Array.from({ length: 32 }, (_, slot) => ({ slot: slot + 86, item: slot > 2 ? null :
          { ...sampleItem(500 + slot, "Dungeon Key", 2), icon: "inv_misc_key_14" } })) },
      { id: "currency", name: "Currency", kind: "currency", capacity: 32, available: true,
        slots: Array.from({ length: 32 }, (_, slot) => ({ slot: slot + 118, item: slot ? null :
          { ...sampleItem(600, "Emblem of Heroism", 4), icon: "spell_holy_summonchampion", count: 75 } })) }],
    },
  };
}
export function batch(sequence = 1, name = "Alice", tick = 0, process = "demo-process"): Batch {
  const data = panelData(tick);
  return { schema_version: 1, source_id: "realm-1", process_id: process,
    updates: [...PANELS.map((panel, i) => ({ guid: name, name, panel, sequence: String(sequence + i), age_ms: 0,
      catalog_revision: process, data: data[panel] })), { guid: name, name, panel: "presence",
      sequence: String(sequence + 7), age_ms: 0, catalog_revision: process, data: { presence: "online",
        revisions: Object.fromEntries(PANELS.map((p, i) => [p, String(sequence + i)])) } }] };
}
