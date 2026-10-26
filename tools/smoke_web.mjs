// Headless smoke test for web/game.js: stub DOM/canvas, run init + 3 frames.
// Run after `npm run build:web`:  node tools/smoke_web.mjs
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
};
globalThis.Image = class {
  constructor() { this.complete = true; this.naturalWidth = 100; this.naturalHeight = 100; }
  set src(v) {}
  get src() { return ""; }
};
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.addEventListener = () => {};

await import(new URL("../web/game.js", import.meta.url));
if (!rafCb) throw new Error("no rAF callback registered");
rafCb(16); rafCb(32); rafCb(48);
const saved = store.get("xap-save-v1");
if (!saved) throw new Error("no save written");
const parsed = JSON.parse(saved);
if (parsed.seedString !== "xap-world-1") throw new Error("unexpected save: " + saved.slice(0, 80));
console.log("SMOKE OK: init + 3 frames rendered, save persisted (" + saved.length + " bytes)");
