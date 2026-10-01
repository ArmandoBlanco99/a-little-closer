import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { packagedRuntime, requestFromNode, sendResponse } from "./runtime.mjs";

const [port, directory] = process.argv.slice(2);
if (!port || !directory)
  throw Error("Test port and disposable data directory are required");
const runtime = await packagedRuntime(directory);
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".geojson": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/.netlify/functions/game") {
      const request = await requestFromNode(req, `http://127.0.0.1:${port}`);
      await sendResponse(
        res,
        await runtime.handler(request, { ip: "local-browser-test" }),
      );
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://local").pathname,
    );
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
    });
    res.end(await readFile(path));
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(Number(port), "127.0.0.1", () =>
  console.log("Local packaged function test server ready"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await runtime.close();
    process.exit(0);
  });
