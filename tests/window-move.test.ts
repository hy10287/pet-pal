import { describe, expect, it } from "vitest";
import { applyLockedSize, movedBounds, placeAt, sameSize } from "../src/main/window-move";

const lock = { width: 420, height: 246 };

describe("applyLockedSize", () => {
  it("keeps the top-left corner and writes the locked crop size", () => {
    expect(applyLockedSize({ x: 40.4, y: 80.6, width: 420, height: 560 }, lock)).toEqual({
      x: 40,
      y: 81,
      width: 420,
      height: 246,
    });
  });
});

describe("movedBounds / placeAt", () => {
  it("never pick up a drag delta as a new window size", () => {
    expect(movedBounds({ x: 10, y: 20, width: 999, height: 999 }, 5, -3, lock)).toEqual({
      x: 15,
      y: 17,
      width: 420,
      height: 246,
    });
    expect(placeAt(100.2, 200.8, lock)).toEqual({ x: 100, y: 201, width: 420, height: 246 });
  });
});

describe("sameSize", () => {
  it("treats 1px DPI slop as the same lock so resized does not fight setBounds", () => {
    expect(sameSize({ width: 420, height: 246 }, lock)).toBe(true);
    expect(sameSize({ width: 421, height: 247 }, lock)).toBe(true);
    expect(sameSize({ width: 420, height: 179 }, lock)).toBe(false);
  });
});
