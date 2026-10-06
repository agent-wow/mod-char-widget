# Character widget receiver

Standalone Bun 1.4.2+ service for character panels. Start with `bun run --silent start` from this directory.
No AzerothCore installation, database credentials, frontend build, or runtime dependency installation is
needed on the receiving machine. Diagnostics go to stderr; ingestion requests and payloads are not logged.

## Settings

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `CHAR_WIDGET_HOST` | `127.0.0.1` | Bind address; use a reachable interface for remote operation |
| `CHAR_WIDGET_PORT` | `3002` | Port, 1–65535 |
| `CHAR_WIDGET_BEARER_TOKEN` | empty | Optional credential for both ingestion routes |
| `CHAR_WIDGET_STATE_BYTES` | `268435456` | Estimated character-state budget, 8–1024 MiB |
| `CHAR_WIDGET_ICON_MODE` | `hybrid` | `hybrid` or `offline` |
| `CHAR_WIDGET_ICON_DIR` | `./icons` | Local images and optional `manifest.json` |
| `CHAR_WIDGET_ICON_CACHE` | `./data/icons.sqlite` | Persistent image cache; `:memory:` is supported |

Paths are relative to the working directory. Settings are startup-only. Viewing endpoints have no token;
use a trusted network or a reverse proxy with deployment-specific access controls and HTTPS. Disable
proxy buffering for SSE. The optional ingestion token protects both `/characters` and `/catalogs`.

## Widget and read APIs

```text
/widget?source=realm-1&character=Alice&panel=all
/widget?source=realm-1&guid=Player-1-00000001&panel=inventory
/api/characters?source=realm-1
/api/character?source=realm-1&character=Alice
/api/character/stream?source=realm-1&guid=Player-1-00000001&panel=quests
/api/catalog?source=realm-1&process=<process_id>&revision=<catalog_revision>
```

Use the actual full GUID returned by discovery. Select exactly one character name or GUID within a source.
Names are case-insensitive. Unknown names return 404, ambiguous names return 409, and an unknown GUID
returns null, allowing clients to wait for future observations. `panel` defaults to `all`; valid values are
`info`, `reputation`, `skills`, `talents`, `achievements`, `quests`, and `inventory`. Read APIs use `no-store`.

The stream sends an initial `snapshot` event with identity/presence and empty `panels`, followed by separate
`panel` events containing `{panel, sequence, age_ms, stale, data}`. Later `presence` events update the header
without clearing panels. A generation change starts a new `snapshot`. Streams have no event-history replay;
reconnection starts from current state. Consumers merge panel replacements into the current generation.

There are at most 128 streams. Each stream has a 4 MiB buffering budget, sends panels on demand, coalesces
undelivered changes, and disconnects consumers blocked for 15 seconds. Keepalives run every 15 seconds.
Panel records are bounded to 2 MiB, so a single valid panel always fits the default stream budget.

## Ingestion protocol

Both POST routes require uncompressed UTF-8 `application/json` and, when configured,
`Authorization: Bearer <token>`. An upload has an 8 MiB body limit and three-second body deadline. Four
uploads may be active. Validation finishes before committing character state.

`POST /characters` uses:

```json
{
  "schema_version": 1,
  "source_id": "realm-1",
  "process_id": "server-startup-identifier",
  "updates": []
}
```

Each update contains `guid`, `name`, `panel`, `sequence`, `age_ms`, `catalog_revision`, and `data`.
`sequence` is a positive uint64 decimal **string**, increasing within the sending process. `age_ms`
measures capture-to-dispatch age, without requiring synchronized clocks. A batch accepts up to 100 updates.
Normal panels replace their complete state; see [schema.ts](src/schema.ts) for all fields and validation.

`panel: "presence"` carries `{presence: "online", revisions: {...}}`, where `revisions` maps all seven
panels to their latest sequence strings. Offline/unavailable presence records do not require revisions.
This lets unchanged content remain live while a panel missing its expected replacement is marked stale.
An explicit offline record retains the previous panels and freezes their elapsed age at logout.

`POST /catalogs` accepts:

```json
{
  "schema_version": 1,
  "source_id": "realm-1",
  "process_id": "server-startup-identifier",
  "revision": "catalogue-identifier",
  "chunk_index": 0,
  "chunk_count": 1,
  "entries": []
}
```

Entries contain `kind` and `data`. Kinds are `achievements`, `criteria`, `categories`, `trees`, and `talents`.
Chunks can arrive out of order; identical retries are acknowledged. Publication is atomic after all chunks
arrive, and conflicting chunks or duplicate entry IDs are rejected. Limits are 64 chunks, 5000 entries per
chunk, and an estimated 64 MiB total catalogue budget. Incomplete catalogues expire after 60 seconds.

Live updates referring to an unknown catalogue return `409 {"error":"catalog_required"}`. Send the
catalogue again, then retry state. This also handles receiver restarts. One running process per source is
required. The first fresh state from a new process retires the prior process. Delayed retired-process,
duplicate, older, and already-15-second-old updates are acknowledged without extending freshness.
Sequences are compared independently per panel/presence. Empty batches do not extend freshness.

Character state stays in memory, with limits of 10000 characters, 128 sources, 128 retired processes per
source, and the configured estimated state budget. Oldest offline/stale entries are evicted before new
state is refused. Capacity failure leaves the prior state unchanged. Receiver shutdown stops streams and
connections; unacknowledged uploads may retry. Character history is not persisted.

| Status | Meaning |
| --- | --- |
| `204` | Accepted, including harmless duplicates/expired observations |
| `400` | Invalid JSON, UTF-8, or selector |
| `401` | Missing/incorrect ingestion token |
| `404` | Unknown route/name, catalogue, or icon |
| `405` | Unsupported method |
| `408` | Upload deadline exceeded |
| `409` | Catalogue replay needed, or ambiguous name on a read endpoint |
| `413` | Request body exceeds 8 MiB |
| `415` | Unsupported content type/compression |
| `422` | Invalid schema, conflicting chunks, or duplicate catalogue IDs |
| `503` | Capacity/admission/shutdown; retry after one second |

## Icons

Copy `icons/manifest.example.json` to `icons/manifest.json` and place the referenced PNG/JPEG/WebP files
beside it. Keys are lowercase icon basenames, such as `inv_staff_13`, or `class-8` for the mage avatar.
Only flat filenames are accepted; directory traversal and symlinks outside the icon directory are rejected.
Restart the receiver after changing the manifest.

Precedence is local override, persistent SQLite cache, then the allowlisted Wowhead/ZAM image host in
hybrid mode. Offline mode uses only local/cached images. The browser loads `/icons/name/<basename>` and
`/icons/class/<id>`. Missing item/spell icons display a pictogram; class artwork has a local SVG badge fallback.

External requests use only validated icon basenames, never character data or external tooltip HTML.
Downloads have three-second deadlines, 128 KiB response limits, four-way concurrency, bounded pending
lookups, redirect rejection, and a 32 MiB persistent cache. Failed lookups back off for one minute. Local
icon/cache setup errors stop startup; runtime artwork failures do not block state ingestion.

## Demo and tests

`bun run demo` posts synthetic fixtures to `http://127.0.0.1:3002/characters`. Override with
`CHAR_WIDGET_DEMO_ENDPOINT`; the demo respects `CHAR_WIDGET_BEARER_TOKEN`. Use a separate test receiver
from the real realm. Alice has every panel populated; Empty exercises empty lists; Offline retains its
panels; the long-name fixture exercises layout. Stop the demo to check staleness.

Run `bun install --frozen-lockfile`, `bun run check`, and `bun run test`. Tests use ephemeral loopback
sockets, injected clocks/providers, and temporary cache directories. No realm or external provider is used.
