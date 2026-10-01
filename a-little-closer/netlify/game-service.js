import { randomInt, createHash } from "node:crypto";
import {
  GameError,
  createRoom,
  profile,
  distance,
  session,
  authenticate,
  synchronize,
  apply,
  snapshot,
  pause,
} from "./game-rules.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ATTEMPTS = 12;
const ROOM_LIFETIME = 24 * 60 * 60;
const reply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new GameError("Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new GameError("A request body is required.");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 8192) {
        await reader.cancel();
        throw new GameError("That request is too large.", 413);
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("object required");
    return data;
  } catch (error) {
    if (error instanceof GameError) throw error;
    throw new GameError("The request is not valid JSON.");
  } finally {
    reader.releaseLock();
  }
}

// Each attempt reads a strongly consistent version and conditionally replaces
// exactly that version. A conflicting move is re-evaluated, never overwritten.
export function createHandler(
  store,
  { clock = () => Date.now() / 1000, retryDelay = wait } = {},
) {
  const read = async (key) => {
    const entry = await store.getWithMetadata(key, {
      type: "json",
      consistency: "strong",
    });
    // An absent ETag would silently turn onlyIfMatch into an unconditional write.
    if (entry && !entry.etag)
      throw new Error("Storage did not return a version");
    return entry;
  };
  const contention = () =>
    new GameError(
      "Your partner is moving too. Please try that move again.",
      503,
    );

  async function admission(ip) {
    if (!ip) return; // Local tests can omit Context; Netlify supplies the real IP.
    const key = "admission/" + createHash("sha256").update(ip).digest("hex");
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const old = await read(key),
        now = clock();
      const data =
        old && now - old.data.start < 60 ? old.data : { start: now, count: 0 };
      if (data.count >= 30)
        throw new GameError(
          "Please wait a minute before creating or joining another room.",
          429,
        );
      data.count++;
      const result = await store.setJSON(
        key,
        data,
        old ? { onlyIfMatch: old.etag } : { onlyIfNew: true },
      );
      if (result.modified) return;
      await retryDelay(5 + attempt * 3);
    }
    throw contention();
  }

  async function handle(request, context) {
    if (request.method !== "POST")
      return reply({ error: "Use POST for game requests." }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new GameError("Open the game on its own website.", 403);
    const data = await readBody(request);
    if (!["create", "join", "state", "action", "leave"].includes(data.op))
      throw new GameError("Unknown game operation.");
    if (data.op === "create" || data.op === "join") await admission(context.ip);
    if (data.op === "create") {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = Array.from(
          { length: 6 },
          () => ALPHABET[randomInt(ALPHABET.length)],
        ).join("");
        const room = createRoom(code, data, clock());
        const result = await store.setJSON("rooms/" + code, room, {
          onlyIfNew: true,
        });
        if (result.modified) return reply(session(room, 0));
      }
      throw contention();
    }
    const code =
      typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
    if (code.length !== 6 || [...code].some((c) => !ALPHABET.includes(c)))
      throw new GameError("Enter the six-character room code.");
    const key = "rooms/" + code;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const old = await read(key),
        now = clock();
      if (!old || old.data.expired)
        throw new GameError("That room was not found or has expired.", 404);
      if (now - old.data.updated > ROOM_LIFETIME) {
        // Erase personal fields on the next access; a tombstone avoids races
        // with another request trying to update or recreate this room.
        const erased = await store.setJSON(
          key,
          { expired: true },
          { onlyIfMatch: old.etag },
        );
        if (!erased.modified) continue;
        throw new GameError(
          "This room expired after 24 hours without activity. Create a new journey.",
          410,
        );
      }
      let room = structuredClone(old.data),
        player,
        actionError;
      if (data.op === "join") {
        if (room.players.length >= 2 || room.practice)
          throw new GameError("This room already has two players.");
        room.players.push(profile(data, now));
        room.distance = distance(...room.players);
        player = 1;
      } else {
        try {
          player = authenticate(
            room,
            request.headers.get("authorization")?.replace(/^Bearer /, ""),
          );
        } catch {
          throw new GameError(
            "Your player session is not valid for this room.",
            403,
          );
        }
        synchronize(room, now);
        if (data.op === "leave") {
          room.players[player].seen = 0;
          if (room.phase === "playing") pause(room, now);
        } else {
          if (now - room.players[player].seen >= 1)
            room.players[player].seen = now;
          if (data.op === "action") {
            const candidate = structuredClone(room);
            try {
              apply(candidate, player, data, now);
              room = candidate;
            } catch (error) {
              if (!(error instanceof GameError)) throw error;
              actionError = error;
            }
          }
        }
      }
      if (JSON.stringify(room) !== JSON.stringify(old.data)) {
        room.updated = now;
        room.version++;
        const result = await store.setJSON(key, room, {
          onlyIfMatch: old.etag,
        });
        if (!result.modified) {
          await retryDelay(5 + attempt * 3 + randomInt(8));
          continue;
        }
      }
      if (actionError) throw actionError;
      return reply(
        data.op === "join"
          ? session(room, player)
          : snapshot(room, player, now),
      );
    }
    throw contention();
  }
  return async (request, context = {}) => {
    try {
      return await handle(request, context);
    } catch (error) {
      // Never expose storage errors, tokens, stack traces, or room internals.
      return reply(
        {
          error:
            error instanceof GameError
              ? error.message
              : "The connection is taking a moment. Your progress is saved; try again.",
        },
        error instanceof GameError ? error.status : 503,
      );
    }
  };
}
