import { describe, expect, it } from "vitest";
import { classifyIntentFromText, routeInteraction } from "../src/interaction/router";

describe("routeInteraction", () => {
  it("maps head click to shy or happy", () => {
    const shy = routeInteraction("head-click", () => 0);
    const happy = routeInteraction("head-click", () => 0.9);
    expect(["shy", "happy"]).toContain(shy.emotion);
    expect(["shy", "happy"]).toContain(happy.emotion);
    expect(shy.contextTags).toEqual(["click", "head"]);
  });

  it("maps body click to nod/tilthead acknowledge", () => {
    const intent = routeInteraction("body-click", () => 0);
    expect(intent.emotion).toBe("acknowledge");
    expect(["nod", "tilthead"]).toContain(intent.variant);
  });

  it("marks double-click as an event so sparkle clips can enter", () => {
    const intent = routeInteraction("double-click", () => 0.5);
    expect(intent.emotion).toBe("excited");
    expect(intent.variant).toBe("sparkle");
    expect(intent.event).toBe(true);
    expect(intent.intensity).toBeGreaterThan(0.7);
  });

  it("keeps idle soft and low intensity", () => {
    const intent = routeInteraction("idle", () => 0.2);
    expect(intent.emotion).toBe("neutral");
    expect(intent.intensity).toBeLessThan(0.4);
    expect(intent.contextTags).toContain("idle");
  });
});

describe("classifyIntentFromText", () => {
  it("is a stub for a future API classifier", async () => {
    await expect(classifyIntentFromText("hello")).resolves.toBeNull();
  });
});
