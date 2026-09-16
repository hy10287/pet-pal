import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TIPS, parseTips } from "../src/tips/schema";

describe("parseTips", () => {
  it("ignores unknown reaction keys and unknown schema versions", () => {
    expect(parseTips({ schemaVersion: 2, welcome: ["hi"] }).ok).toBe(false);
    expect(parseTips({ schemaVersion: "1", welcome: ["hi"] }).ok).toBe(false);

    const parsed = parseTips({
      schemaVersion: 1,
      reactions: {
        "head-click": [{ text: ["嗯？"] }],
        unknown: [{ text: ["should drop"] }],
        selector: [{ text: ["no"] }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.reactions["head-click"][0]?.text).toEqual(["嗯？"]);
    expect(parsed.value.reactions).not.toHaveProperty("unknown");
    expect(parsed.value.reactions).not.toHaveProperty("selector");
    expect(parseTips({ schemaVersion: 1, time: [{ hour: "25", text: ["x"] }] }).ok).toBe(false);
    expect(parseTips({ schemaVersion: 1, seasons: [{ date: "1/1-1/2", text: ["x"] }] }).ok).toBe(false);
  });

  it("falls back to DEFAULT_TIPS.idle.text when idle.text is missing", () => {
    const missing = parseTips({ schemaVersion: 1, idle: { firstIdleSec: 20 } });
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    expect(missing.value.idle.text).toEqual(DEFAULT_TIPS.idle.text);
    expect(missing.value.idle.firstIdleSec).toBe(20);
    expect(missing.value.idle.repeatEverySec).toBe(1800);
    expect(missing.value.idle.timeoutMs).toBe(6000);

    const empty = parseTips({ schemaVersion: 1, idle: { text: ["", "  "] } });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.value.idle.text).toEqual(DEFAULT_TIPS.idle.text);

    const quiet = parseTips({ schemaVersion: 1, quietHours: ["23-7", "nope", "8"] });
    expect(quiet.ok).toBe(true);
    if (!quiet.ok) return;
    expect(quiet.value.quietHours).toEqual(["23-7"]);
  });

  it("parses the shipped config/tips.json", () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../config/tips.json"), "utf8"));
    const parsed = parseTips(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.schemaVersion).toBe(1);
    expect(parsed.value.welcome).toEqual(["今天也在这里。"]);
    expect(parsed.value.reactions["hover-dwell"][0]?.override).toBe(false);
  });
});
