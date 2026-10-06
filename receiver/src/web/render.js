// SPDX-License-Identifier: GPL-2.0-or-later
/** @typedef {import('../schema.ts').View} View */
/** @typedef {import('../schema.ts').Catalog} Catalog */
/** @typedef {import('../schema.ts').Panel} Panel */
/** @typedef {import('../schema.ts').Item} Item */
/** @typedef {import('../schema.ts').Quest} Quest */
/** @typedef {import('../schema.ts').AchievementDefinition} Achievement */
/** @typedef {{title: string, subtitle?: string, lines: string[], item?: Item, quest?: Quest,
 * achievement?: Achievement}} Detail */
export const labels = { info: "Character", reputation: "Reputation", skills: "Skills", talents: "Talents",
  achievements: "Achievements", quests: "Quest Log", inventory: "Inventory" };
export const symbols = { info: "♜", reputation: "⚑", skills: "⚒", talents: "✦", achievements: "✧",
  quests: "☷", inventory: "▦" };
const classes = ["", "Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Death Knight", "Shaman", "Mage",
  "Warlock", "", "Druid"];
const equipmentNames = ["Head", "Neck", "Shoulders", "Shirt", "Chest", "Waist", "Legs", "Feet", "Wrists",
  "Hands", "Finger", "Finger", "Trinket", "Trinket", "Back", "Main hand", "Off hand", "Ranged", "Tabard"];
const reputationRanks = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"];
/** @param {unknown} value */
export function plain(value) {
  return String(value ?? "").replace(/\|c[0-9a-f]{8}|\|r/gi, "").replace(/\|T[^|]*\|t/g, "")
    .replace(/\|H[^|]*\|h([^|]*)\|h/g, "$1");
}
/** @param {number} value */
const number = (value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
/** @param {number} copper */
export const money = (copper) => `${number(Math.floor(Math.abs(copper) / 10000))}g ` +
  `${Math.floor(Math.abs(copper) / 100) % 100}s ${Math.abs(copper) % 100}c`;
/** @param {string} tag @param {string} [className] @param {unknown} [text] */
export function el(tag, className = "", text = "") {
  const node = document.createElement(tag); node.className = className; node.textContent = plain(text); return node;
}
/** @param {string} name @param {string} [fallback] */
function icon(name, fallback = "✧") {
  const box = el("span", "icon", fallback);
  if (name) {
    const image = document.createElement("img"); image.src = `/icons/name/${encodeURIComponent(name)}`;
    image.alt = ""; image.loading = "lazy"; image.onerror = () => image.remove(); box.append(image);
  }
  return box;
}
/** @param {number} value @param {number} max @param {string} [text] @param {string} [kind] */
function bar(value, max, text = "", kind = "") {
  const outer = el("div", `bar ${kind}`); const fill = el("span", "bar-fill");
  fill.style.width = `${Math.max(0, Math.min(100, max > 0 ? value / max * 100 : 0))}%`;
  outer.append(fill, el("span", "bar-label", text || `${number(value)} / ${number(max)}`)); return outer;
}
/** @param {string} label @param {string} value @param {(value: string) => void} change
 * @param {{value: string, label: string}[]} options */
function select(label, value, change, options) {
  const input = document.createElement("select"); input.id = `filter-${label}`; input.setAttribute("aria-label", label);
  for (const o of options) { const option = document.createElement("option"); option.value = o.value;
    option.textContent = o.label; input.append(option); }
  input.value = value; input.onchange = () => change(input.value); return input;
}
export class PanelRenderer {
  /** @param {Panel} panel @param {HTMLElement} host */
  constructor(panel, host) {
    this.panel = panel; this.host = host;
    /** @type {View | null} */ this.view = null;
    /** @type {Catalog} */ this.catalog = { achievements: [], criteria: [], categories: [], trees: [], talents: [] };
    /** @type {Map<string, Detail>} */ this.records = new Map();
    this.pinned = ""; this.hovered = ""; this.query = ""; this.filter = "all"; this.group = "all";
    this.page = 0; this.spec = -1; this.statGroup = "Attributes"; this.received = performance.now();
    this.live = false; this.timerAge = 0; this.needsRender = true;
    this.detail = el("aside", "detail scroll"); this.detail.dataset.scroll = "detail";
  }
  /** @param {View} view @param {Catalog} catalog @param {boolean} [changed] */
  update(view, catalog, changed = true) {
    const live = !view.stale && view.presence === "online" && Boolean(view.panels[this.panel]) &&
      !view.panels[this.panel]?.stale;
    if (changed) {
      this.timerAge = view.panels.quests?.age_ms ?? 0;
      this.received = performance.now();
    } else if (this.live !== live) {
      if (this.live) this.timerAge += performance.now() - this.received;
      this.received = performance.now();
    }
    this.live = live;
    this.view = view; this.catalog = catalog;
    this.host.classList.toggle("dimmed", !live);
    if (changed) this.needsRender = true;
    // Hidden elements report zero scroll offsets. Defer replacement until their tab is visible again.
    if (this.needsRender && !this.host.hidden) this.render();
  }
  render() {
    this.needsRender = false;
    const scroll = new Map([...this.host.querySelectorAll("[data-scroll]")]
      .map((n) => [/** @type {HTMLElement} */ (n).dataset.scroll, n.scrollTop]));
    const active = document.activeElement;
    const focus = active instanceof HTMLInputElement && this.host.contains(active) ?
      { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    this.records.clear();
    const value = this.view?.panels[this.panel]?.data;
    if (!value) { this.host.replaceChildren(el("div", "empty", "Waiting for this panel…")); return; }
    this.detail = el("aside", "detail scroll"); this.detail.dataset.scroll = "detail";
    let content;
    switch (this.panel) {
      case "info": content = this.info(/** @type {import('../schema.ts').Info} */ (value)); break;
      case "reputation": content = this.reputation(/** @type {import('../schema.ts').Reputation} */ (value)); break;
      case "skills": content = this.skills(/** @type {import('../schema.ts').Skills} */ (value)); break;
      case "talents": content = this.talents(/** @type {import('../schema.ts').Talents} */ (value)); break;
      case "achievements": content = this.achievements(/** @type {import('../schema.ts').Achievements} */ (value));
      break;
      case "quests": content = this.quests(/** @type {import('../schema.ts').Quests} */ (value)); break;
      case "inventory": content = this.inventory(/** @type {import('../schema.ts').Inventory} */ (value)); break;
    }
    this.host.replaceChildren(content);
    if (this.pinned && !this.records.has(this.pinned)) this.pinned = "";
    this.showDetail();
    for (const node of this.host.querySelectorAll("[data-scroll]")) {
      node.scrollTop = scroll.get(/** @type {HTMLElement} */ (node).dataset.scroll) ?? 0;
    }
    if (focus) { const input = document.getElementById(focus.id);
      if (input instanceof HTMLInputElement) { input.focus(); input.setSelectionRange(focus.start, focus.end); } }
    this.tick();
  }
  /** @param {HTMLElement} body @param {boolean} [details] */
  layout(body, details = true) {
    const wrap = el("div", details ? "split" : "full"); wrap.append(body);
    if (details) wrap.append(this.detail); return wrap;
  }
  /** @param {HTMLElement} node @param {string} key @param {Detail} detail */
  bind(node, key, detail) {
    this.records.set(key, detail); node.classList.toggle("selected", this.pinned === key);
    const inspect = () => { this.hovered = key; if (!this.pinned) this.showDetail(); };
    node.onmouseenter = inspect;
    node.onfocus = inspect;
    node.onclick = () => { this.pinned = this.pinned === key ? "" : key; this.hovered = key; this.render(); };
  }
  showDetail() {
    const detail = this.records.get(this.pinned || this.hovered);
    this.detail.replaceChildren(el("div", "eyebrow", this.pinned ? "PINNED DETAILS" : "INSPECT"));
    if (!detail) { this.detail.append(el("div", "detail-placeholder", "✧"), el("h2", "", "A closer look"),
      el("p", "muted", "Hover to inspect. Click to pin details while the character updates.")); return; }
    if (detail.item) this.detail.append(icon(detail.item.icon));
    this.detail.append(el("h2", detail.item ? `quality-${detail.item.quality}` : "", detail.title));
    if (detail.subtitle) this.detail.append(el("p", "gold", detail.subtitle));
    if (detail.item) {
      const i = detail.item;
      this.detail.append(el("p", "muted", `Item level ${i.level} · Requires level ${i.required_level}`));
      if (i.bound) this.detail.append(el("p", "", "Soulbound"));
      if (i.armor) this.detail.append(el("p", "", `${number(i.armor)} Armor`));
      for (const d of i.damage) this.detail.append(el("p", "", `${number(d.min)} – ${number(d.max)} damage`));
      if (i.delay_ms) this.detail.append(el("p", "", `Speed ${number(i.delay_ms / 1000)}`));
      for (const s of i.stats) {
        this.detail.append(el("p", "positive", `${s.value >= 0 ? "+" : ""}${number(s.value)} ${s.label}`));
      }
      for (const e of i.enchants) this.detail.append(el("p", "positive", `${e.gem ? "◈" : "✦"} ${e.name}`));
      for (const s of i.sockets) if (!s.gem_id) this.detail.append(el("p", "muted", `◇ Empty socket (${s.color})`));
      for (const s of i.spells) {
        this.detail.append(el("p", "positive", `${s.trigger === 0 ? "Use" : "Equip"}: ${s.name}`));
      }
      if (i.max_durability) this.detail.append(bar(i.durability, i.max_durability,
        `Durability ${i.durability} / ${i.max_durability}`));
      if (i.description) this.detail.append(el("p", "flavor", i.description));
      this.detail.append(el("p", "gold", `Sell price: ${money(i.sell_price)}`));
    }
    for (const line of detail.lines) this.detail.append(el("p", "detail-line", line));
    if (detail.quest) {
      const q = detail.quest;
      this.detail.append(el("h3", "", "Objectives"), el("p", "", q.objectives_text));
      for (const o of q.objectives) {
        this.detail.append(el("p", o.value >= o.max ? "positive" : "", o.text), bar(o.value, o.max));
      }
      if (q.remaining_ms !== null) { const timer = el("p", "quest-timer gold");
        timer.dataset.remaining = String(q.remaining_ms); this.detail.append(timer); }
      this.detail.append(el("h3", "", "Rewards"));
      if (q.money) this.detail.append(el("p", "gold", `${q.money < 0 ? "Requires" : "Reward"}: ${money(q.money)}`));
      if (q.xp) this.detail.append(el("p", "", `${number(q.xp)} experience`));
      for (const reward of q.reward_stats) this.detail.append(el("p", "positive",
        `${reward.value >= 0 ? "+" : ""}${number(reward.value)} ${reward.label}`));
      for (const reward of q.reward_text) this.detail.append(el("p", "", reward));
      for (const reward of q.rewards) {
        const row = el("div", `reward quality-${reward.item.quality}`);
        row.append(icon(reward.item.icon), el("span", "", `${reward.choice ? "Choose: " : ""}${reward.item.name}`),
          el("small", "", `×${reward.item.count}`)); this.detail.append(row);
      }
    }
    if (detail.achievement) this.achievementDetails(detail.achievement);
    if (this.pinned) { const unpin = el("button", "unpin", "Unpin details");
      unpin.onclick = () => { this.pinned = ""; this.render(); }; this.detail.append(unpin); }
    this.tick();
  }
  /** @param {Item | null} item @param {string} key @param {string} [label] */
  itemSlot(item, key, label = "Empty") {
    const button = el("button", `item-slot ${item ? `quality-${item.quality}` : "empty-slot"}`);
    button.setAttribute("aria-label", item ? `${label}: ${item.name}` : `${label}: empty`);
    button.title = item ? item.name : label;
    button.append(icon(item?.icon ?? "", item ? "✧" : ""));
    if (item) {
      if (item.count > 1) button.append(el("span", "stack", item.count));
      if (item.max_durability && !item.durability) button.classList.add("broken");
      this.bind(button, key, { title: item.name, subtitle: label, item, lines: [] });
    } else button.setAttribute("disabled", "");
    return button;
  }
  /** @param {import('../schema.ts').Info} data */
  info(data) {
    const body = el("div", "character-body scroll"); body.dataset.scroll = "main";
    const banner = el("div", "character-banner");
    banner.append(el("h2", "", data.title || this.view?.name),
      el("p", "gold", `Level ${data.level} ${data.race} ${classes[data.class_id] || ""}`));
    if (data.guild) banner.append(el("p", "guild", `‹ ${data.guild} ›`)); body.append(banner);
    const doll = el("div", "paperdoll"); const left = el("div", "equipment-column");
    const right = el("div", "equipment-column"); const weapons = el("div", "weapons");
    const slots = new Map(data.equipment.map((s) => [s.slot, s.item]));
    for (const [node, positions] of /** @type {[HTMLElement, number[]][]} */ ([
      [left, [0, 1, 2, 14, 4, 3, 18, 8]], [right, [9, 5, 6, 7, 10, 11, 12, 13]], [weapons, [15, 16, 17]],
    ])) for (const slot of positions) node.append(this.itemSlot(slots.get(slot) ?? null, `equipment-${slot}`,
      equipmentNames[slot]));
    const portrait = el("div", "portrait");
    const image = document.createElement("img"); image.src = `/icons/class/${data.class_id}`;
    image.alt = classes[data.class_id] ?? "Class";
    image.onerror = () => { image.onerror = null; image.src = `/badges/class/${data.class_id}`; };
    portrait.append(el("div", "portrait-ring"), image, el("span", "portrait-level", data.level),
      el("span", "portrait-class", classes[data.class_id]));
      doll.append(left, portrait, right, weapons);
      body.append(doll);
    body.append(bar(data.health, data.max_health,
      `${number(data.health)} / ${number(data.max_health)} Health`, "health"));
    if (data.max_xp) body.append(bar(data.xp, data.max_xp,
      `${number(data.xp)} / ${number(data.max_xp)} XP · ${number(data.rested)} rested`, "xp"));
    const groups = [...new Set(data.stats.map((s) => s.group))];
    portrait.append(select("stats", this.statGroup, (value) => { this.statGroup = value; this.render(); },
      groups.map((g) => ({ value: g, label: g }))));
    const stats = el("div", "stats"); stats.dataset.scroll = "stats";
    for (const stat of data.stats.filter((s) => s.group === this.statGroup)) {
      const row = el("div", "stat"); row.append(el("span", "", stat.label), el("strong", "", number(stat.value)));
      stats.append(row);
    }
    portrait.append(stats); return this.layout(body);
  }
  /** @param {string} placeholder */
  search(placeholder) {
    const input = document.createElement("input"); input.type = "search"; input.id = `${this.panel}-search`;
    input.placeholder = placeholder; input.setAttribute("aria-label", placeholder); input.value = this.query;
    input.oninput = () => { this.query = input.value; this.page = 0; this.render(); }; return input;
  }
  /** @param {string} name */
  matches(name) { return name.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()); }
  /** @param {import('../schema.ts').Reputation} data */
  reputation(data) {
    const body = el("div", "list-body"); const toolbar = el("div", "toolbar");
    toolbar.append(this.search("Find a faction…"), select("reputation", this.filter,
      (v) => { this.filter = v; this.render(); }, [{ value: "all", label: "All factions" },
        { value: "active", label: "Active factions" }, { value: "inactive", label: "Inactive factions" }]));
    body.append(toolbar); const list = el("div", "scroll list"); list.dataset.scroll = "main";
    const groups = [...new Set(data.factions.map((f) => f.group))].sort();
    for (const group of groups) {
      const rows = data.factions.filter((f) => f.group === group && this.matches(f.name) &&
        (this.filter === "all" || f.inactive === (this.filter === "inactive")))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!rows.length) continue; list.append(el("h3", "group-heading", group));
      for (const f of rows) {
        const row = el("button", "reputation-row");
        row.append(el("span", "row-name", `${f.watched ? "★ " : ""}${f.name}`),
          el("small", "muted", `${f.inactive ? "Inactive · " : ""}${f.at_war ? "At war" : ""}`),
          bar(f.value, f.max, `${reputationRanks[f.rank]} · ${number(f.value)} / ${number(f.max)}`, `rep-${f.rank}`));
        this.bind(row, `faction-${f.id}`, { title: f.name, subtitle: reputationRanks[f.rank], lines: [
          `${number(f.standing)} total reputation`, f.watched ? "Watched faction" : "", f.at_war ? "At war" : "",
        ].filter(Boolean) }); list.append(row);
      }
    }
    if (!list.childElementCount) list.append(el("p", "empty", "No matching factions"));
    body.append(list); return this.layout(body);
  }
  /** @param {import('../schema.ts').Skills} data */
  skills(data) {
    const body = el("div", "list-body"); const toolbar = el("div", "toolbar");
    toolbar.append(this.search("Find a skill…")); body.append(toolbar);
    const list = el("div", "scroll list"); list.dataset.scroll = "main";
    for (const category of [...new Set(data.skills.map((s) => s.category))].sort()) {
      const rows = data.skills.filter((s) => s.category === category && this.matches(s.name));
      if (!rows.length) continue; list.append(el("h3", "group-heading", category));
      for (const s of rows) {
        const row = el("button", "skill-row"); const content = el("div", "grow");
        content.append(el("span", "row-name", s.name), bar(s.value, s.max));
        row.append(icon(s.icon, "⚒"), content);
        const bonus = s.permanent_bonus + s.temporary_bonus;
        if (bonus) row.append(el("span", "positive", `${bonus > 0 ? "+" : ""}${bonus}`));
        this.bind(row, `skill-${s.id}`, { title: s.name, subtitle: category, lines: [
          `${s.value} / ${s.max}`, `Permanent bonus: ${s.permanent_bonus}`, `Temporary bonus: ${s.temporary_bonus}`,
        ] }); list.append(row);
      }
    }
    if (!list.childElementCount) list.append(el("p", "empty", "No matching skills"));
    body.append(list); return this.layout(body);
  }
  /** @param {import('../schema.ts').Talents} data */
  talents(data) {
    const body = el("div", "talents-body"); const toolbar = el("div", "toolbar");
    const spec = data.specs.find((s) => s.index === (this.spec < 0 ? data.active_spec : this.spec)) ?? data.specs[0];
    toolbar.append(select("specialization", String(spec?.index ?? 0), (v) => { this.spec = Number(v); this.render(); },
      data.specs.map((s) => ({ value: String(s.index),
        label: `Specialization ${s.index + 1}${s.index === data.active_spec ? " · Active" : ""}` }))),
      el("span", "gold", `${data.free_points} unspent points · active spec`)); body.append(toolbar);
    const scroll = el("div", "scroll"); scroll.dataset.scroll = "main";
    const trees = el("div", "talent-trees");
    const ranks = new Map(spec?.ranks.map((r) => [r.id, r.rank]) ?? []);
    for (const tree of this.catalog.trees.filter((t) => t.class_mask & (1 << (data.class_id - 1)))
      .sort((a, b) => a.page - b.page)) {
      const column = el("section", "talent-tree"); column.append(el("h3", "", tree.name),
        el("p", "tree-points", `${spec?.points[tree.page] ?? 0} points`));
      const grid = el("div", "talent-grid");
      const definitions = this.catalog.talents.filter((t) => t.tree === tree.id);
      const arrows = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrows.setAttribute("viewBox", "0 0 400 1100"); arrows.setAttribute("preserveAspectRatio", "none");
      arrows.classList.add("talent-arrows");
      for (const talent of definitions) {
        const dependency = definitions.find((t) => t.id === talent.depends_on);
        if (dependency) {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
          line.setAttribute("d", `M${dependency.col * 100 + 50} ${dependency.row * 100 + 60} ` +
            `V${talent.row * 100 + 50} H${talent.col * 100 + 50}`); arrows.append(line);
        }
        const rank = ranks.get(talent.id) ?? 0; const spell = talent.ranks[Math.max(0, rank - 1)] ?? talent.ranks[0];
        const button = el("button", `talent ${rank ? "learned" : "unlearned"}`);
        button.style.gridRow = String(talent.row + 1); button.style.gridColumn = String(talent.col + 1);
        button.setAttribute("aria-label", `${spell?.name} ${rank}/${talent.ranks.length}`);
        button.append(icon(spell?.icon ?? ""), el("span", "talent-rank", `${rank}/${talent.ranks.length}`));
        this.bind(button, `talent-${talent.id}`, { title: spell?.name ?? "Talent", subtitle: tree.name,
          lines: [`Rank ${rank} of ${talent.ranks.length}`, `Tier ${talent.row + 1}`,
            dependency ? `Requires ${talent.depends_rank} point(s) in ${dependency.ranks[0]?.name}` : ""]
            .filter(Boolean) });
        grid.append(button);
      }
      grid.prepend(arrows); column.append(grid); trees.append(column);
    }
    if (!trees.childElementCount) trees.append(el("p", "empty", "Waiting for talent catalogue…"));
    scroll.append(trees, el("h3", "group-heading", "Glyphs · Active specialization"));
    const glyphs = el("div", "glyphs");
    for (const glyph of data.glyphs) {
      const button = el("button", `glyph ${glyph.enabled ? "" : "locked"}`);
      button.append(icon(glyph.icon), el("span", "", glyph.name),
        el("small", "muted", glyph.enabled ? glyph.major ? "Major" : "Minor" : "Locked"));
      this.bind(button, `glyph-${glyph.slot}`, { title: glyph.name,
        subtitle: glyph.major ? "Major glyph" : "Minor glyph",
        lines: [glyph.enabled ? "Active specialization" : "Slot not unlocked"] }); glyphs.append(button);
    }
    scroll.append(glyphs); body.append(scroll); return this.layout(body);
  }
  /** @param {import('../schema.ts').Achievements} data */
  achievements(data) {
    const body = el("div", "list-body"); const toolbar = el("div", "toolbar wrap");
    const earned = new Map(data.earned.map((a) => [a.id, a.date]));
    toolbar.append(this.search("Search achievements…"), select("earned", this.filter,
      (v) => { this.filter = v; this.page = 0; this.render(); }, [
        { value: "all", label: "All achievements" }, { value: "earned", label: "Earned" },
        { value: "unearned", label: "Unearned" }, { value: "statistics", label: "Statistics" },
      ]), select("category", this.group, (v) => { this.group = v; this.page = 0; this.render(); },
      [{ value: "all", label: "All categories" }, ...this.catalog.categories.slice().sort((a, b) =>
        a.order - b.order || a.name.localeCompare(b.name)).map((c) => ({ value: String(c.id), label: c.name }))]));
    body.append(toolbar, el("div", "achievement-summary", `${number(data.points)} achievement points`));
    const list = el("div", "scroll list"); list.dataset.scroll = "main";
    const definitions = this.catalog.achievements.filter((a) => this.matches(a.name) &&
      (this.group === "all" || a.category === Number(this.group)) &&
      (this.filter === "statistics" ? Boolean(a.flags & 1) : !(a.flags & 1)) &&
      (this.filter !== "earned" || earned.has(a.id)) && (this.filter !== "unearned" || !earned.has(a.id)) &&
      (a.faction === -1 || a.faction === data.faction || earned.has(a.id)) &&
      !(a.flags & 2)).sort((a, b) => a.name.localeCompare(b.name));
    this.page = Math.min(this.page, Math.max(0, Math.ceil(definitions.length / 40) - 1));
    for (const a of definitions.slice(this.page * 40, this.page * 40 + 40)) {
      const row = el("button", `achievement-row ${earned.has(a.id) ? "earned" : ""}`);
      const text = el("div", "grow");
      text.append(el("span", "row-name", a.name), el("p", "muted truncate", a.description));
      row.append(icon(a.icon), text, el("span", "achievement-points", a.points ? a.points : "•"));
      if (earned.has(a.id)) row.append(el("span", "earned-check", "✓"));
      this.bind(row, `achievement-${a.id}`, { title: a.name, subtitle: earned.has(a.id) ?
        `Completed ${new Date((earned.get(a.id) ?? 0) * 1000).toLocaleDateString("en-US")}` : "Not yet completed",
      lines: [a.description], achievement: a }); list.append(row);
    }
    if (!list.childElementCount) list.append(el("p", "empty", "No matching achievements"));
    body.append(list); const pager = el("div", "pager");
    for (const [label, delta] of /** @type {[string, number][]} */ ([["‹ Previous", -1], ["Next ›", 1]])) {
      const button = /** @type {HTMLButtonElement} */ (el("button", "", label));
      button.disabled = this.page + delta < 0 || (this.page + delta) * 40 >= definitions.length;
      button.onclick = () => { this.page += delta; this.render(); }; pager.append(button);
      if (delta < 0) pager.append(el("span", "muted",
        `${this.page + 1} / ${Math.max(1, Math.ceil(definitions.length / 40))}`));
    }
    body.append(pager); return this.layout(body);
  }
  /** @param {Achievement} achievement */
  achievementDetails(achievement) {
    const data = /** @type {import('../schema.ts').Achievements | undefined} */ (this.view?.panels.achievements?.data);
    const earned = data?.earned.some((a) => a.id === achievement.id);
    const progress = new Map(data?.progress.map((p) => [p.id, p.counter]) ?? []);
    const criteria = this.catalog.criteria.filter((c) => c.achievement === (achievement.ref || achievement.id))
      .sort((a, b) => a.order - b.order || a.id - b.id);
    this.detail.append(el("h3", "", achievement.flags & 1 ? "Statistics" : "Criteria"));
    if (achievement.count) this.detail.append(el("p", "muted", `Requires ${achievement.count} criteria`));
    for (const c of criteria) {
      this.detail.append(el("p", earned ? "positive" : "", `${earned ? "✓ " : ""}${c.name}`));
      if (!earned) { const value = progress.get(c.id) ?? 0;
        this.detail.append(c.target !== null ? bar(value, c.target) : el("strong", "", number(value))); }
    }
  }
  /** @param {import('../schema.ts').Quests} data */
  quests(data) {
    const body = el("div", "list-body"); const toolbar = el("div", "toolbar");
    toolbar.append(this.search("Find a quest…"), el("span", "gold", `${data.quests.length} / 25 quests`));
    body.append(toolbar); const list = el("div", "scroll list"); list.dataset.scroll = "main";
    for (const group of [...new Set(data.quests.map((q) => q.group))].sort()) {
      const rows = data.quests.filter((q) => q.group === group && this.matches(q.name));
      if (!rows.length) continue; list.append(el("h3", "group-heading", group));
      for (const q of rows) {
        const row = el("button", `quest-row ${q.status}`);
        row.append(el("span", "quest-mark", q.status === "complete" ? "?" : q.status === "failed" ? "×" : "!"),
          el("span", "grow row-name", `[${q.level}] ${q.name}`),
          el("small", "muted", q.status === "incomplete" ? "" : q.status));
        this.bind(row, `quest-${q.id}`, { title: q.name, subtitle: `Level ${q.level} · ${q.group}`,
          lines: [q.details], quest: q }); list.append(row);
      }
    }
    if (!list.childElementCount) list.append(el("p", "empty", "Your quest log is empty"));
    body.append(list); return this.layout(body);
  }
  /** @param {import('../schema.ts').Inventory} data */
  inventory(data) {
    const body = el("div", "list-body"); const toolbar = el("div", "toolbar wrap");
    toolbar.append(select("storage", this.filter, (v) => { this.filter = v; this.render(); }, [
      { value: "all", label: "All storage" }, { value: "carried", label: "Carried bags" },
      { value: "bank", label: "Personal bank" }, { value: "keyring", label: "Keyring" },
      { value: "currency", label: "Currency tokens" },
    ]), this.search("Highlight an item…"));
    body.append(toolbar, el("div", "money", money(data.money)),
      el("div", "currency-summary", `${number(data.honor)} Honor · ${number(data.arena)} Arena points`));
    const list = el("div", "scroll bags"); list.dataset.scroll = "main";
    for (const bag of data.containers.filter((c) => this.filter === "all" || c.kind === this.filter)) {
      const section = el("section", "bag"); const used = bag.slots.filter((s) => s.item).length;
      section.append(el("h3", "group-heading",
        `${bag.name} · ${bag.available ? `${used}/${bag.capacity}` : "Locked"}`));
      const grid = el("div", "bag-grid");
      for (const slot of bag.slots) { const button = this.itemSlot(slot.item, `${bag.id}-${slot.slot}`, bag.name);
        if (this.query && !this.matches(slot.item?.name ?? "")) button.classList.add("search-dimmed");
        grid.append(button);
        }
      if (!bag.capacity) grid.append(el("p", "muted",
        bag.available ? "No bag equipped" : "Bank bag slot not purchased"));
      section.append(grid); list.append(section);
    }
    body.append(list); return this.layout(body);
  }
  tick() {
    if (!this.view) return;
    const frozen = !this.live;
    const snapshot = this.view.panels.quests;
    if (!snapshot) return;
    const age = this.timerAge + (this.live ? performance.now() - this.received : 0);
    for (const node of this.host.querySelectorAll(".quest-timer")) {
      const remaining = Math.max(0, Number(/** @type {HTMLElement} */ (node).dataset.remaining) - age);
      const seconds = Math.floor(remaining / 1000);
      node.textContent = `${frozen ? "Last known time: " : "Time remaining: "}` +
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }
  }
}
