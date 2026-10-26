// Bundle the web prototype: web/src/main.ts (+ ../../core) -> web/game.js
// Run: npm run build:web
import { build } from "esbuild";

await build({
  entryPoints: ["web/src/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: "web/game.js",
  sourcemap: false,
  logLevel: "info",
});
console.log("web/game.js built");
