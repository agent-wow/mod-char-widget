// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Icons } from "../src/icons.ts";
import { plain, money } from "../src/web/render.js";

test("icon names are confined; cache and offline mode avoid external lookups", async () => {
  const directory = await mkdtemp(join(tmpdir(), "char-icons-")); let calls = 0;
  try {
    const cachePath = join(directory, "cache.sqlite");
    const icons = await Icons.open({ directory, cachePath, fetcher: async (url) => {
      ++calls; expect(url).toBe("https://wow.zamimg.com/images/wow/icons/large/spell_frost_frostbolt02.jpg");
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0, 0]), { headers: { "Content-Type": "image/jpeg" } });
    } });
    expect(await icons.get("../secret")).toBeNull();
    expect(await icons.get("spell_frost_frostbolt02")).not.toBeNull();
    expect(await icons.get("spell_frost_frostbolt02")).not.toBeNull(); expect(calls).toBe(1); icons.close();
    const offline = await Icons.open({ directory, cachePath, mode: "offline",
      fetcher: async () => { throw new Error("Offline must not fetch"); } });
    expect(await offline.get("spell_frost_frostbolt02")).not.toBeNull();
    expect(await offline.get("missing")).toBeNull(); offline.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("local override wins, manifest traversal fails, and escaping symlinks are not served", async () => {
  const directory = await mkdtemp(join(tmpdir(), "char-local-"));
  const outside = await mkdtemp(join(tmpdir(), "char-outside-"));
  try {
    await writeFile(join(directory, "manifest.json"),
      JSON.stringify({ item_icon: "local.png", escaped: "escape.png" }));
    await writeFile(join(directory, "local.png"), new Uint8Array([1, 2, 3]));
    await writeFile(join(outside, "private.png"), new Uint8Array([9]));
    await symlink(join(outside, "private.png"), join(directory, "escape.png"));
    const icons = await Icons.open({ directory, cachePath: ":memory:", mode: "offline" });
    expect((await icons.get("item_icon"))?.bytes.length).toBe(3);
    expect(await icons.get("escaped")).toBeNull(); icons.close();
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ item_icon: "../private.png" }));
    await expect(Icons.open({ directory, cachePath: ":memory:" })).rejects.toThrow("Invalid icon manifest");
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
test("game text remains plain text and copper conversion is exact", () => {
  expect(plain("|cffaabbccAlice|r |Hitem:1|h[Item]|h")).toBe("Alice [Item]");
  expect(plain("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  expect(money(123456)).toBe("12g 34s 56c");
});
