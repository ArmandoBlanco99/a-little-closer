import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Parse source without running browser code, starting servers, or reading saves.
// The production build separately compiles the TypeScript function entrypoint.
let checked = 0;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (/\.(js|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ["--check", path], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
      checked++;
    }
  }
}
for (const directory of ["a-little-closer/public", "a-little-closer/netlify", "scripts", "tests/netlify"]) await check(directory);
// This standalone browser check is outside the Netlify test directory.
const result = spawnSync(process.execPath, ["--check", "tests/flight_motion_checks.js"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log(`JavaScript syntax checks passed (${checked + 1} source files).`);
