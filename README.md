# mod-char-widget

Live, read-only WotLK character panels for OBS: character information, reputation, skills, talents,
achievements, quest log, and inventory, including personal bank storage. Includes an AzerothCore module,
standalone Bun receiver, and transparent browser widgets. It can run alongside `mod-chat-widget` and
`mod-unit-widget` without depending on either. No SQL installation, core patch, or client addon is required.

## Follow a watch observer

Append `follow=watch` to select an observer's current `mod-watch` assignment:

```text
http://127.0.0.1:3002/widget?source=realm-1&character=Observer&follow=watch&panel=all
```

Use the observer's name or `guid`, not the target's. Names resolve once to an observer GUID;
retargeting with `.watch` switches the widget automatically, including across browser reconnects.
`.unwatch`, disabling watch, or observer logout returns the widget to the observer. An offline,
transferring, or temporarily unobservable target keeps its assignment. Missing target data shows a
waiting state; stale observer data clears the display until fresh assignment data arrives. Each
observer and source is independent, and only the direct assignment is followed.

Upgrade `mod-watch`, this module, and its receiver together through your normal deployment workflow.
The integration uses an optional header from the sibling `modules/mod-watch` directory at compilation;
there is no linked module dependency, additional receiver, or realm database change. Without that
header, with watch disabled, or with a legacy publisher, following displays the selected observer.
Omitting `follow` always keeps the original fixed-character behavior.

If the character allowlist is configured, include both the observer and every target to be displayed.

## Installation

Place this directory at `modules/mod-char-widget`. AzerothCore discovers `Addmod_char_widgetScripts` and
the distributed configuration through its normal module configure/build/install workflow. Copy
`mod_char_widget.conf.dist` to `mod_char_widget.conf`, then set:

```ini
CharWidget.Enable = 1
CharWidget.Endpoint = "http://127.0.0.1:3002/characters"
CharWidget.SourceId = "realm-1"
CharWidget.BearerToken = ""
```

Restart worldserver to apply configuration. The endpoint must end in `/characters`; catalogue uploads go
to its sibling `/catalogs` route. Give each concurrently running worldserver a unique source ID.
An empty endpoint disables both capture and the delivery worker.

Install Bun 1.4.2 or newer on the receiving machine. From this module's `receiver/` directory, run:

```sh
bun run --silent start
```

The receiver has no runtime package installation or frontend build step. It can run on another machine
without AzerothCore or MySQL. For remote operation, configure its bind address and a reachable module
endpoint; the receiver defaults to loopback port 3002. See [receiver settings](receiver/README.md).

External module directories are ignored by the parent AzerothCore repository. Preserve this complete
directory in your module repository or deployment archive.

## OBS setup

Create an OBS **Browser** source at **1000 × 640**, using:

```text
http://127.0.0.1:3002/widget?source=realm-1&character=Alice&panel=all
```

Use OBS **Interact** to navigate the tabs, inspect items, select a specialization, search achievements,
scroll lists, and filter storage. Hover for details; click to pin them through subsequent updates.
These controls only change the overlay's presentation. They do not equip items, spend talents, track
quests, alter reputation flags, or control the game client.

For independent placement, create separate Browser sources and replace `panel=all` with:

| Panel | URL value | Suggested source size |
| --- | --- | --- |
| Character information | `info` | 1000 × 640 |
| Reputation | `reputation` | 800 × 640 |
| Skills | `skills` | 800 × 640 |
| Talent trees and glyphs | `talents` | 1000 × 640; 1200 × 800 for more space |
| Achievements and statistics | `achievements` | 1000 × 640 |
| Quest log | `quests` | 1000 × 640 |
| Bags and personal bank | `inventory` | 1000 × 640 |

Omitting `panel` selects the combined view. Use exactly one of `character` or `guid`, together with
`source`. Names resolve case-insensitively and then remain pinned to their GUID. Unknown characters retry
automatically; ambiguous names require a GUID. Characters being observed with `.watch` can be selected
directly by their own name, or followed through an observer using `follow=watch`.

The title banner and footer are omitted to keep the widget compact. Connection labels appear only when
loading, offline, unavailable, or stale, as a small overlay that does not reserve panel space.

The panels use translucent charcoal shading and subtly raised surfaces with a WotLK-inspired frame. OBS Custom CSS can
override `--width`, `--height`, `--font`, `--gold`, `--accent`, and the background variables `--panel`,
`--surface`, and `--control`. For example:

```css
:root { --width: 1200px; --height: 900px; --font: "Trebuchet MS", sans-serif; }
```

## Displayed data

- **Character:** name/title, race/class, guild, level, health, XP/rested XP, equipment, primary attributes,
  melee/ranged/spell/defense statistics. Static class artwork sits between the equipment columns.
- **Reputation:** visible factions, parent grouping, rank progress, watched, inactive, and at-war indicators.
- **Skills:** known professions, secondary skills, weapons, defense, and languages, including permanent
  and temporary skill bonuses.
- **Talents:** both unlocked talent specializations, tree layout, prerequisites, learned ranks, tree totals,
  and active specialization's unspent points. Glyphs always describe the active specialization.
- **Achievements:** server catalogue, categories, earned/unearned search, points, completion dates,
  criteria, and statistics. Faction filtering uses the character's faction. Earned achievements stay
  complete even when the core has discarded their old criteria counters.
- **Quests:** all active log slots, grouping, description, objectives, authoritative item/kill/PvP/event
  progress, reputation/money requirements, timers, item choices, XP/money, reputation, honor, arena points,
  talent points, spell and title rewards.
- **Inventory:** backpack, four carried bag slots, keyring, currency tokens, money, honor/arena points,
  personal bank, and seven bank bag slots with purchase availability. Empty slots and stack counts remain
  in their actual positions. Bank data is available while online even when the bank UI is closed.

Item details include template stats, normal level scaling, quality, durability, random suffix names,
enchantments, sockets/gems, and named item spells. Structured details do not execute the client's tooltip
scripting language. Custom module changes applied only when an item is equipped or a quest is rewarded
may differ from these standard projections. This is a character journal, not a 3D model viewer or a
recording of the player's currently open client panels. Mail, auction storage, and guild banks are excluded.

## Metadata and icons

Gameplay values and names come from server state, templates, and DBC stores. At startup, module-owned
readers load omitted English display fields from `DataDir/dbc/`: `Achievement.dbc`,
`Achievement_Category.dbc`, `Achievement_Criteria.dbc`, `TalentTab.dbc`, `SpellIcon.dbc`, and `QuestSort.dbc`.
The normal client DBC extractor exports these files. Missing or incompatible supplemental files produce
one diagnostic per file and labeled fallbacks; they do not disable the other panels. Core gameplay
overrides remain authoritative for fields the core loads. Restart worldserver after changing metadata.

Shared achievement/talent metadata travels separately from character state, in versioned chunks.
Artwork is served by the receiver using a local manifest, persistent image cache, optional Wowhead/ZAM
downloads, and local fallbacks. Only allowlisted icon basenames are used externally; character names,
bank contents, and other character data are not sent to the image provider. No client artwork is bundled.

## Capture and delivery

All online characters are eligible by default. `CharWidget.Characters` optionally limits capture to a
comma-separated list of names or full GUIDs. Scalar identity copies are retained; game object pointers
never survive a capture call. The world-update hook runs after map workers join. Sampling starts at
staggered offsets, at two seconds by default, with at most eight character captures per world update.
Large populations may require an allowlist to maintain the desired freshness.

Achievement hooks mark characters dirty; reconciliation every 30 seconds recovers resets and missed
changes. Unchanged panels send presence heartbeats carrying their latest panel revisions; changed panels
send complete replacements. Full retransmission every ten seconds recovers receiver restarts and dropped
queue entries. A missing expected panel revision is shown dimmed until that panel catches up.

HTTP runs exclusively on a background worker. Pending data coalesces by character/panel without moving
its queue position. Limits are 10000 tracked characters, 80000 queued records, 2 MiB per record, 4 MiB per
batch, and a configurable 64 MiB serialized queue budget. JSON/container overhead is additional. The
achievement cache has a separate estimated 64 MiB budget; uncached characters are resampled. Limit
failures are diagnosed and retried through continued sampling; data is never silently truncated.

HTTP 2xx acknowledges delivery. Network errors, 408, 429, and 5xx retry with 1–30 second exponential backoff,
honoring `Retry-After` up to 60 seconds. A 409 requests catalogue replay before state retry. Other state
failures discard the batch with a throttled diagnostic. Observations expire after 15 seconds. HTTPS
verifies certificates and hostnames; redirects are not followed. Shutdown allows two seconds to drain.

After 15 seconds without fresh presence, the browser labels the panels Stale. Explicit logout shows
Offline; transfers show Unavailable. Contents remain dimmed and quest timers freeze until fresh data
returns. Receiver memory retains last-known state until capacity eviction or restart. There is no saved
character history. A browser that loses the receiver connection retains its own last-known panels.

## Module configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `CharWidget.Enable` | `1` | Enable if an endpoint is supplied |
| `CharWidget.Endpoint` | empty | HTTP/HTTPS URL ending in `/characters` |
| `CharWidget.SourceId` | `realm-<RealmID>` | Unique running server identity |
| `CharWidget.BearerToken` | empty | Optional ingestion credential |
| `CharWidget.CAFile` | empty | Additional trusted HTTPS CA bundle |
| `CharWidget.Characters` | empty | Optional comma-separated names/GUIDs; ASCII case-insensitive |
| `CharWidget.UpdateIntervalMs` | `2000` | Sampling interval, 1000–5000 ms |
| `CharWidget.AchievementReconcileMs` | `30000` | Reconciliation, sampling interval–60000 ms |
| `CharWidget.QueueBytes` | `67108864` | Serialized queue budget, 8–256 MiB |
| `CharWidget.ConnectTimeoutMs` | `750` | DNS/TCP/TLS deadline |
| `CharWidget.RequestTimeoutMs` | `1500` | Full request deadline, at least connect timeout, at most 3000 ms |

## Development and verification

From `receiver/`:

```sh
bun install --frozen-lockfile
bun run check
bun run test
```

Tests use temporary loopback listeners, injected clocks, synthetic data, and temporary icon caches. They
do not need a realm or external image service. The C++ tests register with AzerothCore's `BUILD_TESTING`
target. After an explicitly requested C++ test configuration/build, use
`unit_tests --gtest_filter='CharWidget*'`. Run `python apps/codestyle/codestyle-cpp.py` using the checker's
absolute path from this module directory to inspect only this module's `src/` files.

For a synthetic browser preview, start a separate test receiver, then run `bun run demo`. It posts Alice,
Empty, Offline, and a long-name character under `realm-1`. Stop the demo to observe staleness. Do not run
the demo against a receiver ingesting the same source from a real server.

Before deployment, compare with a 3.3.5a client: equip/unequip and repair; change reputation across rank
boundaries; train and advance skills; learn/reset/switch talents and glyphs; complete and reset achievements;
accept, progress, fail, abandon, and turn in quests; move/split/sell items; buy bank slots; swap bags; log
out/in; change maps; disconnect and restart the receiver. Check both individual and combined OBS sources,
including preserved selections, search text, scrolling, and pinned details.

## License and attribution

Authored code is GPL-2.0-or-later. Transport and its tests adapt
[agent-wow/mod-chat-widget](https://github.com/agent-wow/mod-chat-widget) commit `81b5154`, by hazim-j
(Hazim Jumali), through [agent-wow/mod-unit-widget](https://github.com/agent-wow/mod-unit-widget) commit
`bcc630b`, also by hazim-j. Queue, receiver, icon-cache, badge, configuration, and test patterns derive from
that unit-widget commit. Preserve these credits when redistributing. The vendored nlohmann/json 3.12.0
header retains Niels Lohmann's MIT license in `vendor/nlohmann/LICENSE.MIT`. TLS certificates under
`tests/fixtures/` are public, test-only fixtures from the same transport tests.
