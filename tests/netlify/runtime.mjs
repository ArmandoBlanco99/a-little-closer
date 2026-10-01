// Local verification only: real packaged function + official Blobs SDK/server.
// The SDK filesystem emulator does not lock its read/check/write sequence.
// It also omits GET ETags; obtain those from its listing response below.
// Serialize individual storage HTTP operations to model production atomic CAS;
// game requests still run concurrently and must handle version conflicts.
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { unzipSync } from "fflate";

export async function requestFromNode(req, origin) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new Request(origin + req.url, {
    method: req.method,
    headers: req.headers,
    ...(["GET", "HEAD"].includes(req.method)
      ? {}
      : { body: Buffer.concat(chunks) }),
  });
}
export async function sendResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}
export async function packagedRuntime(directory) {
  const extracted = resolve(directory, "function");
  const files = unzipSync(
    await readFile(".netlify/packaged-functions/game.zip"),
  );
  for (const [name, bytes] of Object.entries(files)) {
    const path = resolve(extracted, name);
    if (!path.startsWith(extracted + sep))
      throw Error("Archive path escapes function directory");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  const token = randomBytes(32).toString("hex");
  const blobs = new BlobsServer({
    directory: resolve(directory, "blobs"),
    token,
    logger: () => {},
  });
  const address = await blobs.start();
  let queue = Promise.resolve();
  const proxy = createServer((req, res) => {
    const run = async () => {
      const request = await requestFromNode(
        req,
        `http://127.0.0.1:${address.port}`,
      );
      let response = await fetch(request);
      if (
        request.method === "GET" &&
        response.ok &&
        !response.headers.has("etag")
      ) {
        const url = new URL(request.url),
          parts = url.pathname.split("/").filter(Boolean);
        const key = parts.slice(2).join("/");
        const listingURL = new URL(
          "/" + parts.slice(0, 2).join("/"),
          request.url,
        );
        listingURL.searchParams.set("prefix", key);
        const listing = await fetch(listingURL, {
          headers: request.headers,
        }).then((r) => r.json());
        const etag = listing.blobs?.find((blob) => blob.key === key)?.etag;
        if (!etag) throw Error("Test emulator did not return a blob version");
        const headers = new Headers(response.headers);
        headers.set("etag", etag);
        response = new Response(response.body, {
          status: response.status,
          headers,
        });
      }
      await sendResponse(res, response);
    };
    queue = queue.then(run, run).catch((error) => {
      console.error("Local emulator:", error.message);
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const edgeURL = `http://127.0.0.1:${proxy.address().port}`;
  setEnvironmentContext({
    edgeURL,
    uncachedEdgeURL: edgeURL,
    siteID: "local-test-site",
    token,
  });
  const module = await import(
    pathToFileURL(resolve(extracted, "netlify/functions/game.mjs")).href
  );
  return {
    handler: module.default,
    close: async () => {
      await new Promise((resolve) => proxy.close(resolve));
      await blobs.stop();
    },
  };
}
