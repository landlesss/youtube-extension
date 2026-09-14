import * as esbuild from "esbuild";
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
// `--store` strips the manifest "key" field: it pins a stable extension ID
// for local unpacked loads, but the Chrome Web Store rejects any package
// that contains it (the store manages the key itself).
const forStore = process.argv.includes("--store");
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

const welcomeCtx = await esbuild.context({
  ...commonOptions,
  entryPoints: ["src/welcome/welcome.ts"],
  outfile: `${outdir}/welcome.js`,
  format: "iife",
});

function copyStaticFiles() {
  if (forStore) {
    const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
    delete manifest.key;
    writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
    console.log('Store build: removed "key" from manifest');
  } else {
    cpSync("manifest.json", `${outdir}/manifest.json`);
  }
  cpSync("_locales", `${outdir}/_locales`, { recursive: true });
  cpSync("icons", `${outdir}/icons`, { recursive: true });
  cpSync("src/welcome/welcome.html", `${outdir}/welcome.html`);
  cpSync("src/welcome/welcome.css", `${outdir}/welcome.css`);
}

if (watch) {
  copyStaticFiles();
  await contentCtx.watch();
  await backgroundCtx.watch();
  await welcomeCtx.watch();
  console.log("Watching for changes...");
} else {
  await contentCtx.rebuild();
  await backgroundCtx.rebuild();
  await welcomeCtx.rebuild();
  copyStaticFiles();
  await contentCtx.dispose();
  await backgroundCtx.dispose();
  await welcomeCtx.dispose();
  console.log(`Build complete -> ${outdir}/`);
}
