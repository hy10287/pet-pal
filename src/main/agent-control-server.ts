import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import {
  AGENT_CONTROL_BODY_LIMIT,
  AGENT_CONTROL_HOST,
  type AgentControlRequest,
  type AgentControlResponse,
  type AgentPlayedSummary,
  hasValidControlToken,
  isAllowedOrigin,
  isLoopbackRemoteAddress,
  parseAgentControlRequest,
  resolveControlBind,
} from "../shared/agent-control";

export interface AgentControlServerOptions {
  port?: number;
  env?: NodeJS.ProcessEnv;
  onIntent: (
    req: AgentControlRequest,
  ) => Promise<AgentPlayedSummary | undefined> | AgentPlayedSummary | undefined;
}

export interface AgentControlHandle {
  host: typeof AGENT_CONTROL_HOST;
  port: number;
  url: string;
  close: () => Promise<void>;
}

const RATE_LIMIT_PER_SECOND = 20;
let rateWindowStart = 0;
let rateWindowCount = 0;

/** 每秒最多 20 次；超出返回 false。测试可通过导出 resetRateLimit() 复位。 */
export function takeRateLimitSlot(now = Date.now()): boolean {
  if (now - rateWindowStart >= 1000) {
    rateWindowStart = now;
    rateWindowCount = 0;
  }
  if (rateWindowCount >= RATE_LIMIT_PER_SECOND) return false;
  rateWindowCount += 1;
  return true;
}

export function resetRateLimit(): void {
  rateWindowStart = 0;
  rateWindowCount = 0;
}

/**
 * Localhost agent bridge (v1).
 *
 * Binds 127.0.0.1 only. Origin + optional NORI_CONTROL_TOKEN gate the HTTP/WS
 * surface. Do not publish or port-forward this.
 */
export function startAgentControlServer(options: AgentControlServerOptions): Promise<AgentControlHandle> {
  const bind = resolveControlBind({ port: options.port, env: options.env });
  const sockets = new Set<Socket>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: AGENT_CONTROL_BODY_LIMIT,
    perMessageDeflate: false,
  });

  const server = createServer((req, res) => {
    void handleHttp(req, res, options.onIntent);
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  server.on("upgrade", (req, socket, head) => {
    const path = pathname(req.url ?? "/");
    if (!isIntentPath(path)) return rejectUpgrade(socket, 404, "not found");
    if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) return rejectUpgrade(socket, 403, "loopback only");
    if (!isAllowedOrigin(req.headers.origin)) return rejectUpgrade(socket, 403, "origin not allowed");
    if (!hasValidControlToken(req.headers["x-nori-token"], new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("token"))) {
      return rejectUpgrade(socket, 403, "invalid token");
    }
    if (String(req.headers["sec-websocket-version"] ?? "") !== "13") {
      socket.write("HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("error", () => ws.terminate());
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        ws.close(1003);
        return;
      }
      void (async () => {
        if (!takeRateLimitSlot()) {
          ws.send(JSON.stringify({ ok: false, error: "rate limited" }));
          return;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(String(data));
        } catch {
          ws.send(JSON.stringify({ ok: false, error: "body must be valid JSON" }));
          return;
        }
        const result = await dispatchIntent(raw, options.onIntent);
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(result.body));
      })();
    });
  });

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(bind.port, bind.host, () => {
      server.removeListener("error", onError);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : bind.port;
      resolve({
        host: AGENT_CONTROL_HOST,
        port,
        url: `http://${AGENT_CONTROL_HOST}:${port}/intent`,
        close: () => closeServer(server, sockets, wss),
      });
    });
  });
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function closeServer(server: Server, sockets: Set<Socket>, wss: WebSocketServer): Promise<void> {
  for (const client of wss.clients) client.terminate();
  return new Promise((resolve, reject) => {
    wss.close(() => {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown, headOnly = false): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(headOnly ? undefined : payload);
}

function healthBody(req: IncomingMessage): Record<string, unknown> {
  const addr = req.socket.localPort;
  return {
    ok: true,
    service: "nori-agent-control",
    bind: `${AGENT_CONTROL_HOST}:${addr ?? "?"}`,
    methods: ["POST"],
    body: {
      emotion: "string",
      intensity: "0..1",
      say: "string?",
      motionHint: "string?",
      variant: "string?",
      source: "string?",
    },
  };
}

function pathname(url: string): string {
  const path = (url.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  return path;
}

function isIntentPath(path: string): boolean {
  return path === "/" || path === "/intent" || path === "/command";
}

function isHealthPath(path: string): boolean {
  return path === "/" || path === "/health" || path === "/intent";
}

function isJsonContentType(value?: string): boolean {
  if (!value) return false;
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mime === "application/json" || mime.endsWith("+json");
}

function readBody(req: IncomingMessage, limit = AGENT_CONTROL_BODY_LIMIT): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.removeAllListeners("data");
        req.resume();
        reject(new Error("payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function dispatchIntent(
  raw: unknown,
  onIntent: AgentControlServerOptions["onIntent"],
): Promise<{ status: number; body: AgentControlResponse }> {
  const parsed = parseAgentControlRequest(raw);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } };
  try {
    const played = await onIntent(parsed.value);
    const body: AgentControlResponse = { ok: true };
    if (played) body.played = played;
    return { status: 200, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : "intent failed";
    const status = /not ready/i.test(message) ? 503 : /timeout/i.test(message) ? 504 : 500;
    return { status, body: { ok: false, error: message } };
  }
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  onIntent: AgentControlServerOptions["onIntent"],
): Promise<void> {
  const headOnly = req.method === "HEAD";
  if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
    writeJson(res, 403, { ok: false, error: "loopback only" }, headOnly);
    return;
  }

  const path = pathname(req.url ?? "/");
  const method = (req.method ?? "GET").toUpperCase();

  if ((method === "GET" || method === "HEAD") && isHealthPath(path)) {
    writeJson(res, 200, healthBody(req), headOnly);
    return;
  }

  if (!isIntentPath(path)) {
    writeJson(res, 404, { ok: false, error: "not found" }, headOnly);
    return;
  }

  if (method !== "POST") {
    res.setHeader("allow", "POST, GET");
    writeJson(res, 405, { ok: false, error: "use POST JSON" }, headOnly);
    return;
  }

  if (!isAllowedOrigin(req.headers.origin)) {
    writeJson(res, 403, { ok: false, error: "origin not allowed" }, headOnly);
    return;
  }
  if (!hasValidControlToken(req.headers["x-nori-token"], new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("token"))) {
    writeJson(res, 403, { ok: false, error: "invalid token" }, headOnly);
    return;
  }

  if (!isJsonContentType(req.headers["content-type"])) {
    writeJson(res, 415, { ok: false, error: "content-type must be application/json" }, headOnly);
    return;
  }

  let text: string;
  try {
    text = await readBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid body";
    writeJson(res, message === "payload too large" ? 413 : 400, { ok: false, error: message }, headOnly);
    return;
  }

  let raw: unknown;
  try {
    raw = text.trim() ? JSON.parse(text) : null;
  } catch {
    writeJson(res, 400, { ok: false, error: "body must be valid JSON" }, headOnly);
    return;
  }

  if (!takeRateLimitSlot()) {
    writeJson(res, 429, { ok: false, error: "rate limited" }, headOnly);
    return;
  }

  const result = await dispatchIntent(raw, onIntent);
  writeJson(res, result.status, result.body, headOnly);
}

export function newIntentRequestId(): string {
  return randomUUID();
}
