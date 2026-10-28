// Bundles the app into dist/: main and one preload per window for Electron, one script per window, plus the
// window HTML and CSS.
import { build } from "esbuild";
import fs from "node:fs";

fs.rmSync("dist", { recursive: true, force: true });
const common = { bundle: true, sourcemap: true, logLevel: "warning", target: "es2023" };
await build({
  ...common,
  entryPoints: ["src/main/main.ts", "src/main/dm-preload.ts", "src/main/player-preload.ts"],
  outdir: "dist",
  // The package is "type": "module", so CommonJS output for Electron needs the .cjs extension.
  outExtension: { ".js": ".cjs" },
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await build({
  ...common,
  entryPoints: ["src/renderer/dm.ts", "src/renderer/player.ts"],
  outdir: "dist",
  platform: "browser",
  format: "iife",
});
for (const f of ["dm.html", "dm.css", "player.html", "player.css"]) fs.copyFileSync(`src/renderer/${f}`, `dist/${f}`);
console.log("build: dist/ ready");
