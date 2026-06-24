import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const port = Number(process.env.PORT ?? 4173);

loadDotEnv();

const proxyTargets = [
  {
    prefix: "/api/minswap-pool",
    target: "https://api-mainnet-prod.minswap.org",
    rewrite: (path) => path.replace(/^\/api\/minswap-pool/, ""),
  },
  {
    prefix: "/api/steelswap",
    target: "https://api.steelswap.io",
    rewrite: (path) => path.replace(/^\/api\/steelswap/, ""),
    headers: steelswapHeaders,
  },
  {
    prefix: "/api/cardexscan",
    target: process.env.CARDEXSCAN_API_BASE_URL ?? "https://cardexscan.com/api/cds",
    rewrite: (path) => path.replace(/^\/api\/cardexscan/, ""),
    headers: () => optionalHeader("CARDEXSCAN_API_KEY", "x-api-key"),
  },
  {
    prefix: "/api/saturnswap",
    target: "https://api.saturnswap.io",
    rewrite: (path) => path.replace(/^\/api\/saturnswap/, ""),
    headers: () => optionalHeader("SATURN_API_KEY", "SATURN_API_KEY"),
  },
  {
    prefix: "/api/wingriders",
    target: "https://api.mainnet.wingriders.com",
    rewrite: (path) => path.replace(/^\/api\/wingriders/, ""),
  },
  {
    prefix: "/api/maestro/mainnet",
    target: "https://mainnet.gomaestro-api.org/v1",
    rewrite: (path) => path.replace(/^\/api\/maestro\/mainnet/, ""),
    headers: () => maestroHeaders("MAESTRO_MAINNET_API_KEY"),
  },
  {
    prefix: "/api/maestro/preprod",
    target: "https://preprod.gomaestro-api.org/v1",
    rewrite: (path) => path.replace(/^\/api\/maestro\/preprod/, ""),
    headers: () => maestroHeaders("MAESTRO_PREPROD_API_KEY"),
  },
  {
    prefix: "/api/maestro/preview",
    target: "https://preview.gomaestro-api.org/v1",
    rewrite: (path) => path.replace(/^\/api\/maestro\/preview/, ""),
    headers: () => maestroHeaders("MAESTRO_PREVIEW_API_KEY"),
  },
  {
    prefix: "/api/blockfrost/mainnet",
    target: "https://cardano-mainnet.blockfrost.io/api/v0",
    rewrite: (path) => path.replace(/^\/api\/blockfrost\/mainnet/, ""),
    headers: () => blockfrostHeaders("BLOCKFROST_MAINNET_PROJECT_ID"),
  },
  {
    prefix: "/api/blockfrost/preprod",
    target: "https://cardano-preprod.blockfrost.io/api/v0",
    rewrite: (path) => path.replace(/^\/api\/blockfrost\/preprod/, ""),
    headers: () => blockfrostHeaders("BLOCKFROST_PREPROD_PROJECT_ID"),
  },
  {
    prefix: "/api/blockfrost/preview",
    target: "https://cardano-preview.blockfrost.io/api/v0",
    rewrite: (path) => path.replace(/^\/api\/blockfrost\/preview/, ""),
    headers: () => blockfrostHeaders("BLOCKFROST_PREVIEW_PROJECT_ID"),
  },
];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const target = proxyTargets.find((entry) => url.pathname.startsWith(entry.prefix));
    if (target) {
      await proxyRequest(req, res, target, url);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`ClearRoute server listening on http://127.0.0.1:${port}/`);
});

function loadDotEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function blockfrostHeaders(envKey) {
  const projectId = process.env[envKey];
  return projectId ? { project_id: projectId } : {};
}

function maestroHeaders(envKey) {
  const apiKey = process.env[envKey];
  return apiKey ? { "api-key": apiKey } : {};
}

function optionalHeader(envKey, headerName) {
  const value = process.env[envKey];
  return value ? { [headerName]: value } : {};
}

function steelswapHeaders() {
  return {
    origin: "https://steelswap.io",
    referer: "https://steelswap.io/",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
}

async function proxyRequest(req, res, target, url) {
  const rewrittenPath = target.rewrite(url.pathname);
  const upstreamUrl = new URL(`${target.target}${rewrittenPath}${url.search}`);
  const headers = new Headers(target.headers?.() ?? {});
  const contentType = req.headers["content-type"];
  const accept = req.headers.accept;
  const token = req.headers.token;
  if (contentType) headers.set("content-type", Array.isArray(contentType) ? contentType[0] : contentType);
  if (accept) headers.set("accept", Array.isArray(accept) ? accept[0] : accept);
  if (token) headers.set("token", Array.isArray(token) ? token[0] : token);

  let response;
  try {
    response = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
      duplex: "half",
    });
  } catch (error) {
    console.error(`Proxy request failed for ${upstreamUrl.href}`, error);
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "bad_gateway", message: "Upstream request failed." }));
    return;
  }

  res.writeHead(response.status, {
    "content-type": response.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": response.headers.get("cache-control") ?? "no-store",
  });
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

async function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(distDir, safePath);
  if (!existsSync(filePath)) filePath = join(distDir, "index.html");
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end();
    return;
  }

  res.writeHead(200, { "content-type": contentTypeFor(filePath) });
  createReadStream(filePath).pipe(res);
}

function contentTypeFor(path) {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
