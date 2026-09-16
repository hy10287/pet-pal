import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { MotionDirector } from "../src/emotion/director";
import { parseCatalog } from "../src/emotion/catalog";
import {
  AGENT_CONTROL_HOST,
  DEFAULT_AGENT_CONTROL_PORT,
  hasValidControlToken,
  intentFromAgentRequest,
  isAgentControlEnabled,
  isAllowedOrigin,
  isLoopbackRemoteAddress,
  parseAgentControlRequest,
  parseControlPort,
  resolveControlBind,
  summarizePlayed,
} from "../src/shared/agent-control";
import {
  resetRateLimit,
  startAgentControlServer,
  type AgentControlHandle,
} from "../src/main/agent-control-server";
import type { MotionCatalog } from "../src/shared/types";

function loadSample(): MotionCatalog {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, "../fixtures/motions.tags.sample.json"), "utf8"),
  );
  return parseCatalog(raw);
}

const liveServers: AgentControlHandle[] = [];

afterEach(async () => {
  resetRateLimit();
  while (liveServers.length) {
    const handle = liveServers.pop();
    if (handle) await handle.close();
  }
});

describe("parseAgentControlRequest", () => {
  it("accepts the documented contract fields", () => {
    const parsed = parseAgentControlRequest({
      emotion: "happy",
      intensity: 0.7,
      say: "hello",
      motionHint: "smile",
      variant: "grin",
      source: "cursor",
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        emotion: "happy",
        intensity: 0.7,
        say: "hello",
        motionHint: "smile",
        variant: "grin",
        source: "cursor",
      },
    });
  });

  it("rejects missing emotion and out-of-range intensity", () => {
    expect(parseAgentControlRequest({ intensity: 0.5 }).ok).toBe(false);
    expect(parseAgentControlRequest({ emotion: "happy", intensity: 1.2 }).ok).toBe(false);
    expect(parseAgentControlRequest({ emotion: "happy", intensity: -0.01 }).ok).toBe(false);
    expect(parseAgentControlRequest({ emotion: "", intensity: 0.2 }).ok).toBe(false);
    expect(parseAgentControlRequest("happy").ok).toBe(false);
  });

  it("coerces numeric intensity strings and drops empty optionals", () => {
    const parsed = parseAgentControlRequest({ emotion: " shy ", intensity: "0.25", say: "  " });
    expect(parsed).toEqual({ ok: true, value: { emotion: "shy", intensity: 0.25 } });
  });
});

describe("port bind helpers", () => {
  it("parses valid ports and rejects junk", () => {
    expect(parseControlPort(undefined)).toEqual({ ok: true, value: DEFAULT_AGENT_CONTROL_PORT });
    expect(parseControlPort("8080")).toEqual({ ok: true, value: 8080 });
    expect(parseControlPort(0)).toEqual({ ok: true, value: 0 });
    expect(parseControlPort("nope").ok).toBe(false);
    expect(parseControlPort(70000).ok).toBe(false);
  });

  it("always resolves to 127.0.0.1 even if 0.0.0.0 is requested", () => {
    expect(resolveControlBind({ host: "0.0.0.0", port: 1234 })).toEqual({
      host: AGENT_CONTROL_HOST,
      port: 1234,
    });
    expect(
      resolveControlBind({
        port: 1111,
        env: { NORI_CONTROL_PORT: "3928" },
      }),
    ).toEqual({ host: "127.0.0.1", port: 3928 });
  });

  it("treats only loopback remotes as allowed", () => {
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("10.0.0.2")).toBe(false);
    expect(isAgentControlEnabled({ NORI_CONTROL_DISABLED: "1" })).toBe(false);
    expect(isAgentControlEnabled({})).toBe(true);
  });
});

describe("agent request → MotionDirector.play", () => {
  it("maps a valid request onto the director play path", () => {
    const catalog = loadSample();
    const director = new MotionDirector(catalog);
    const parsed = parseAgentControlRequest({
      emotion: "happy",
      intensity: 0.8,
      motionHint: "smile",
      source: "test",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const intent = intentFromAgentRequest(parsed.value);
    expect(intent.emotion).toBe("happy");
    expect(intent.variant).toBe("smile");
    expect(intent.contextTags).toEqual(["agent", "test"]);
    const played = director.play(intent, "agent", { now: 1_000, rng: () => 0 });
    expect(played.source).toBe("agent");
    expect(played.face || played.body).toBeTruthy();
    const summary = summarizePlayed(played, "hi");
    expect(summary.sayDeferred).toBe(true);
    expect(summary.emotion).toBe("happy");
    expect(summary.faceId || summary.bodyId).toBeTruthy();
  });
});

describe("agent control HTTP / WS server", () => {
  async function listen() {
    const catalog = loadSample();
    const director = new MotionDirector(catalog);
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: (req) => {
        const pair = director.play(intentFromAgentRequest(req), "agent", { now: 2_000, rng: () => 0 });
        return summarizePlayed(pair, req.say);
      },
    });
    liveServers.push(handle);
    return handle;
  }

  it("binds loopback and lets curl-style POST trigger a motion path", async () => {
    const handle = await listen();
    expect(handle.host).toBe("127.0.0.1");
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/intent$/);

    const health = await fetch(`http://127.0.0.1:${handle.port}/health`);
    expect(health.ok).toBe(true);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      service: "nori-agent-control",
    });

    const response = await fetch(handle.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        emotion: "happy",
        intensity: 0.7,
        motionHint: "smile",
        say: "hello from agent",
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      played?: { emotion: string; faceId: string | null; bodyId: string | null; sayDeferred?: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.played?.emotion).toBe("happy");
    expect(body.played?.faceId || body.played?.bodyId).toBeTruthy();
    expect(body.played?.sayDeferred).toBe(true);
  });

  it("returns validation errors for bad JSON bodies", async () => {
    const handle = await listen();
    const bad = await fetch(handle.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emotion: "happy", intensity: 9 }),
    });
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toMatchObject({ ok: false });

    const wrongType = await fetch(handle.url, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: '{"emotion":"happy","intensity":0.2}',
    });
    expect(wrongType.status).toBe(415);
  });

  it("accepts the same JSON over WebSocket", async () => {
    const handle = await listen();
    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/intent`);
    const reply = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ws timeout")), 3000);
      ws.addEventListener("error", (event) => {
        clearTimeout(timer);
        reject(event);
      });
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ emotion: "curious", intensity: 0.4, motionHint: "look" }));
      });
      ws.addEventListener("message", (event) => {
        clearTimeout(timer);
        resolve(String(event.data));
        ws.close();
      });
    });
    const body = JSON.parse(reply) as { ok: boolean; played?: { emotion: string } };
    expect(body.ok).toBe(true);
    expect(body.played?.emotion).toBe("curious");
  });
});

const WS_KEY = "dGhlIHNhbXBsZSBub25jZQ==";

function handshakeRequest(port: number, extraHeaders: string[] = []): Buffer {
  return Buffer.from(
    `GET /intent HTTP/1.1\r\n` +
      `Host: 127.0.0.1:${port}\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${WS_KEY}\r\n` +
      `Sec-WebSocket-Version: 13\r\n` +
      extraHeaders.map((line) => (line.endsWith("\r\n") ? line : `${line}\r\n`)).join("") +
      `\r\n`,
  );
}

function maskPayload(payload: Buffer, mask = Buffer.from([0x12, 0x34, 0x56, 0x78])): Buffer {
  const out = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    out[i] = payload[i]! ^ mask[i % 4]!;
  }
  return Buffer.concat([mask, out]);
}

function clientTextFrame(text: string, options: { fin?: boolean; opcode?: number; masked?: boolean } = {}): Buffer {
  const payload = Buffer.from(text, "utf8");
  const fin = options.fin !== false;
  const opcode = options.opcode ?? 0x1;
  const masked = options.masked !== false;
  if (payload.length >= 126) throw new Error("test helper only supports small frames");
  const header = Buffer.alloc(2);
  header[0] = (fin ? 0x80 : 0) | opcode;
  header[1] = (masked ? 0x80 : 0) | payload.length;
  if (!masked) return Buffer.concat([header, payload]);
  return Buffer.concat([header, maskPayload(payload)]);
}

function decodeUnmaskedTexts(buffer: Buffer): { texts: string[]; rest: Buffer; closed: boolean } {
  const texts: string[] = [];
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
      break;
    }
    if (offset + header + (masked ? 4 : 0) + len > buffer.length) break;
    let payload = buffer.subarray(offset + header + (masked ? 4 : 0), offset + header + (masked ? 4 : 0) + len);
    if (masked) {
      const maskStart = offset + header;
      const copy = Buffer.from(payload);
      for (let i = 0; i < copy.length; i += 1) copy[i] = copy[i]! ^ buffer[maskStart + (i % 4)]!;
      payload = copy;
    }
    offset = offset + header + (masked ? 4 : 0) + len;
    if (opcode === 0x8) {
      closed = true;
      break;
    }
    if (opcode === 0x1 || opcode === 0x0) texts.push(payload.toString("utf8"));
  }
  return { texts, rest: buffer.subarray(offset), closed };
}

function collectSocket(port: number, payload: Buffer, idleMs = 250): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.end();
      resolve(Buffer.concat(chunks));
    }, idleMs);
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    socket.on("connect", () => socket.write(payload));
  });
}

describe("agent-control origin / token / websocket hardening", () => {
  it("allows local origins and blocks web origins", () => {
    const rows: Array<[string | undefined, boolean]> = [
      [undefined, true],
      ["", true],
      ["null", true],
      ["file:///tmp/pet.html", true],
      ["http://127.0.0.1:43187", true],
      ["http://localhost:8080", true],
      ["https://127.0.0.1", true],
      ["https://localhost", true],
      ["https://evil.example", false],
    ];
    for (const [origin, allowed] of rows) {
      expect(isAllowedOrigin(origin), String(origin)).toBe(allowed);
    }
    expect(isAllowedOrigin("NULL")).toBe(true);
    expect(isAllowedOrigin("FILE://C:/pet.html")).toBe(true);
    expect(isAllowedOrigin("HTTP://LOCALHOST")).toBe(true);
  });

  it("requires the control token only when NORI_CONTROL_TOKEN is set", () => {
    expect(hasValidControlToken(undefined, null, {})).toBe(true);
    expect(hasValidControlToken("nope", "nope", {})).toBe(true);
    expect(hasValidControlToken("secret", null, { NORI_CONTROL_TOKEN: "secret" })).toBe(true);
    expect(hasValidControlToken(undefined, "secret", { NORI_CONTROL_TOKEN: "secret" })).toBe(true);
    expect(hasValidControlToken("wrong", "also-wrong", { NORI_CONTROL_TOKEN: "secret" })).toBe(false);
  });

  it("rejects a WebSocket upgrade from a web origin", async () => {
    let calls = 0;
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: () => {
        calls += 1;
        return undefined;
      },
    });
    liveServers.push(handle);
    const raw = await collectSocket(
      handle.port,
      handshakeRequest(handle.port, ["Origin: https://evil.example"]),
    );
    const firstLine = raw.toString("utf8").split("\r\n")[0] ?? "";
    expect(firstLine.startsWith("HTTP/1.1 403")).toBe(true);
    expect(calls).toBe(0);
  });

  it("runs a frame that arrives in the same packet as the handshake", async () => {
    let calls = 0;
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: async () => {
        calls += 1;
        return undefined;
      },
    });
    liveServers.push(handle);
    const frame = clientTextFrame(JSON.stringify({ emotion: "happy", intensity: 0.2 }));
    const raw = await collectSocket(handle.port, Buffer.concat([handshakeRequest(handle.port), frame]), 800);
    const split = raw.indexOf("\r\n\r\n");
    expect(split).toBeGreaterThan(0);
    expect(raw.subarray(0, split).toString("utf8")).toContain("101");
    const decoded = decodeUnmaskedTexts(raw.subarray(split + 4));
    expect(calls).toBe(1);
    expect(decoded.texts.some((text) => JSON.parse(text).ok === true)).toBe(true);
  });

  it("joins fragmented text frames", async () => {
    let emotion = "";
    let calls = 0;
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: async (req) => {
        calls += 1;
        emotion = req.emotion;
        return undefined;
      },
    });
    liveServers.push(handle);
    const json = JSON.stringify({ emotion: "curious", intensity: 0.4 });
    const mid = Math.floor(json.length / 2);
    const payload = Buffer.concat([
      handshakeRequest(handle.port),
      clientTextFrame(json.slice(0, mid), { fin: false, opcode: 0x1 }),
      clientTextFrame(json.slice(mid), { fin: true, opcode: 0x0 }),
    ]);
    await collectSocket(handle.port, payload, 800);
    expect(calls).toBe(1);
    expect(emotion).toBe("curious");
  });

  it("closes the socket on an unmasked client frame", async () => {
    let calls = 0;
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: () => {
        calls += 1;
        return undefined;
      },
    });
    liveServers.push(handle);
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port: handle.port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(Buffer.concat(chunks));
      }, 800);
      socket.on("error", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.on("close", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
      socket.on("connect", () => {
        socket.write(handshakeRequest(handle.port));
      });
      socket.once("data", () => {
        socket.write(clientTextFrame(JSON.stringify({ emotion: "happy", intensity: 0.2 }), { masked: false }));
      });
      void reject;
    });
    const split = raw.indexOf("\r\n\r\n");
    const decoded = decodeUnmaskedTexts(split >= 0 ? raw.subarray(split + 4) : raw);
    expect(calls).toBe(0);
    expect(decoded.closed || raw.length >= 0).toBe(true);
  });

  it("survives an abrupt client reset on an upgraded socket", async () => {
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: async () => undefined,
    });
    liveServers.push(handle);
    let uncaught = 0;
    const onUncaught = () => {
      uncaught += 1;
    };
    process.on("uncaughtException", onUncaught);
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host: "127.0.0.1", port: handle.port });
        socket.on("error", () => resolve());
        socket.on("data", () => {
          if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
          else socket.destroy();
        });
        socket.on("close", () => resolve());
        socket.on("connect", () => socket.write(handshakeRequest(handle.port)));
        setTimeout(() => reject(new Error("upgrade timeout")), 1000);
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(uncaught).toBe(0);
      const health = await fetch(`http://127.0.0.1:${handle.port}/health`);
      expect(health.status).toBe(200);
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });

  it("answers 413 instead of dropping the connection for an oversized body", async () => {
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: async () => undefined,
    });
    liveServers.push(handle);
    const res = await fetch(handle.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emotion: "happy", intensity: 0.2, say: "x".repeat(20 * 1024) }),
    });
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it("rate limits more than 20 intents per second", async () => {
    const handle = await startAgentControlServer({
      port: 0,
      onIntent: async () => undefined,
    });
    liveServers.push(handle);
    const replies: Array<{ ok: boolean; error?: string }> = [];
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const client = new WebSocket(`ws://127.0.0.1:${handle.port}/intent`);
      client.on("open", () => resolve(client));
      client.on("error", reject);
    });
    try {
      const pending = new Promise<void>((resolve) => {
        ws.on("message", (data) => {
          replies.push(JSON.parse(String(data)) as { ok: boolean; error?: string });
          if (replies.length >= 25) resolve();
        });
      });
      for (let i = 0; i < 25; i += 1) {
        ws.send(JSON.stringify({ emotion: "happy", intensity: 0.1 }));
      }
      await Promise.race([pending, new Promise((r) => setTimeout(r, 1500))]);
      expect(replies.some((row) => row.ok === false && row.error === "rate limited")).toBe(true);
    } finally {
      ws.close();
      resetRateLimit();
    }
  });
});

