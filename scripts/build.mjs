import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipFunctions } from "@netlify/zip-it-and-ship-it";

// Fixed output paths only. No private server files go into the publish folder.
const root = process.cwd();
const dist = resolve(root, "dist");
if (dist !== resolve(root) + "/dist" && dist !== resolve(root) + "\\dist")
  throw Error("Unexpected build directory");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp("a-little-closer/public", dist, { recursive: true });
await cp("a-little-closer/public/transport-netlify.js", "dist/transport.js");
await rm("dist/transport-netlify.js");
const functions = await zipFunctions(
  "netlify/functions",
  ".netlify/packaged-functions",
  {
    archiveFormat: "zip",
    config: { "*": { nodeBundler: "esbuild", nodeVersion: "22.x" } },
  },
);
if (functions.length !== 1 || functions[0].name !== "game")
  throw Error("Expected exactly one game function");
await writeFile(
  ".netlify/packaged-functions/manifest.json",
  JSON.stringify(functions, null, 2),
);
console.log(
  "Built static frontend and packaged game function with Netlify bundler.",
);
