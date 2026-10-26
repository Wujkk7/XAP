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

// Standalone single-file build: inline the bundle into index.html so the
// game survives being shared as ONE file (chat attachments, file previews
// that drop sibling files). Output: web/xap-standalone.html
import { readFileSync, writeFileSync } from "node:fs";
const js = readFileSync("web/game.js", "utf8");
if (js.includes("</script>")) throw new Error("bundle contains </script>, cannot inline safely");
const html = readFileSync("web/index.html", "utf8");
const tag = '<script src="game.js"></script>';
if (!html.includes(tag)) throw new Error("script tag not found in index.html");
writeFileSync("web/xap-standalone.html", html.replace(tag, "<script>\n" + js + "\n</script>"));
console.log("web/xap-standalone.html built");
