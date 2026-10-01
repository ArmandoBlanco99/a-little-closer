import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import assert from "node:assert/strict";

// Explicit source allowlist: never sweep the workspace, saves, or dependencies.
const files = {};
const roots = [
  "package.json",
  "package-lock.json",
  "netlify.toml",
  ".gitignore",
  "Makefile",
  "ruff.toml",
  "requirements-dev.txt",
  "README.md",
  "DEVELOPMENT.md",
  "DEPLOYMENT.md",
  "UPLOAD-TO-NETLIFY.md",
  "PLAYTEST.md",
  "VERIFICATION.md",
  "start-windows.bat",
  "start-mac-linux.sh",
];
async function add(path) {
  const name = path.replaceAll("\\", "/");
  if (
    /(^|\/)(node_modules|__pycache__|\.git|\.netlify|\.tools|artifacts|\.venv)(\/|$)|\.sqlite3(?:-.*)?$|\.(log|pyc)$|(^|\/)\.env/.test(
      name,
    )
  )
    return;
  files[name] = new Uint8Array(await readFile(path));
}
async function folder(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      ["node_modules", "__pycache__"].includes(entry.name)
    )
      continue;
    if (entry.isDirectory()) await folder(join(path, entry.name));
    else if (entry.isFile()) await add(join(path, entry.name));
  }
}
for (const path of roots) await add(path);
for (const path of [
  "a-little-closer",
  "netlify",
  "scripts",
  "tests",
  ".github/workflows",
])
  await folder(path);
const bytes = zipSync(files, { level: 9 });
const check = unzipSync(bytes);
for (const path of [
  "package.json",
  "package-lock.json",
  "netlify.toml",
  "netlify/functions/game.ts",
  "a-little-closer/public/index.html",
])
  assert.ok(check[path], path);
assert.equal(
  JSON.parse(strFromU8(check["package-lock.json"])).name,
  "a-little-closer",
);
assert.ok(bytes.length < 50_000_000);
await writeFile("netlify-ready-game.zip", bytes);
console.log(
  `Created netlify-ready-game.zip: ${Object.keys(check).length} source files, ${(bytes.length / 1024).toFixed(0)} KiB. No dependencies, saves, caches, or logs.`,
);
