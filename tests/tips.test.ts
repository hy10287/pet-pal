import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  pickText,
  renderTemplate,
  shouldAccept,
  shouldSuppressByQuietHours,
} from "../src/tips/message-center";
import { inDateRange, inHourRange } from "../src/shared/tips-time";
import { nextIdleState } from "../src/tips/idle-policy";
import { DEFAULT_TIPS, parseTips } from "../src/tips/schema";
import { startupGreeting, tipForInteraction } from "../src/tips/triggers";

describe("shouldAccept", () => {
  it("accepts the first message when nothing is showing", () => {
    expect(shouldAccept(null, { priority: 1 })).toBe(true);
  });

  it("lets a higher priority message replace a lower one", () => {
    expect(shouldAccept({ priority: 8 }, { priority: 9 })).toBe(true);
  });

  it("blocks a lower priority message", () => {
    expect(shouldAccept({ priority: 9 }, { priority: 8 })).toBe(false);
  });

  it("lets an equal priority message replace when override is true", () => {
    expect(shouldAccept({ priority: 9 }, { priority: 9, override: true })).toBe(true);
    expect(shouldAccept({ priority: 9 }, { priority: 9 })).toBe(true);
  });

  it("blocks an equal priority message when override is false", () => {
    expect(shouldAccept({ priority: 9 }, { priority: 9, override: false })).toBe(false);
    expect(shouldAccept({ priority: 9 }, { priority: 10, override: false })).toBe(true);
  });
});

describe("templates", () => {
  it("renders known template variables and keeps unknown ones", () => {
    expect(renderTemplate("hi {model} {hour} {year} {idle} {unknown}", {
      model: "hiyori",
      hour: "8",
      year: "2026",
      idle: "5",
    })).toBe("hi hiyori 8 2026 5 {unknown}");
  });

  it("picks a random entry from an array deterministically with an injected rng", () => {
    expect(pickText(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickText(["a", "b", "c"], () => 0.99)).toBe("c");
    expect(pickText([], () => 0)).toBeNull();
    expect(pickText("only")).toBe("only");
  });
});

describe("quiet hours", () => {
  it("suppresses passive messages during quiet hours but keeps direct feedback", () => {
    expect(shouldSuppressByQuietHours(["23-7"], { passive: true }, 23)).toBe(true);
    expect(shouldSuppressByQuietHours(["23-7"], { passive: true }, 2)).toBe(true);
    expect(shouldSuppressByQuietHours(["23-7"], { passive: true }, 8)).toBe(false);
    expect(shouldSuppressByQuietHours(["23-7"], { passive: false }, 23)).toBe(false);
    expect(shouldSuppressByQuietHours(["23-7"], {}, 23)).toBe(false);
  });

  it("matches hour ranges including midnight wrap (23-7)", () => {
    expect(inHourRange(23, "23-7")).toBe(true);
    expect(inHourRange(0, "23-7")).toBe(true);
    expect(inHourRange(7, "23-7")).toBe(true);
    expect(inHourRange(8, "23-7")).toBe(false);
    expect(inHourRange(8, "8")).toBe(true);
    expect(inHourRange(9, "8")).toBe(false);
  });

  it("matches seasonal ranges including year wrap (12/30-01/02)", () => {
    expect(inDateRange(12, 30, "12/30-01/02")).toBe(true);
    expect(inDateRange(12, 31, "12/30-01/02")).toBe(true);
    expect(inDateRange(1, 1, "12/30-01/02")).toBe(true);
    expect(inDateRange(1, 2, "12/30-01/02")).toBe(true);
    expect(inDateRange(1, 3, "12/30-01/02")).toBe(false);
    expect(inDateRange(6, 1, "12/30-01/02")).toBe(false);
  });
});

describe("idle policy", () => {
  it("fires the first idle tip at firstIdleSec and then respects repeatEverySec", () => {
    const policy = { firstIdleSec: 300, repeatEverySec: 1800 };
    const idle = nextIdleState(policy, { firedCount: 0, lastFiredAtMs: null }, 299, 10_000);
    expect(idle.fire).toBe(false);
    expect(idle.state).toEqual({ firedCount: 0, lastFiredAtMs: null });
    const first = nextIdleState(policy, idle.state, 300, 10_000);
    expect(first.fire).toBe(true);
    expect(first.state.firedCount).toBe(1);
    const tooSoon = nextIdleState(policy, first.state, 400, 10_000 + 1_799_000);
    expect(tooSoon.fire).toBe(false);
    const again = nextIdleState(policy, first.state, 400, 10_000 + 1_800_000);
    expect(again.fire).toBe(true);
    const reset = nextIdleState(policy, again.state, 10, 20_000_000);
    expect(reset.fire).toBe(false);
    expect(reset.state).toEqual({ firedCount: 0, lastFiredAtMs: null });
  });
});

describe("startup greeting", () => {
  it("prefers seasons over time over welcome for the startup greeting", () => {
    const tips = parseTips({
      schemaVersion: 1,
      welcome: ["welcome-only"],
      time: [{ hour: "8-10", text: ["time-slot"] }],
      seasons: [{ date: "01/01-01/02", text: ["season-{year}"] }],
    });
    expect(tips.ok).toBe(true);
    if (!tips.ok) return;
    const vars = { year: "2026", hour: "9", model: "nori" };
    const season = startupGreeting(tips.value, { month: 1, day: 1, hour: 9, year: 2026 }, vars, () => 0);
    expect(season?.text).toBe("season-2026");
    expect(season?.priority).toBe(11);
    expect(season?.passive).toBe(true);
    const timeOnly = startupGreeting(
      { ...tips.value, seasons: [] },
      { month: 6, day: 1, hour: 9, year: 2026 },
      vars,
      () => 0,
    );
    expect(timeOnly?.text).toBe("time-slot");
    const welcome = startupGreeting(
      { ...tips.value, seasons: [], time: [] },
      { month: 6, day: 1, hour: 9, year: 2026 },
      vars,
      () => 0,
    );
    expect(welcome?.text).toBe("welcome-only");
    expect(startupGreeting(DEFAULT_TIPS, { month: 6, day: 1, hour: 15, year: 2026 }, vars)?.text).toBe("今天也在这里。");
  });
});

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

  it("returns null when a reaction has no text entries", () => {
    const parsed = parseTips({
      schemaVersion: 1,
      reactions: { "head-click": [{ text: [] }, { text: ["", "  "] }] },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(tipForInteraction(parsed.value, "head-click", { model: "nori" })).toBeNull();
  });
});
