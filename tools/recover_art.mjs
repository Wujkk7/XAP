// Recover the original v2 PNG bytes embedded in the committed Web prototype.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("web/game.js", root), "utf8");
const start = source.indexOf("var SPRITES = {");
const end = source.indexOf("\n  };", start);
assert.ok(start >= 0 && end > start, "sprite table not found in web/game.js");
const images = [...source.slice(start, end).matchAll(/"([a-z0-9_]+)": "data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)]
  .map(([, name, data]) => ({ name, bytes: Buffer.from(data, "base64") }));
assert.equal(images.length, 31, "expected the 31 approved v2 sprites");
assert.equal(new Set(images.map(image => image.name)).size, images.length);
const target = new URL("cocos/assets/resources/art/", root);
for (const { name, bytes } of images) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), name + ": invalid PNG");
  assert.ok(bytes.length > 24 && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, name + ": missing image size");
  const file = new URL(name + ".png", target);
  if (existsSync(file)) assert.ok(readFileSync(file).equals(bytes), "refusing to replace edited asset: " + name);
}
mkdirSync(target, { recursive: true });
for (const { name, bytes } of images) writeFileSync(new URL(name + ".png", target), bytes);
console.log("Recovered", images.length, "unchanged PNGs to", fileURLToPath(target));
