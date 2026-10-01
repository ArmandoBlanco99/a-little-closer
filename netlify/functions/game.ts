import { getStore } from "@netlify/blobs";
import { createHandler } from "../../a-little-closer/netlify/game-service.js";

// Netlify supplies site credentials automatically. This is a site-wide store,
// so publishing a new version does not discard existing rooms.
export default async (request: Request, context: { ip?: string }) => {
  const store = getStore({
    name: "a-little-closer-rooms",
    consistency: "strong",
  });
  return createHandler(store)(request, context);
};
