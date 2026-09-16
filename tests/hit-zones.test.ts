import { describe, expect, it } from "vitest";
import { fallbackHitZone, geometricHitZone, isHeadZone, mapHitAreaName } from "../src/interaction/hit-zones";

describe("geometricHitZone", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };

  it("treats the upper half as head", () => {
    expect(geometricHitZone(50, 20, bounds)).toBe("head");
    expect(isHeadZone(geometricHitZone(50, 20, bounds))).toBe(true);
  });

  it("treats the lower half as body", () => {
    expect(geometricHitZone(50, 80, bounds)).toBe("body");
  });

  it("returns empty outside the actor", () => {
    expect(geometricHitZone(-4, 10, bounds)).toBe("empty");
  });
});

describe("fallbackHitZone", () => {
  it("maps the face circle to head", () => {
    expect(fallbackHitZone(0, -80)).toBe("head");
    expect(fallbackHitZone(0, -40)).toBe("head");
  });

  it("maps the torso to body", () => {
    expect(fallbackHitZone(0, 40)).toBe("body");
    expect(fallbackHitZone(0, 100)).toBe("body");
  });

  it("maps empty space around the pet", () => {
    expect(fallbackHitZone(200, 200)).toBe("empty");
  });
});

describe("mapHitAreaName", () => {
  it("maps named head and body hit areas", () => {
    expect(mapHitAreaName("HitAreaHead")).toBe("head");
    expect(mapHitAreaName("Face")).toBe("face");
    expect(mapHitAreaName("Body")).toBe("body");
  });

  it("maps unknown hit areas to empty instead of body", () => {
    expect(mapHitAreaName("UnknownThing")).toBe("empty");
  });
});
