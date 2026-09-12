import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import {
  AGENT_CONTROL_BODY_LIMIT,
  AGENT_CONTROL_HOST,
  type AgentControlRequest,
  type AgentControlResponse,
  type AgentPlayedSummary,
  isLoopbackRemoteAddress,
  parseAgentControlRequest,
  resolveControlBind,
} from "../shared/agent-control";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

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

/**
 * Localhost agent bridge (v1).
 *
 * Binds 127.0.0.1 only. No auth — any process (or a page that can POST JSON
 * to loopback) can drive MotionDirector. Do not publish or port-forward this.
 */
export function startAgentControlServer(options: AgentControlServerOptions): Promise<AgentControlHandle> {
  const bind = resolveControlBind({ port: options.port, env: options.env });
  const sockets = new Set<Socket>();

  const server = createServer((req, res) => {
    void handleHttp(req, res, options.onIntent);
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  server.on("upgrade", (req, socket) => {
    void handleUpgrade(req, socket, options.onIntent);
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
        close: () => closeServer(server, sockets),
      });
    });
  });
}

function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) {
    socket.destroy();
  }
  sockets.clear();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
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
        req.destroy();
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
    const status = /not ready/i.test(message) ? 503 : 500;
    return { status, body: { ok: false, error: message } };
  }
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  onIntent: AgentControlServerOptions["onIntent"],
): Promise<void> {
  if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
    writeJson(res, 403, { ok: false, error: "loopback only" });
    return;
  }

  const path = pathname(req.url ?? "/");
  const method = (req.method ?? "GET").toUpperCase();

  if ((method === "GET" || method === "HEAD") && isHealthPath(path)) {
    writeJson(res, 200, healthBody(req));
    return;
  }

  if (!isIntentPath(path)) {
    writeJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  if (method !== "POST") {
    res.setHeader("allow", "POST, GET");
    writeJson(res, 405, { ok: false, error: "use POST JSON" });
    return;
  }

  if (!isJsonContentType(req.headers["content-type"])) {
    writeJson(res, 415, { ok: false, error: "content-type must be application/json" });
    return;
  }

  let text: string;
  try {
    text = await readBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid body";
    writeJson(res, message === "payload too large" ? 413 : 400, { ok: false, error: message });
    return;
  }

  let raw: unknown;
  try {
    raw = text.trim() ? JSON.parse(text) : null;
  } catch {
    writeJson(res, 400, { ok: false, error: "body must be valid JSON" });
    return;
  }

  const result = await dispatchIntent(raw, onIntent);
  writeJson(res, result.status, result.body);
}

async function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  onIntent: AgentControlServerOptions["onIntent"],
): Promise<void> {
  if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const path = pathname(req.url ?? "/");
  const upgrade = String(req.headers.upgrade ?? "").toLowerCase();
  const key = req.headers["sec-websocket-key"];
  if (
    !isIntentPath(path) ||
    upgrade !== "websocket" ||
    typeof key !== "string" ||
    !key
  ) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const frames = takeWsFrames(buffer);
    buffer = Buffer.from(frames.rest);
    if (frames.closed) {
      socket.end(encodeWsFrame(Buffer.alloc(0), 0x8));
      return;
    }
    for (const ping of frames.pings) {
      socket.write(encodeWsFrame(ping, 0xA));
    }
    for (const message of frames.texts) {
      void (async () => {
        let raw: unknown;
        try {
          raw = JSON.parse(message);
        } catch {
          socket.write(encodeWsText(JSON.stringify({ ok: false, error: "body must be valid JSON" })));
          return;
        }
        const result = await dispatchIntent(raw, onIntent);
        socket.write(encodeWsText(JSON.stringify(result.body)));
      })();
    }
  });
}

export function wsAcceptKey(key: string): string {
  return createHash("sha1").update(key + WS_GUID).digest("base64");
}

export function newIntentRequestId(): string {
  return randomUUID();
}

export function encodeWsText(text: string): Buffer {
  return encodeWsFrame(Buffer.from(text, "utf8"), 0x1);
}

export function encodeWsFrame(payload: Buffer, opcode: number, masked = false): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = (masked ? 0x80 : 0) | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = (masked ? 0x80 : 0) | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = (masked ? 0x80 : 0) | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | (opcode & 0x0f);
  if (!masked) return Buffer.concat([header, payload]);
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const maskedPayload = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    maskedPayload[i] = payload[i]! ^ mask[i % 4]!;
  }
  return Buffer.concat([header, mask, maskedPayload]);
}

function takeWsFrames(buffer: Buffer): {
  texts: string[];
  pings: Buffer[];
  rest: Buffer;
  closed: boolean;
} {
  const texts: string[] = [];
  const pings: Buffer[] = [];
  let offset = 0;
  let closed = false;

  while (offset + 2 <= buffer.length) {
    const b1 = buffer[offset]!;
    const b2 = buffer[offset + 1]!;
    const opcode = b1 & 0x0f;
    const masked = Boolean(b2 & 0x80);
    let len = b2 & 0x7f;
    let header = 2;
    if (len === 126) {
      if (offset + 4 > buffer.length) break;
      len = buffer.readUInt16BE(offset + 2);
      header = 4;
    } else if (len === 127) {
      if (offset + 10 > buffer.length) break;
      const high = buffer.readUInt32BE(offset + 2);
      const low = buffer.readUInt32BE(offset + 6);
      if (high !== 0 || low > AGENT_CONTROL_BODY_LIMIT) {
        closed = true;
        break;
      }
      len = low;
      header = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (offset + header + maskLen + len > buffer.length) break;
    const maskStart = offset + header;
    const dataStart = maskStart + maskLen;
    const payload = Buffer.from(buffer.subarray(dataStart, dataStart + len));
    if (masked) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] = payload[i]! ^ buffer[maskStart + (i % 4)]!;
      }
    }
    offset = dataStart + len;
    if (opcode === 0x8) {
      closed = true;
      break;
    }
    if (opcode === 0x9) pings.push(payload);
    if (opcode === 0x1) texts.push(payload.toString("utf8"));
  }

  return { texts, pings, rest: buffer.subarray(offset), closed };
}
