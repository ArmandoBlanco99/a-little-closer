import test from "node:test";
import assert from "node:assert/strict";
import { harness, people } from "./support.mjs";
import {
  DIRECTIONS,
  SHAPES,
  STAR_HINTS,
  gardenLayout,
} from "../../a-little-closer/netlify/game-rules.js";

async function walk(h, i, target) {
  const position = (await h.state(i)).adventure.positions[i];
  const direction = Object.keys(DIRECTIONS).find((k) =>
    DIRECTIONS[k].every((d, axis) => position[axis] + d === target[axis]),
  );
  assert.ok(direction);
  await h.action(i, "move", { direction });
}
async function navigate(h, i, target) {
  const a = (await h.state(i)).adventure,
    queue = [[a.positions[i], []]],
    seen = new Set();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  while (queue.length) {
    const [position, path] = queue.shift();
    if (same(position, target)) {
      for (const cell of path) await walk(h, i, cell);
      return;
    }
    if (seen.has(String(position))) continue;
    seen.add(String(position));
    for (const d of Object.values(DIRECTIONS)) {
      const next = position.map((v, axis) => v + d[axis]);
      if (
        !a.cells.some((c) => same(c, next)) ||
        (same(next, a.bridge) && !a.horizontal)
      )
        continue;
      if (
        a.gates.some(
          (g) =>
            same(next, g.cell) &&
            !a.opened.includes(g.label) &&
            !same(a.positions[1 - i], g.plate),
        )
      )
        continue;
      queue.push([next, [...path, next]]);
    }
  }
  throw Error("No route");
}

test("two players complete four chapters, both flights, all reveals and shared ending", async () => {
  const h = harness();
  await h.start();
  await h.ready();
  for (let step = 0; step < 2; step++) {
    const pilot = step % 2;
    await h.action(pilot, "launch");
    let finished = false;
    for (let frame = 0; frame < 1800; frame++) {
      h.now += 0.1;
      await h.state(1 - pilot);
      const s = await h.state(pilot),
        a = s.adventure;
      if (s.step !== step || s.phase !== "playing") {
        finished = true;
        break;
      }
      if (!a.running) await h.action(pilot, "launch");
      const stamp = a.stamps.find((s) => !s.got && s.x > a.x - 25),
        target = stamp?.y ?? 365;
      await h.action(pilot, "steer", {
        value: Math.abs(target - a.y) < 10 ? 0 : target > a.y ? 1 : -1,
      });
      await h.action(1 - pilot, "fire");
      if (
        a.objects.some(
          (o) =>
            !o.gone && o.x > a.x && o.x - a.x < 100 && Math.abs(o.y - a.y) < 60,
        )
      )
        await h.action(1 - pilot, "shield");
    }
    assert.ok(finished, "flight completed without editing game state");
  }
  assert.equal((await h.state()).phase, "checkpoint");
  await h.ready();
  for (let step = 0; step < 3; step++) {
    const states = [await h.state(), await h.state(1)];
    assert.equal(states[0].stage, 1);
    assert.equal(states[0].adventure.path, undefined);
    const paths = [
      states[1].adventure.partner_chart.path,
      states[0].adventure.partner_chart.path,
    ];
    assert.deepEqual(paths[0], gardenLayout(step, 0).path);
    for (let j = 1; j < paths[0].length; j++)
      for (let i = 0; i < 2; i++) await walk(h, i, paths[i][j]);
  }
  assert.equal((await h.state()).phase, "checkpoint");
  await h.ready();
  for (let step = 0; step < 3; step++) {
    await navigate(h, 0, [1, 1]);
    await navigate(h, 1, [4, 2]);
    if (step === 2) {
      await navigate(h, 1, [4, 3]);
      await h.action(1, "turn_bridge");
    }
    if (step) {
      await navigate(h, 0, [4, 5]);
      await navigate(h, 1, [7, 2]);
    }
    await navigate(h, 0, [8, 3]);
    await navigate(h, 1, [8, 3]);
  }
  assert.equal((await h.state()).phase, "checkpoint");
  await h.ready();
  await h.action(0, "star", { value: 7 });
  assert.equal((await h.state(1)).adventure.selected, null);
  assert.equal((await h.state(1)).adventure.picks, undefined);
  await h.action(1, "star", { value: 7 });
  assert.deepEqual((await h.state()).adventure.threads, []);
  for (const [step, shape] of SHAPES.entries()) {
    for (let j = 0; j < shape.path.length - 1; j++) {
      assert.equal(
        (await h.state()).adventure.clue,
        STAR_HINTS[shape.path[j + 1]],
      );
      const epoch = (await h.state()).epoch;
      await Promise.all([
        h.action(0, "star", { value: shape.path[j] }),
        h.action(1, "star", { value: shape.path[j + 1] }),
      ]);
      assert.equal(
        (
          await h.call(
            "action",
            { action: "star", value: 0, epoch, id: "stale" },
            h.seats[0],
          )
        ).status,
        400,
      );
    }
    assert.equal((await h.state()).adventure.name, shape.name);
    assert.equal((await h.state()).adventure.complete, true);
    h.resetHandler(); // A new function instance sees the persisted reveal.
    await h.action(0, "continue_stars");
    await h.action(0, "continue_stars");
    assert.equal((await h.state()).step, step);
    await h.action(1, "continue_stars");
  }
  const a = await h.state(),
    b = await h.state(1);
  assert.equal(a.phase, "victory");
  assert.ok(a.collected_stamps >= 6);
  assert.deepEqual(
    a.discoveries,
    SHAPES.map((s) => s.name),
  );
  assert.equal(a.date, b.date);
  assert.equal(a.distance, b.distance);
  assert.deepEqual(a.constellations, b.constellations);
  await h.action(0, "heart");
  assert.equal((await h.state(1)).messages.at(-1).text, "\u2665");
});

test("conditional writes prevent third seats and lost simultaneous actions; IDs deduplicate", async () => {
  const h = harness();
  const a = await h.ok("create", people[0]);
  const joins = await Promise.all([
    h.call("join", { ...people[1], code: a.code }),
    h.call("join", { ...people[1], code: a.code }),
  ]);
  assert.deepEqual(joins.map((r) => r.status).sort(), [200, 400]);
  h.seats = [a, joins.find((r) => r.status === 200).body];
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      h.action(i % 2, "chat", { text: "message " + i }),
    ),
  );
  assert.equal((await h.state()).messages.length, 6);
  await Promise.all(
    [0, 1].map(() => h.action(0, "chat", { id: "same", text: "only once" })),
  );
  assert.equal(
    (await h.state()).messages.filter((m) => m.text === "only once").length,
    1,
  );
  h.store.conflicts = 2;
  await h.action(1, "chat", { text: "retry" });
  h.store.conflicts = 99;
  assert.equal(
    (
      await h.call(
        "action",
        { id: "conflict", action: "chat", text: "no commit" },
        a,
      )
    ).status,
    503,
  );
  h.store.conflicts = 0;
  assert.ok(!(await h.state()).messages.some((m) => m.text === "no commit"));
});

test("credentials, validation, admission limits, and expiry", async () => {
  const h = harness();
  await h.start();
  const state = JSON.stringify(await h.state());
  for (const seat of h.seats) assert.ok(!state.includes(seat.token));
  assert.equal(
    (await h.call("state", {}, { ...h.seats[0], token: "wrong" })).status,
    403,
  );
  assert.equal(
    (await h.call("state", { code: "../other" }, h.seats[0])).status,
    400,
  );
  assert.equal(
    (await h.call("create", { ...people[0], lat: null })).status,
    400,
  );
  assert.equal(
    (await h.call("create", { ...people[0], name: "x".repeat(9000) })).status,
    413,
  );
  for (let i = 0; i < 30; i++)
    assert.equal(
      (await h.call("create", people[0], null, { ip: "test-ip" })).status,
      200,
    );
  assert.equal(
    (await h.call("create", people[0], null, { ip: "test-ip" })).status,
    429,
  );
  h.now += 86401;
  assert.equal((await h.call("state", {}, h.seats[0])).status, 410);
  assert.deepEqual(h.room(), { expired: true });
});

test("server clock, plane roles, offline pause and cold-instance resume", async () => {
  const h = harness();
  await h.start();
  await h.ready();
  await assert.rejects(h.action(1, "launch"));
  await assert.rejects(h.action(0, "fire"));
  await h.action(0, "launch");
  await h.action(0, "steer", { value: -1, x: 2050, now: h.now + 100 });
  assert.equal((await h.state()).adventure.x, 0);
  h.now += 0.1;
  const before = await h.state();
  assert.ok(before.adventure.y < 200);
  h.resetHandler();
  assert.equal((await h.state()).adventure.x, before.adventure.x);
  h.now += 7;
  const paused = await h.state();
  assert.equal(paused.paused, true);
  assert.equal(paused.adventure.x, before.adventure.x);
  await h.state(1);
  await h.ready();
  assert.equal(h.room().adventure.steer, 0);
  await h.ok("leave", {}, h.seats[1]);
  assert.equal((await h.state()).paused, true);
});

test("practice stays private and cannot award the shared ending", async () => {
  const h = harness();
  await h.start(true);
  await h.ready();
  await h.action(0, "launch");
  h.now += 0.1;
  const s = await h.state();
  assert.equal(s.players[1].bot, true);
  assert.ok(s.adventure.bullets.length);
  assert.equal(
    (await h.call("join", { ...people[1], code: h.seats[0].code })).status,
    400,
  );
  for (let step = 0; step < 2; step++) {
    let delivered = false;
    for (let frame = 0; frame < 1800; frame++) {
      h.now += 0.1;
      const state = await h.state();
      if (state.step !== step || state.phase !== "playing") {
        delivered = true;
        break;
      }
      const a = state.adventure;
      assert.equal(a.pilot, 0);
      if (!a.running) await h.action(0, "launch");
      const target =
        a.stamps.find((stamp) => !stamp.got && stamp.x > a.x - 25)?.y ?? 365;
      await h.action(0, "steer", {
        value: Math.abs(target - a.y) < 10 ? 0 : target > a.y ? 1 : -1,
      });
    }
    assert.ok(delivered);
  }
  assert.equal((await h.state()).phase, "practice_complete");
  assert.equal((await h.state()).date, null);
  await assert.rejects(h.action(0, "ready"));
});

test("storage without an ETag fails closed instead of overwriting a room", async () => {
  const h = harness();
  await h.start();
  const before = h.room();
  const get = h.store.getWithMetadata.bind(h.store);
  h.store.getWithMetadata = async (...args) => {
    const result = await get(...args);
    delete result.etag;
    return result;
  };
  assert.equal(
    (
      await h.call(
        "action",
        { id: "unsafe", action: "chat", text: "must not write" },
        h.seats[0],
      )
    ).status,
    503,
  );
  assert.deepEqual(h.room(), before);
});

test("HTTP method, origin and malformed JSON are rejected", async () => {
  const h = harness();
  const url = "https://closer.example/.netlify/functions/game";
  assert.equal((await h.handler(new Request(url))).status, 405);
  assert.equal(
    (
      await h.handler(
        new Request(url, {
          method: "POST",
          headers: { Origin: "https://elsewhere.example" },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  for (const body of ["{broken", "null", "[]"]) {
    assert.equal(
      (
        await h.handler(
          new Request(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }),
        )
      ).status,
      400,
    );
  }
});
