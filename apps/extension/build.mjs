// Bundles the extension's TypeScript into dist/ with esbuild (one IIFE per
// entry, no code splitting, since MV3 service workers and extension pages
// load plain scripts). Load the folder apps/extension itself as unpacked:
// manifest.json points at dist/.
import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const options = {
  absWorkingDir: here,
  entryPoints: {
    background: "src/background/index.ts",
    popup: "src/popup/popup.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
  // Use the shared predicate map straight from source so it is never stale.
  alias: {
    "@nexusid/types": path.resolve(here, "../../packages/types/index.ts"),
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
