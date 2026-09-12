import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBridge, PENDING_PLACEHOLDER } = require("../scripts/nori-grokbot-bridge.js") as {
  PENDING_PLACEHOLDER: { say: string; emotion: string; intensity: number };
  createBridge: (options?: { dir?: string; port?: number }) => {
    listen: (
      port?: number,
      host?: string,
    ) => Promise<{ port: number; root: string; url: string; close: () => Promise<void> }>;
  };
};

const temps: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length) {
    await closers.pop()?.();
  }
  while (temps.length) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nori-chat-"));
  temps.push(dir);
  return dir;
}

async function startBridge(dir: string) {
  const handle = await createBridge({ dir }).listen(0);
  closers.push(() => handle.close());
  return handle;
}

describe("nori-grokbot-bridge", () => {
  it("POST returns a pending placeholder immediately and does not wait on outbox", async () => {
    const dir = tempDir();
    const handle = await startBridge(dir);
    const t0 = Date.now();
    const res = await fetch(`${handle.url}/nori-chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "你好", sessionId: "nori-1" }),
    });
    const elapsed = Date.now() - t0;
    const body = (await res.json()) as { id: string; pending: boolean; say: string };
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(250);
    expect(body.pending).toBe(true);
    expect(body.say).toBe(PENDING_PLACEHOLDER.say);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const inbox = JSON.parse(readFileSync(join(dir, "inbox", `${body.id}.json`), "utf8"));
    expect(inbox).toMatchObject({ id: body.id, text: "你好", sessionId: "nori-1" });

    const pending = await fetch(`${handle.url}/nori-chat/result/${body.id}`);
    expect(await pending.json()).toEqual({ id: body.id, pending: true });
  });

  it("GET result returns outbox JSON then deletes the file", async () => {
    const dir = tempDir();
    const handle = await startBridge(dir);
    const posted = await fetch(`${handle.url}/nori-chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    const { id } = (await posted.json()) as { id: string };
    writeFileSync(
      join(dir, "outbox", `${id}.json`),
      JSON.stringify({ say: "嗯", emotion: "happy", intensity: 0.7, motionHint: "wave", pending: true }),
    );

    const ready = await fetch(`${handle.url}/nori-chat/result/${id}`);
    expect(await ready.json()).toEqual({
      say: "嗯",
      emotion: "happy",
      intensity: 0.7,
      motionHint: "wave",
    });
    expect(existsSync(join(dir, "outbox", `${id}.json`))).toBe(false);

    const again = await fetch(`${handle.url}/nori-chat/result/${id}`);
    expect(await again.json()).toEqual({ id, pending: true });
  });

  it("GET /health is up and webhook wake does not block POST", async () => {
    const dir = tempDir();
    let webhookHits = 0;
    const webhook = createServer((_req, res) => {
      webhookHits += 1;
      setTimeout(() => {
        res.writeHead(200);
        res.end("ok");
      }, 400);
    });
    await new Promise<void>((resolve) => webhook.listen(0, "127.0.0.1", resolve));
    closers.push(
      () =>
        new Promise((resolve, reject) => {
          webhook.close((error) => (error ? reject(error) : resolve()));
        }),
    );
    const addr = webhook.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    writeFileSync(join(dir, "webhook.url"), `http://127.0.0.1:${port}/wake\n`);
    writeFileSync(join(dir, "webhook.auth"), "Bearer test-token\n");

    const handle = await startBridge(dir);
    const health = await fetch(`${handle.url}/health`);
    expect(await health.json()).toEqual({ ok: true });

    const t0 = Date.now();
    const res = await fetch(`${handle.url}/nori-chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "wake me" }),
    });
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(((await res.json()) as { pending: boolean }).pending).toBe(true);
    expect(elapsed).toBeLessThan(200);
    expect(webhookHits).toBeLessThanOrEqual(1);
  });
});
