import { describe, expect, it } from "vitest";
import { fitScale } from "../src/renderer/fit-scale";

describe("fitScale", () => {
  it("fits an unscaled model into the view without using current scale", () => {
    const first = fitScale(2000, 2000, 420, 560);
    const afterFakeScaledBounds = fitScale(2000, 2000, 420, 560);
    expect(first).toBeCloseTo((420 / 2000) * 0.86, 5);
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
