#!/usr/bin/env node
/**
 * Local Grok Bot / webhook bridge for Nori deskpet chat.
 *
 * Binds 127.0.0.1 only. POST /nori-chat never waits on the agent or outbox —
 * it writes inbox and returns a pending placeholder in milliseconds.
 *
 *   POST /nori-chat
 *     body: { text, sessionId? }
 *     writes .nori-chat/inbox/<id>.json
 *     optional fire-and-forget wake POST to .nori-chat/webhook.url
 *       (Authorization from .nori-chat/webhook.auth)
 *     200 { id, pending: true, say: "……", emotion: "shy", intensity: 0.35 }
 *
 *   GET /nori-chat/result/:id
 *     if .nori-chat/outbox/<id>.json exists: return JSON, then delete
 *     else: 200 { id, pending: true }
 *
 *   GET /health → { ok: true }
 *
 * Env: NORI_CHAT_PORT (default 3937), NORI_CHAT_DIR (default ./.nori-chat)
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_PORT = 3937;
const HOST = "127.0.0.1";
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const BODY_LIMIT = 64 * 1024;

const PENDING_PLACEHOLDER = {
  say: "……",
  emotion: "shy",
  intensity: 0.35,
};

function ensureDirs(root) {
  fs.mkdirSync(path.join(root, "inbox"), { recursive: true });
  fs.mkdirSync(path.join(root, "outbox"), { recursive: true });
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("too large"), { code: "PAYLOAD_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Wake the agent. Must not delay the HTTP response. */
function wakeWebhook(root, payload) {
  const url = readTextIfExists(path.join(root, "webhook.url"));
  if (!url || !/^https?:\/\//i.test(url)) return;
  const auth = readTextIfExists(path.join(root, "webhook.auth"));
  const headers = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

async function handleChatPost(req, res, root) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (error) {
    if (error && error.code === "PAYLOAD_TOO_LARGE") {
      sendJson(res, 413, { error: "payload too large" });
      return;
    }
    sendJson(res, 400, { error: "invalid body" });
    return;
  }

  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    sendJson(res, 400, { error: "invalid json" });
    return;
  }

  const text = data && typeof data.text === "string" ? data.text.trim() : "";
  if (!text) {
    sendJson(res, 400, { error: "text required" });
    return;
  }

  const sessionId =
    data && typeof data.sessionId === "string" ? data.sessionId.trim().slice(0, 128) : "";
  const id = randomUUID();
  const inbox = {
    id,
    text: text.slice(0, 2000),
    ts: Date.now(),
  };
  if (sessionId) inbox.sessionId = sessionId;

  ensureDirs(root);
  fs.writeFileSync(path.join(root, "inbox", `${id}.json`), `${JSON.stringify(inbox, null, 2)}\n`);
  wakeWebhook(root, inbox);
  sendJson(res, 200, { id, pending: true, ...PENDING_PLACEHOLDER });
}

function handleResultGet(res, root, id) {
  if (!ID_RE.test(id)) {
    sendJson(res, 400, { error: "invalid id" });
    return;
  }
  const file = path.join(root, "outbox", `${id}.json`);
  if (!fs.existsSync(file)) {
    sendJson(res, 200, { id, pending: true });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    sendJson(res, 200, { id, pending: true });
    return;
  }

  try {
    fs.unlinkSync(file);
  } catch {
    // still return the payload
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    sendJson(res, 200, { id, pending: true });
    return;
  }

  // Presence of the outbox file means the turn is done. Do not echo pending.
  const out = { ...parsed };
  delete out.pending;
  sendJson(res, 200, out);
}

function pathnameOf(req) {
  try {
    return new URL(req.url || "/", `http://${HOST}`).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function createBridge(options = {}) {
  const root = path.resolve(options.dir || path.join(process.cwd(), ".nori-chat"));
  ensureDirs(root);

  const server = http.createServer((req, res) => {
    const method = (req.method || "GET").toUpperCase();
    const pathname = pathnameOf(req);

    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (method === "POST" && pathname === "/nori-chat") {
      void handleChatPost(req, res, root);
      return;
    }
    const result = pathname.match(/^\/nori-chat\/result\/([^/]+)$/);
    if (method === "GET" && result) {
      handleResultGet(res, root, decodeURIComponent(result[1]));
      return;
    }
    sendJson(res, 404, { error: "not found" });
  });

  return {
    root,
    server,
    listen(port = options.port ?? DEFAULT_PORT, host = options.host ?? HOST) {
      return new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(port, host, () => {
          server.removeListener("error", onError);
          const addr = server.address();
          const bound = typeof addr === "object" && addr ? addr.port : port;
          resolve({
            host,
            port: bound,
            root,
            url: `http://${host}:${bound}`,
            close: () =>
              new Promise((done, fail) => {
                server.close((error) => (error ? fail(error) : done()));
              }),
          });
        });
      });
    },
  };
}

module.exports = {
  DEFAULT_PORT,
  HOST,
  PENDING_PLACEHOLDER,
  createBridge,
};

if (require.main === module) {
  const port = Number(process.env.NORI_CHAT_PORT || DEFAULT_PORT);
  const dir = process.env.NORI_CHAT_DIR || path.join(process.cwd(), ".nori-chat");
  createBridge({ dir })
    .listen(Number.isFinite(port) ? port : DEFAULT_PORT)
    .then((handle) => {
      console.log(`Nori Grok Bot bridge: ${handle.url}`);
      console.log("  POST /nori-chat              write inbox, return pending (no outbox wait)");
      console.log("  GET  /nori-chat/result/:id   outbox JSON then delete, or { pending: true }");
      console.log("  GET  /health");
      console.log(`dir: ${handle.root}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
