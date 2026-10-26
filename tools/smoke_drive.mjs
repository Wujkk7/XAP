// Headless drive test for web/game.js: stub DOM/canvas, steer the game with
// synthetic keyboard input through the real frame loop, and assert the
// movement contract: the miner never ends a frame embedded in a solid, the
// error bar never fires, the camera settles on the player, digging works,
// and a dug shaft can be climbed back up.
// Run after `npm run build:web`:  node tools/smoke_drive.mjs
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

function makeCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get: (t, p) => {
      if (p === "canvas") return {};
      if (typeof p === "string") return t[p] ?? noop;
      return noop;
    },
    set: (t, p, v) => { t[p] = v; return true; },
  });
}
function makeEl(id) {
  return {
    id,
    style: {},
    textContent: "",
    innerHTML: "",
    children: [],
    classList: { add() {}, remove() {} },
    addEventListener() {},
    appendChild(c) { this.children.push(c); },
    querySelector() { return makeEl("q"); },
    closest() { return null; },
    getBoundingClientRect() { return { width: 390, height: 844, left: 0, top: 0 }; },
    getContext() { return makeCtx(); },
    setPointerCapture() {},
  };
}
const els = new Map();
globalThis.document = {
  getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement: () => makeEl("dyn"),
  addEventListener() {},
  hidden: false,
};
globalThis.Image = class {
  constructor() { this.complete = true; this.naturalWidth = 100; this.naturalHeight = 100; }
  set src(v) {}
  get src() { return ""; }
};
const winHandlers = new Map();
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.addEventListener = (type, fn) => {
  if (!winHandlers.has(type)) winHandlers.set(type, []);
  winHandlers.get(type).push(fn);
};

await import(new URL("../web/game.js", import.meta.url));
const X = globalThis.__xap;
if (!X) throw new Error("__xap test hook missing");
const errbar = globalThis.document.getElementById("errbar");

let t = 0;
let failures = 0;
function check(cond, label) {
  if (cond) console.log("  ok:", label);
  else { failures++; console.log("  FAIL:", label); }
}
function pump(n, dtMs = 16.7) {
  for (let i = 0; i < n; i++) {
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error("frame loop stalled");
    t += dtMs;
    cb(t);
    if (X.boxCollides(X.player.x, X.player.y, X.player.z)) {
      check(false, `player embedded in a solid at frame (x=${X.player.x.toFixed(2)}, y=${X.player.y.toFixed(2)}, z=${X.player.z})`);
      return;
    }
    if (errbar.style.display === "block") {
      check(false, "errbar fired: " + errbar.textContent);
      return;
    }
  }
}
function key(type, k) {
  for (const fn of winHandlers.get(type) ?? []) fn({ key: k, preventDefault() {} });
}
function hold(k, frames) {
  key("keydown", k);
  pump(frames);
  key("keyup", k);
}

console.log("== run east on the plains ==");
const x0 = X.player.x;
hold("d", 90);
check(X.player.x - x0 > 2.2, `moved east ${(X.player.x - x0).toFixed(1)} tiles in 1.5s`);
pump(60); // settle
check(Math.abs(X.cam.x - X.player.x) < 0.08, "camera settled on player after stopping");

console.log("== run south, then diagonal ==");
const y0 = X.player.y;
hold("s", 90);
check(X.player.y - y0 > 2.2, `moved south ${(X.player.y - y0).toFixed(1)} tiles`);
key("keydown", "w"); key("keydown", "d");
pump(120);
key("keyup", "w"); key("keyup", "d");
check(true, "diagonal run survived 2s");

console.log("== dig a tree with the dig key held ==");
let tree = null;
for (let r = 1; r < 16 && !tree; r++)
  for (let dx = -r; dx <= r && !tree; dx++)
    for (let dy = -r; dy <= r && !tree; dy++) {
      const tx = Math.floor(X.player.x) + dx, ty = Math.floor(X.player.y) + dy;
      if (X.tileAt(tx, ty, 0).type === "tree") tree = { x: tx, y: ty };
    }
if (tree) {
  X.player.x = tree.x + 0.5; X.player.y = tree.y + 1.5; // stand south of the tree
  X.player.fx = 0; X.player.fy = -1;
  X.setDig(true);
  pump(150);
  X.setDig(false);
  check(X.tileAt(tree.x, tree.y, 0).type !== "tree", "tree dug through (debris/drop path exercised)");
  check((X.save.inventory["wood"] ?? 0) >= 1, "wood collected");
} else {
  console.log("  skip: no tree within reach of spawn");
}

console.log("== shaft round trip ==");
X.player.x = 0.5; X.player.y = 0.5;
pump(5);
X.pressAct();
pump(5);
check(X.player.z === 1, "descended to 1m");
X.pressAct();
pump(5);
check(X.player.z === 0, "climbed back to the surface");

console.log("== random fuzz, 1500 frames ==");
const keysAll = ["w", "a", "s", "d"];
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let round = 0; round < 150; round++) {
  const k = keysAll[(rnd() * 4) | 0];
  const k2 = keysAll[(rnd() * 4) | 0];
  key("keydown", k); key("keydown", k2);
  if (rnd() < 0.25) X.setDig(true);
  pump(10);
  key("keyup", k); key("keyup", k2);
  X.setDig(false);
}
check(X.particles.length <= 260, `particle cap respected (${X.particles.length})`);
check(true, "fuzz finished embedded-free and error-free");

if (failures > 0) {
  console.error(`\nDRIVE SMOKE FAILED: ${failures} assertion(s)`);
  process.exit(1);
}
console.log("\nDRIVE SMOKE PASS: running, digging, shafts and fuzz all clean");
