import * as esbuild from "esbuild";
import { cpSync, rmSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const commonOptions = {
  bundle: true,
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
  target: ["chrome116"],
};

const contentCtx = await esbuild.context({
  ...commonOptions,
  entryPoints: ["src/content/index.ts"],
  outfile: `${outdir}/content.js`,
  format: "iife",
});

const backgroundCtx = await esbuild.context({
  ...commonOptions,
  entryPoints: ["src/background.ts"],
  outfile: `${outdir}/background.js`,
  format: "esm",
});

function copyStaticFiles() {
  cpSync("manifest.json", `${outdir}/manifest.json`);
  cpSync("_locales", `${outdir}/_locales`, { recursive: true });
  cpSync("icons", `${outdir}/icons`, { recursive: true });
}

if (watch) {
  copyStaticFiles();
  await contentCtx.watch();
  await backgroundCtx.watch();
  console.log("Watching for changes...");
} else {
  await contentCtx.rebuild();
  await backgroundCtx.rebuild();
  copyStaticFiles();
  await contentCtx.dispose();
  await backgroundCtx.dispose();
  console.log(`Build complete -> ${outdir}/`);
}
