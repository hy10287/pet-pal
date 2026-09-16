import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MotionDirector } from "../src/emotion/director";
import { parseCatalog } from "../src/emotion/catalog";
import {
  AGENT_CONTROL_HOST,
  DEFAULT_AGENT_CONTROL_PORT,
  intentFromAgentRequest,
  isAgentControlEnabled,
  isLoopbackRemoteAddress,
  parseAgentControlRequest,
  parseControlPort,
  resolveControlBind,
  summarizePlayed,
} from "../src/shared/agent-control";
import {
  encodeWsFrame,
  startAgentControlServer,
  type AgentControlHandle,
} from "../src/main/agent-control-server";
import type { MotionCatalog } from "../src/shared/types";

/** Node 20 CI has no global WebSocket; speak RFC 6455 over net.Socket. */
function sendWsJson(port: number, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString("base64");
    const socket = createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("ws timeout"));
    }, 3000);
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const finish = (error: Error | null, value?: unknown) => {
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    socket.on("error", (error) => finish(error));
    socket.on("connect", () => {
      socket.write(
        [
          "GET /intent HTTP/1.1",
          `Host: 127.0.0.1:${port}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"),
      );
    });
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const split = buf.indexOf("\r\n\r\n");
        if (split < 0) return;
        const head = buf.subarray(0, split).toString("utf8");
        buf = buf.subarray(split + 4);
        if (!/^HTTP\/1\.1 101/i.test(head)) {
          finish(new Error(`ws upgrade failed: ${head.split("\r\n")[0] ?? head}`));
          return;
        }
        upgraded = true;
        socket.write(encodeWsFrame(Buffer.from(JSON.stringify(payload), "utf8"), 0x1, true));
      }
      const text = decodeUnmaskedTextFrame(buf);
      if (text == null) return;
      try {
        finish(null, JSON.parse(text));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

function decodeUnmaskedTextFrame(buffer: Buffer): string | null {
  if (buffer.length < 2) return null;
  const opcode = buffer[0]! & 0x0f;
  const masked = Boolean(buffer[1]! & 0x80);
  let len = buffer[1]! & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < 4) return null;
    len = buffer.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    return null;
  }
  if (masked || opcode !== 0x1) return null;
  if (buffer.length < offset + len) return null;
  return buffer.subarray(offset, offset + len).toString("utf8");
}

function loadSample(): MotionCatalog {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, "../fixtures/motions.tags.sample.json"), "utf8"),
  );
  return parseCatalog(raw);
}

const liveServers: AgentControlHandle[] = [];

afterEach(async () => {
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

  // Global WebSocket is Node 21+. GitHub Actions CI is Node 20.
  it.skipIf(typeof globalThis.WebSocket !== "function")("accepts the same JSON over WebSocket", async () => {
    const handle = await listen();
    const body = (await sendWsJson(handle.port, {
      emotion: "curious",
      intensity: 0.4,
      motionHint: "look",
    })) as { ok: boolean; played?: { emotion: string } };
    expect(body.ok).toBe(true);
    expect(body.played?.emotion).toBe("curious");
  });
});
