import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const distRoot = join(repoRoot, "apps/share-site/dist");
const host = process.env.IK_SHARE_SITE_HOST ?? "127.0.0.1";
const port = Number(process.env.IK_SHARE_SITE_PORT ?? "4175");

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(port, host, () => {
    server.off("error", rejectListen);
    resolveListen();
  });
});

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Failed to start ImmersionKit share-site server.");
}

console.log(`ImmersionKit share site: http://${host}:${address.port}`);

async function handleRequest(request, response) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const candidatePath =
      safePath === "/" ? join(distRoot, "index.html") : join(distRoot, safePath);
    const resolvedPath = resolve(candidatePath);

    if (!resolvedPath.startsWith(resolve(distRoot))) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const fileStats = await stat(resolvedPath).catch(() => null);
    if (!fileStats?.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": cacheControlForPath(resolvedPath),
      "content-type": contentTypeForPath(resolvedPath)
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(resolvedPath).pipe(response);
  } catch (error) {
    console.error("Share-site request failed.", error);
    response.writeHead(500);
    response.end("Internal server error");
  }
}

function cacheControlForPath(path) {
  return path.includes("/assets/") || path.includes("/downloads/")
    ? "public, max-age=31536000, immutable"
    : "no-store";
}

function contentTypeForPath(path) {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}
