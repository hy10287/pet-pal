import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, normalize, relative } from "node:path";
import {
  fileUrlIfExists,
  loadAppConfig,
  loadMotionCatalog,
  resolveRepoPath,
} from "./config";
import type { BootstrapPayload } from "../shared/types";

const ROOT = join(__dirname, "../..");
const DIST = join(__dirname, "..");
const PORT = Number(process.env.NORI_PREVIEW_PORT || 43187);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".map": "application/json",
};

function resolveCubismFile(root: string, configuredPath: string): string {
  const vendor = join(root, "vendor", "live2dcubismcore.min.js");
  if (existsSync(vendor)) return vendor;
  return resolveRepoPath(root, configuredPath);
}

async function proxyGrokBot(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    res.writeHead(405, { allow: "POST", "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "use POST JSON" }));
    return;
  }
  const { config } = loadAppConfig(ROOT);
  const target = config.chat.grokBotUrl;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(config.chat.timeoutMs),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    });
    res.end(text);
  } catch {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "grok bot unreachable" }));
  }
}

function bootstrap(): BootstrapPayload {
  const { config } = loadAppConfig(ROOT);
  const cubism = resolveCubismFile(ROOT, config.cubismCorePath);
  const model = resolveRepoPath(ROOT, config.modelPath);
  const motions = resolveRepoPath(ROOT, config.motionsDir);
  return {
    config,
    catalog: loadMotionCatalog(ROOT, config),
    cubismCoreUrl: cubism && existsSync(cubism) ? `/vendor/${basename(cubism)}` : fileUrlIfExists(cubism),
    modelUrl: model && existsSync(model) ? `/model/${basename(model)}` : null,
    motionsBaseUrl: motions && existsSync(motions) ? "/motions" : null,
    isElectron: false,
    preview: true,
  };
}

/** Reject path traversal: joined target must stay under base. */
function safeJoin(base: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split("?")[0] ?? "");
  const target = normalize(join(base, decoded.replace(/^\/+/, "")));
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return target;
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  if (url.startsWith("/api/bootstrap")) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(bootstrap()));
    return;
  }

  // Browser preview is cross-origin to grokBotUrl; Electron posts directly.
  if (url.startsWith("/api/grok-bot")) {
    void proxyGrokBot(req, res);
    return;
  }

  if (url === "/" || url.startsWith("/index.html") || url.startsWith("/pet.html")) {
    const htmlPath = join(DIST, "renderer", "pet.html");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(htmlPath));
    return;
  }

  if (url.startsWith("/motions/")) {
    const { config } = loadAppConfig(ROOT);
    const motionsDir = resolveRepoPath(ROOT, config.motionsDir);
    if (motionsDir && existsSync(motionsDir)) {
      const rel = decodeURIComponent(url.slice("/motions/".length).split("?")[0] ?? "");
      const file = safeJoin(motionsDir, rel);
      if (file && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(readFileSync(file));
        return;
      }
    }
  }

  const vendorName = url.match(/^\/vendor\/([^/?]+)/)?.[1];
  if (vendorName) {
    const file = safeJoin(join(ROOT, "vendor"), basename(vendorName));
    if (file && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(readFileSync(file));
      return;
    }
  }

  const rel = url.replace(/^\//, "");
  const candidates = [
    safeJoin(join(DIST, "renderer"), rel.replace(/^renderer\//, "")),
    safeJoin(DIST, rel),
    safeJoin(ROOT, rel),
  ].filter((value): value is string => Boolean(value));

  for (const file of candidates) {
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Nori preview: http://127.0.0.1:${PORT}`);
  console.log("Fallback actor is used until Cubism Core + a local Sample model path are configured.");
});
