import { describe, expect, it } from "vitest";
import { createLookState, gazeFromPointer, settleLook, updateLook } from "../src/interaction/mouse-follow";

describe("gazeFromPointer", () => {
  it("maps the window center to zero offset at full strength", () => {
    expect(gazeFromPointer(210, 280, 420, 560)).toEqual({ nx: 0, ny: 0, strength: 1 });
  });

  it("clamps the top-left corner to -1,-1", () => {
    expect(gazeFromPointer(0, 0, 420, 560)).toEqual({ nx: -1, ny: -1, strength: 1 });
  });

  it("fades when the cursor is just outside the window", () => {
    const near = gazeFromPointer(420 + 40, 280, 420, 560, 80);
    expect(near).not.toBeNull();
    expect(near!.strength).toBeCloseTo(0.5, 5);
    expect(gazeFromPointer(420 + 200, 280, 420, 560, 80)).toBeNull();
  });
});

describe("updateLook", () => {
  it("lerps toward the target instead of snapping", () => {
    const state = createLookState();
    updateLook(state, { nx: 1, ny: -1, strength: 1 }, 0.016);
    expect(state.eyeX).toBeGreaterThan(0);
    expect(state.eyeX).toBeLessThan(1);
    expect(state.angleX).toBeGreaterThan(0);
    expect(state.angleX).toBeLessThan(18);
  });

  it("clamps eyes to [-1, 1] and head angles to ±30", () => {
    const state = createLookState();
    for (let i = 0; i < 80; i += 1) updateLook(state, { nx: 4, ny: 4, strength: 1 }, 0.05);
    expect(state.eyeX).toBeLessThanOrEqual(1);
    expect(state.angleX).toBeLessThanOrEqual(30);
  });

  it("settles back toward idle", () => {
    const state = createLookState();
    for (let i = 0; i < 40; i += 1) updateLook(state, { nx: 1, ny: 1, strength: 1 }, 0.05);
    settleLook(state, 0.5);
    expect(Math.abs(state.eyeX)).toBeLessThan(0.2);
  });
});
