import { createHandler } from "../../a-little-closer/netlify/game-service.js";
export class MemoryStore {
  entries = new Map();
  sequence = 0;
  conflicts = 0;
  async getWithMetadata(key, options) {
    if (options.consistency !== "strong") throw Error("Strong reads required");
    return structuredClone(this.entries.get(key) ?? null);
  }
  async setJSON(key, data, options) {
    const old = this.entries.get(key);
    if (this.conflicts > 0) {
      this.conflicts--;
      return { modified: false };
    }
    if (options.onlyIfNew ? !!old : !old || old.etag !== options.onlyIfMatch)
      return { modified: false };
    this.entries.set(key, {
      data: structuredClone(data),
      etag: String(++this.sequence),
    });
    return { modified: true };
  }
}
export const people = [
  {
    name: "María 東京",
    city: "Mexico City, Mexico",
    lat: 19.4326,
    lon: -99.1332,
    avatar: "fox",
  },
  {
    name: "François",
    city: "Madrid, Spain",
    lat: 40.4168,
    lon: -3.7038,
    avatar: "rabbit",
  },
];
export function harness(store = new MemoryStore()) {
  const h = { store, now: 1800000000, serial: 0, seats: [] };
  h.resetHandler = () => {
    h.handler = createHandler(store, {
      clock: () => h.now,
      retryDelay: async () => {},
    });
  };
  h.resetHandler();
  h.call = async (op, data = {}, seat = null, context = {}) => {
    const response = await h.handler(
      new Request("https://closer.example/.netlify/functions/game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(seat ? { Authorization: "Bearer " + seat.token } : {}),
        },
        body: JSON.stringify({ code: seat?.code, ...data, op }),
      }),
      context,
    );
    return { status: response.status, body: await response.json() };
  };
  h.ok = async (...args) => {
    const result = await h.call(...args);
    if (result.status !== 200) throw Error(JSON.stringify(result));
    return result.body;
  };
  h.start = async (practice) => {
    h.seats = [await h.ok("create", { ...people[0], practice })];
    if (!practice)
      h.seats.push(await h.ok("join", { ...people[1], code: h.seats[0].code }));
  };
  h.state = (i = 0) => h.ok("state", {}, h.seats[i]);
  h.action = async (i, action, extra = {}) =>
    h.ok(
      "action",
      {
        action,
        id: "action-" + ++h.serial,
        epoch: (await h.state(i)).epoch,
        ...extra,
      },
      h.seats[i],
    );
  h.ready = async () => {
    for (let i = 0; i < h.seats.length; i++) await h.action(i, "ready");
  };
  h.room = () =>
    structuredClone(store.entries.get("rooms/" + h.seats[0].code).data);
  return h;
}
