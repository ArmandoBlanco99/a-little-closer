import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { packagedRuntime } from "../tests/netlify/runtime.mjs";
import { people } from "../tests/netlify/support.mjs";

assert.deepEqual(await readdir("netlify/functions"), ["game.ts"]);
const config = await readFile("netlify.toml", "utf8");
assert.ok(!config.includes("redirect") && !config.includes("config.path"));
const frontend = await readFile("dist/transport.js", "utf8");
assert.ok(
  frontend.includes("/.netlify/functions/game") && !frontend.includes("/api/"),
);
assert.ok(!(await readFile("dist/app.js", "utf8")).includes("/api/"));
const manifest = JSON.parse(
  await readFile(".netlify/packaged-functions/manifest.json", "utf8"),
);
assert.equal(manifest.length, 1);
assert.equal(manifest[0].runtimeAPIVersion, 2);
assert.deepEqual(manifest[0].routes, []);
const files = unzipSync(await readFile(".netlify/packaged-functions/game.zip"));
assert.ok(files["___netlify-entry-point.mjs"]);
assert.ok(
  strFromU8(files["netlify/functions/game.mjs"]).includes("onlyIfMatch"),
);
const directory = await mkdtemp(join(tmpdir(), "closer-package-"));
let runtime;
try {
  runtime = await packagedRuntime(directory);
  const call = async (op, body, seat) => {
    const response = await runtime.handler(
      new Request("https://local.test/.netlify/functions/game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(seat ? { Authorization: "Bearer " + seat.token } : {}),
        },
        body: JSON.stringify({ code: seat?.code, ...body, op }),
      }),
      {},
    );
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const a = await call("create", people[0]);
  const b = await call("join", { ...people[1], code: a.code });
  await Promise.all([
    call("action", { action: "ready", id: "a" }, a),
    call("action", { action: "ready", id: "b" }, b),
  ]);
  assert.equal((await call("state", {}, a)).phase, "playing");
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      call(
        "action",
        { action: "chat", id: "chat-" + i, text: "hello " + i },
        i % 2 ? a : b,
      ),
    ),
  );
  assert.equal((await call("state", {}, b)).messages.length, 6);
  await call("action", { action: "chat", id: "chat-0", text: "duplicate" }, b);
  assert.equal((await call("state", {}, a)).messages.length, 6);
  await runtime.close();
  runtime = await packagedRuntime(directory);
  assert.equal((await call("state", {}, a)).messages.length, 6);
  console.log(
    "PASS: production frontend, official function archive, SDK conditional writes, concurrent actions, persistence across runtime restart.",
  );
} finally {
  if (runtime) await runtime.close();
  await rm(directory, { recursive: true, force: true });
}
