// Authoritative edition-two rules. Helpers deliberately live outside Functions.
import { randomBytes, timingSafeEqual } from "node:crypto";
export const COUNTS = [2, 3, 3, 3];
export const DIRECTIONS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const STAR_NAMES = [
  "Luna",
  "Nova",
  "Sol",
  "Vega",
  "Lyra",
  "Orion",
  "Mira",
  "Polaris",
];
export const STAR_POINTS = [
  [150, 40],
  [350, 40],
  [70, 145],
  [250, 145],
  [430, 145],
  [150, 255],
  [350, 255],
  [250, 335],
];
export const STAR_HINTS = [
  "the left star in the top row",
  "the right star in the top row",
  "the far-left star in the middle row",
  "the center star in the middle row",
  "the far-right star in the middle row",
  "the left star in the lower pair",
  "the right star in the lower pair",
  "the single star at the very bottom",
];
export const SHAPES = [
  { name: "A kite", path: [0, 4, 6, 2, 0, 3, 7] },
  { name: "A sailboat", path: [3, 0, 2, 3, 4, 6, 5, 2] },
  { name: "A heart", path: [3, 0, 2, 5, 7, 6, 4, 1, 3] },
];
export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const require = (value, message) => {
  if (!value) throw new GameError(message);
};
const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const includes = (cells, cell) => cells.some((c) => same(c, cell));
const clone = structuredClone;
export const online = (p, now) => p.bot || now - p.seen < 6;
export function profile(d, now) {
  const name = String(d.name ?? "")
      .trim()
      .slice(0, 28),
    city = String(d.city ?? "")
      .trim()
      .slice(0, 80);
  require(d.lat !== null &&
    d.lat !== "" &&
    d.lon !== null &&
    d.lon !== "", "Choose a city or enter valid coordinates.");
  const lat = Number(d.lat),
    lon = Number(d.lon);
  require(name &&
    city &&
    Number.isFinite(lat + lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180, "Add your name and a valid city location.");
  return {
    id: randomBytes(16).toString("hex"),
    token: randomBytes(32).toString("base64url"),
    name,
    city,
    lat,
    lon,
    avatar: ["fox", "rabbit", "bear", "cat"].includes(d.avatar)
      ? d.avatar
      : "fox",
    ready: false,
    seen: now,
  };
}
export function distance(a, b) {
  const rad = (x) => (x * Math.PI) / 180,
    p = rad(a.lat),
    q = rad(b.lat),
    h =
      Math.sin((q - p) / 2) ** 2 +
      Math.cos(p) * Math.cos(q) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function createRoom(code, d, now) {
  const p = profile(d, now),
    r = {
      code,
      edition: 2,
      players: [p],
      phase: "lobby",
      stage: 0,
      step: 0,
      epoch: 0,
      version: 0,
      paused: false,
      relaxed: false,
      distance: 0,
      messages: [],
      actions: [],
      placed: [],
      threads: [],
      feedback: "",
      date: null,
      updated: now,
      practice: d.practice === true,
    };
  if (r.practice) {
    r.players.push({
      ...profile(
        {
          name: "Practice partner",
          city: "Madrid, Spain",
          lat: 40.4168,
          lon: -3.7038,
          avatar: "rabbit",
        },
        now,
      ),
      bot: true,
    });
    r.distance = distance(...r.players);
  }
  return r;
}
export const session = (r, i) => ({
  code: r.code,
  token: r.players[i].token,
  player: r.players[i].id,
});
export function authenticate(r, token) {
  require(typeof token === "string" &&
    token.length < 128, "Your player session is not valid for this room.");
  const value = Buffer.from(token),
    i = r.players.findIndex((p) => {
      const expected = Buffer.from(p.token);
      return (
        expected.length === value.length && timingSafeEqual(expected, value)
      );
    });
  require(i >= 0, "Your player session is not valid for this room.");
  return i;
}
export function gardenLayout(step, player) {
  const paths = [
    [
      [0, 3],
      [1, 3],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 3],
      [4, 4],
      [5, 4],
      [6, 4],
      [6, 3],
    ],
    [
      [0, 3],
      [1, 3],
      [1, 2],
      [1, 1],
      [2, 1],
      [2, 2],
      [2, 3],
      [3, 3],
      [4, 3],
      [4, 2],
      [5, 2],
      [5, 3],
      [6, 3],
    ],
    [
      [0, 3],
      [0, 2],
      [1, 2],
      [1, 1],
      [2, 1],
      [2, 2],
      [2, 3],
      [3, 3],
      [4, 3],
      [4, 4],
      [5, 4],
      [5, 5],
      [6, 5],
      [6, 4],
      [6, 3],
    ],
  ];
  const mirror = (c) => [c[0], player ? 6 - c[1] : c[1]];
  return {
    path: paths[step].map(mirror),
    switch: step ? mirror([2, 1]) : null,
    gate: step ? [3, 3] : null,
    lights:
      step === 2
        ? [
            [1, 1],
            [5, 5],
          ].map(mirror)
        : [],
  };
}
export function bridgeLayout(step) {
  const gates = [{ cell: [3, 3], plate: [1, 1], lever: [4, 2], label: "A" }];
  if (step)
    gates.push({ cell: [6, 3], plate: [4, 5], lever: [7, 2], label: "B" });
  return {
    cells: [
      ...Array.from({ length: 9 }, (_, x) => [x, 3]),
      [0, 4],
      [1, 4],
      [1, 2],
      [1, 1],
      [2, 1],
      [2, 0],
      [4, 2],
      [4, 1],
      [4, 4],
      [4, 5],
      [3, 5],
      [7, 2],
      [7, 1],
      [7, 4],
      [8, 4],
    ],
    gates,
    bridge: step === 2 ? [5, 3] : null,
    exit: [8, 3],
    width: 9,
    height: 7,
  };
}
export function newPuzzle(r, now) {
  r.epoch++;
  r.feedback = "";
  if (r.stage === 0)
    r.adventure = {
      kind: "plane",
      x: 0,
      y: 200,
      running: false,
      steer: 0,
      steer_until: 0,
      last: now,
      shot_at: -100,
      shield_at: -100,
      shield_until: 0,
      immune_until: 0,
      bullets: [],
      objects: Array.from({ length: 12 }, (_, j) => ({
        id: `o${j}`,
        x: 360 + j * 135,
        y: [110, 270, 190, 85, 310, 170][(j + r.step * 2) % 6],
        kind: j % 3 === 0 ? "cloud" : "rock",
        gone: false,
      })),
      stamps: Array.from({ length: 5 }, (_, j) => ({
        id: `s${j}`,
        x: 270 + j * 335,
        y: [200, 100, 285, 145, 235][j],
        got: false,
      })),
      bumps: 0,
      length: 2050,
      clock: 0,
    };
  else if (r.stage === 1)
    r.adventure = {
      kind: "garden",
      positions: [
        [0, 3],
        [0, 3],
      ],
      lit: [false, false],
      collected: [[], []],
      visited: [["0,3"], ["0,3"]],
      checkpoints: [
        [0, 3],
        [0, 3],
      ],
    };
  else if (r.stage === 2)
    r.adventure = {
      kind: "bridge",
      positions: [
        [0, 3],
        [0, 4],
      ],
      opened: [],
      horizontal: false,
    };
  else r.adventure = { kind: "stars", edge: 0, threads: [], picks: {} };
}
function advance(r, now) {
  r.step++;
  if (r.step >= COUNTS[r.stage]) {
    r.phase = r.practice
      ? "practice_complete"
      : r.stage === 3
        ? "victory"
        : "checkpoint";
    r.players.forEach((p) => (p.ready = false));
    if (r.phase === "victory")
      r.date = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(now * 1000));
  } else newPuzzle(r, now);
}
export function stop(r, now) {
  if (r.adventure?.kind === "plane") {
    r.adventure.steer = 0;
    r.adventure.steer_until = 0;
    r.adventure.last = now;
  }
}
export function pause(r, now) {
  r.paused = true;
  r.players.forEach((p) => (p.ready = false));
  stop(r, now);
}
function fire(a) {
  if (a.clock - a.shot_at >= 0.28) {
    a.bullets.push({ x: a.x + 45, y: a.y });
    a.shot_at = a.clock;
  }
}
function tick(r, now, dt) {
  const a = r.adventure;
  a.last = now;
  a.clock += dt;
  a.x += dt * (r.relaxed ? 48 : 66);
  if (now < a.steer_until)
    a.y = Math.max(35, Math.min(365, a.y + a.steer * dt * 180));
  if (r.practice) {
    fire(a);
    if (
      a.objects.some(
        (o) =>
          !o.gone &&
          0 < o.x - a.x &&
          o.x - a.x < 100 &&
          Math.abs(o.y - a.y) < 55,
      ) &&
      a.clock - a.shield_at >= 8
    ) {
      a.shield_at = a.clock;
      a.shield_until = a.clock + 2.8;
    }
  }
  for (const b of a.bullets) {
    const old = b.x;
    b.x += dt * 360;
    for (const o of a.objects) {
      if (
        o.kind === "rock" &&
        !o.gone &&
        old - 22 <= o.x &&
        o.x <= b.x + 22 &&
        Math.abs(b.y - o.y) < 35
      ) {
        o.gone = true;
        b.x = -1000;
        break;
      }
    }
  }
  a.bullets = a.bullets.filter((b) => a.x - 70 < b.x && b.x < a.x + 700);
  for (const s of a.stamps)
    if (Math.abs(s.x - a.x) < 35 && Math.abs(s.y - a.y) < 42) s.got = true;
  for (const o of a.objects) {
    if (
      !o.gone &&
      Math.abs(o.x - a.x) < 43 &&
      Math.abs(o.y - a.y) < (o.kind === "cloud" ? 53 : 36)
    ) {
      if (a.clock < a.shield_until) o.gone = true;
      else if (a.clock >= a.immune_until) {
        a.x = Math.max(Math.floor(a.x / 500) * 500, a.x - 100);
        a.immune_until = a.clock + 2.2;
        a.bumps++;
        r.feedback =
          "A little turbulence! Your letter is safe. Dodge clouds or ask for a shield.";
        break;
      }
    }
  }
  if (a.x >= a.length) {
    const collected = a.stamps.filter((s) => s.got).length;
    if (collected >= 3) {
      r.collected_stamps = (r.collected_stamps || 0) + collected;
      advance(r, now);
    } else {
      Object.assign(a, { x: 0, y: 200, running: false, steer: 0, bullets: [] });
      r.feedback = `Your letter needs three stamp seals. You have ${collected}; launch another pass to collect the rest. Collected seals stay saved.`;
    }
  }
}
// Requests advance elapsed server time in bounded substeps, never trusting a
// client position/score/time. Cold starts reload the same durable room clock.
export function synchronize(r, now) {
  if (r.phase !== "playing" || r.paused) return;
  if (!r.players.every((p) => online(p, now))) {
    pause(r, now);
    r.feedback =
      "Connection paused. Your progress is safe; both tap Ready when you return.";
    return;
  }
  if (r.stage !== 0 || !r.adventure.running) return;
  const a = r.adventure,
    elapsed = Math.max(0, now - a.last);
  if (elapsed > 2) {
    pause(r, now);
    r.feedback =
      "Connection paused. Your letter is safe; both tap Ready to continue.";
    return;
  }
  let t = a.last;
  while (
    t < now - 1e-7 &&
    r.adventure === a &&
    r.phase === "playing" &&
    a.running
  ) {
    const dt = Math.min(0.05, now - t);
    t += dt;
    tick(r, t, dt);
  }
}
export function apply(r, i, d, now) {
  const aid = typeof d.id === "string" ? d.id.slice(0, 80) : "";
  require(aid, "Action ID is required.");
  const id = r.players[i].id + ":" + aid;
  if (r.actions.includes(id)) return;
  const a = r.adventure,
    p = r.players[i],
    action = d.action;
  if (action === "chat" || (action === "heart" && r.phase === "victory")) {
    const text =
      action === "heart"
        ? "♥"
        : String(d.text ?? "")
            .trim()
            .slice(0, 240);
    if (text) r.messages.push({ name: p.name, text, id });
    r.messages = r.messages.slice(-30);
  } else if (action === "relaxed" && r.phase === "lobby")
    r.relaxed = d.value === true;
  else if (action === "pause" && r.phase === "playing") pause(r, now);
  else if (action === "ready") {
    require(r.players.length === 2, "Wait for your partner to join.");
    require(!["victory", "practice_complete"].includes(r.phase) &&
      !(r.phase === "playing" && !r.paused), "This round is already underway.");
    p.ready = true;
    if (r.practice) r.players[1].ready = true;
    if (r.players.every((x) => x.ready && online(x, now))) {
      if (r.paused) {
        r.paused = false;
        stop(r, now);
      } else {
        if (r.phase === "checkpoint") r.stage++;
        r.phase = "playing";
        r.step = 0;
        newPuzzle(r, now);
      }
      r.players.forEach((x) => (x.ready = false));
    }
  } else {
    require(r.phase === "playing" &&
      !r.paused, "Wait until both players are ready.");
    require(r.players.every((x) =>
      online(x, now),
    ), "Your partner is reconnecting.");
    require(d.epoch ===
      r.epoch, "The puzzle has moved on. Try your next move.");
    if (a.kind === "stars" && a.complete) {
      require(action ===
        "continue_stars", "Enjoy your constellation, then both choose Continue together.");
      a.continued[i] = true;
      if (a.continued.every(Boolean)) advance(r, now);
    } else if (action === "retry") {
      newPuzzle(r, now);
      r.feedback =
        "Fresh start for this puzzle. Your completed puzzles are safe.";
    } else if (a.kind === "plane") {
      const pilot = r.practice ? 0 : r.step % 2;
      if (["launch", "steer"].includes(action)) {
        require(i === pilot, "Your partner is the pilot for this flight.");
        if (action === "launch") {
          a.running = true;
          a.last = now;
        } else {
          require(Number.isInteger(d.value) &&
            [-1, 0, 1].includes(d.value), "Choose up, down, or neutral.");
          a.steer = d.value;
          a.steer_until = now + 0.7;
        }
      } else if (["fire", "shield"].includes(action)) {
        require(i !== pilot ||
          r.practice, "Your partner handles pellets and shields for this flight.");
        require(a.running, "Wait for the pilot to launch.");
        if (action === "fire") fire(a);
        else if (a.clock - a.shield_at >= 8) {
          a.shield_at = a.clock;
          a.shield_until = a.clock + 2.8;
        }
      } else throw new GameError("That control is not available in flight.");
    } else if (["garden", "bridge"].includes(a.kind)) {
      if (action === "turn_bridge" && a.kind === "bridge") {
        const b = bridgeLayout(r.step).bridge;
        require(b &&
          Math.hypot(a.positions[i][0] - b[0], a.positions[i][1] - b[1]) <=
            1, "Stand beside the rotating bridge first.");
        require(!includes(
          a.positions,
          b,
        ), "Wait until both players are off the rotating bridge.");
        a.horizontal = !a.horizontal;
      } else {
        require(action === "move" &&
          Object.hasOwn(
            DIRECTIONS,
            d.direction,
          ), "Choose a direction to walk.");
        const [dx, dy] = DIRECTIONS[d.direction],
          target = [a.positions[i][0] + dx, a.positions[i][1] + dy];
        if (a.kind === "garden") {
          const layout = gardenLayout(r.step, i);
          require(target.every(
            (v) => v >= 0 && v < 7,
          ), "That is the edge of the garden.");
          if (!includes(layout.path, target)) {
            a.positions[i] = [...a.checkpoints[i]];
            r.feedback =
              "A patch of thorns! Back to your last lantern. Ask your partner for the next turn.";
          } else {
            require(!same(target, layout.gate) ||
              a.lit[
                1 - i
              ], "Your partner must light their switch lantern to open this gate.");
            a.positions[i] = target;
            const key = target.join(",");
            if (!a.visited[i].includes(key)) a.visited[i].push(key);
            if (same(target, layout.switch)) {
              a.lit[i] = true;
              a.checkpoints[i] = [...target];
            }
            if (
              includes(layout.lights, target) &&
              !a.collected[i].includes(key)
            )
              a.collected[i].push(key);
            r.feedback = "";
            if (
              a.positions.every((c) => same(c, [6, 3])) &&
              a.collected.every(
                (c, j) => c.length === gardenLayout(r.step, j).lights.length,
              )
            )
              advance(r, now);
            else if (
              same(target, [6, 3]) &&
              a.collected[i].length < layout.lights.length
            )
              r.feedback =
                "Find both fireflies on your trail before meeting at the exit.";
          }
        } else {
          const layout = bridgeLayout(r.step);
          require(includes(
            layout.cells,
            target,
          ), "Water ahead. Find a path across the islands.");
          for (const g of layout.gates)
            require(!same(target, g.cell) ||
              a.opened.includes(g.label) ||
              same(
                a.positions[1 - i],
                g.plate,
              ), `Ask your partner to stand on pressure plate ${g.label}.`);
          require(!same(target, layout.bridge) ||
            a.horizontal, "Turn the nearby bridge to cross from left to right.");
          a.positions[i] = target;
          for (const g of layout.gates)
            if (same(target, g.lever) && !a.opened.includes(g.label)) {
              a.opened.push(g.label);
              r.feedback = `Gate ${g.label} is now latched open. Your partner can follow.`;
            }
          if (a.positions.every((c) => same(c, layout.exit))) advance(r, now);
        }
      }
    } else {
      require(action === "star" &&
        Number.isInteger(d.value) &&
        d.value >= 0 &&
        d.value < 8, "Choose a star on the chart.");
      a.picks[i] = d.value;
      if (Object.keys(a.picks).length === 2) {
        const shape = SHAPES[r.step],
          target = shape.path.slice(a.edge, a.edge + 2);
        if (a.picks[0] === target[0] && a.picks[1] === target[1]) {
          a.threads.push(target);
          a.edge++;
          a.picks = {};
          r.feedback = "";
          r.epoch++;
          if (a.edge === shape.path.length - 1) {
            (r.discoveries ??= []).push(shape.name);
            (r.constellations ??= []).push({
              name: shape.name,
              threads: clone(a.threads),
              points: STAR_POINTS,
            });
            a.complete = true;
            a.continued = [false, false];
          }
        } else {
          a.picks = {};
          r.feedback =
            "Not quite. Describe the row and position of the star on your clue. Finished threads stay.";
        }
      }
    }
  }
  r.actions.push(id);
  r.actions = r.actions.slice(-256);
}
function view(r, i) {
  const a = r.adventure;
  if (a.kind === "plane") {
    const result = Object.fromEntries(
      [
        "kind",
        "x",
        "y",
        "running",
        "bullets",
        "objects",
        "stamps",
        "bumps",
        "length",
        "clock",
      ].map((k) => [k, clone(a[k])]),
    );
    return {
      ...result,
      pilot: r.practice ? 0 : r.step % 2,
      shield: Math.max(0, a.shield_until - a.clock),
      shield_wait: Math.max(0, 8 - (a.clock - a.shield_at)),
      immune: a.clock < a.immune_until,
    };
  }
  if (a.kind === "garden") {
    const own = gardenLayout(r.step, i);
    return {
      kind: "garden",
      positions: clone(a.positions),
      lit: [...a.lit],
      collected: clone(a.collected),
      visited: [...a.visited[i]],
      gate: own.gate,
      switch: own.switch,
      lights: own.lights,
      partner_chart: gardenLayout(r.step, 1 - i),
      exit: [6, 3],
      width: 7,
      height: 7,
    };
  }
  if (a.kind === "bridge") return { ...clone(a), ...bridgeLayout(r.step) };
  const shape = SHAPES[r.step];
  if (a.complete)
    return {
      kind: "stars",
      edge: a.edge,
      total: shape.path.length - 1,
      threads: clone(a.threads),
      points: STAR_POINTS,
      complete: true,
      name: shape.name,
      continued: [...a.continued],
    };
  const target = shape.path.slice(a.edge, a.edge + 2);
  return {
    kind: "stars",
    edge: a.edge,
    total: shape.path.length - 1,
    threads: clone(a.threads),
    points: STAR_POINTS,
    names: STAR_NAMES,
    clue: STAR_HINTS[target[1 - i]],
    selected: a.picks[i] ?? null,
    partner_selected: Object.hasOwn(a.picks, 1 - i),
  };
}
export function snapshot(r, i, now) {
  const s = Object.fromEntries(
    [
      "code",
      "edition",
      "phase",
      "stage",
      "step",
      "epoch",
      "version",
      "paused",
      "relaxed",
      "distance",
      "placed",
      "feedback",
      "date",
      "practice",
    ].map((k) => [k, clone(r[k])]),
  );
  s.players = r.players.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    lat: p.lat,
    lon: p.lon,
    avatar: p.avatar,
    ready: p.ready,
    online: !!online(p, now),
    ...(p.bot ? { bot: true } : {}),
  }));
  Object.assign(s, {
    me: r.players[i].id,
    messages: clone(r.messages.slice(-30)),
    threads: [],
    selection: {},
    holding: [false, false],
    latched: [false, false],
    clue: null,
    discoveries: clone(r.discoveries || []),
    collected_stamps: r.collected_stamps || 0,
    constellations: clone(r.constellations || []),
  });
  if (r.phase === "playing") s.adventure = view(r, i);
  return s;
}
