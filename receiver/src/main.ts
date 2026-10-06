// SPDX-License-Identifier: GPL-2.0-or-later
import { Icons } from "./icons.ts";
import { Store } from "./store.ts";
import { createReceiver } from "./receiver.ts";

try {
  const port = Number(process.env.CHAR_WIDGET_PORT ?? 3002);
  const mode = process.env.CHAR_WIDGET_ICON_MODE ?? "hybrid";
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !["hybrid", "offline"].includes(mode)) {
    throw new Error("Invalid receiver settings");
  }
  const stateBytes = Number(process.env.CHAR_WIDGET_STATE_BYTES ?? 256 * 1024 * 1024);
  if (!Number.isInteger(stateBytes) || stateBytes < 8 * 1024 * 1024 || stateBytes > 1024 * 1024 * 1024) {
    throw new Error("Invalid state budget");
  }
  const icons = await Icons.open({ mode: mode as "hybrid" | "offline",
    directory: process.env.CHAR_WIDGET_ICON_DIR, cachePath: process.env.CHAR_WIDGET_ICON_CACHE });
  const receiver = createReceiver({ port, host: process.env.CHAR_WIDGET_HOST ?? "127.0.0.1",
    token: process.env.CHAR_WIDGET_BEARER_TOKEN, icons, store: new Store(undefined, stateBytes) });
  console.error(`Character widget listening at ${receiver.server.url}`);
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5000);
    void receiver.stop().then(() => { clearTimeout(deadline); process.exit(0); });
  });
} catch {
  console.error("Unable to start character widget receiver; check settings, icon manifest, cache, and listening port");
  process.exitCode = 1;
}
