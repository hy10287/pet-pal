import { describe, expect, it } from "vitest";
import { clampUserScale, windowHeightForPreset } from "../src/shared/display-preset";
import { fitScale, lockFitted, visualScale } from "../src/renderer/fit-scale";

describe("fitScale", () => {
  it("fits an unscaled model into the view without using current scale", () => {
    const first = fitScale(2000, 2000, 420, 560);
    const afterFakeScaledBounds = fitScale(2000, 2000, 420, 560);
    expect(first).toBeCloseTo(420 / 2000, 5);
    expect(afterFakeScaledBounds).toBe(first);
  });

  it("does not grow when someone passes already-shrunk bounds by mistake — caller must pass naturals", () => {
    const natural = fitScale(2000, 2000, 420, 560);
    const wrong = fitScale(361, 361, 420, 560);
    expect(wrong).toBeGreaterThan(natural);
  });

  it("returns 1 for invalid sizes", () => {
    expect(fitScale(0, 100, 420, 560)).toBe(1);
  });
});

describe("visualScale model", () => {
  it("is full-body contain-fit × user slider, never the cropped height", () => {
    const fitted = lockFitted(null, 2000, 2000, 420, 560);
    const compactH = windowHeightForPreset(560, "compact");
    const wronglyCropped = fitScale(2000, 2000, 420, compactH);
    expect(visualScale(fitted, 1)).toBe(fitted);
    expect(visualScale(fitted, 1.2)).toBeCloseTo(fitted * 1.2);
    expect(visualScale(fitted, 1)).not.toBeCloseTo(wronglyCropped);
    expect(visualScale(fitted, 0.6)).toBeCloseTo(fitted * 0.6);
  });

  it("stays sticky across later crop-sized views so presets cannot resize the character", () => {
    const first = lockFitted(null, 2000, 2000, 420, 560);
    const compactH = windowHeightForPreset(560, "compact");
    const afterCrop = lockFitted(first, 2000, 2000, 420, compactH);
    expect(afterCrop).toBe(first);
    expect(visualScale(afterCrop, 1)).toBe(visualScale(first, 1));
  });

  it("clamps the user slider", () => {
    expect(clampUserScale(0.2)).toBe(0.6);
    expect(clampUserScale(9)).toBe(1.8);
    expect(clampUserScale(Number.NaN)).toBe(1);
  });

  it("does not lock a fit until the natural size is real", () => {
    expect(lockFitted(null, 2, 2, 420, 560)).toBe(0);
    expect(lockFitted(0.3, 2, 2, 420, 560)).toBe(0.3);
  });
});
