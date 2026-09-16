import { describe, expect, it } from "vitest";
import { applyLockedSize, movedBounds, placeAt, placeChromeBounds, sameSize } from "../src/main/window-move";

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

  it("does not pull a window off the true screen origin or slightly past an edge", () => {
    expect(applyLockedSize({ x: 0, y: 0, width: 420, height: 246 }, lock)).toEqual({
      x: 0,
      y: 0,
      width: 420,
      height: 246,
    });
    expect(applyLockedSize({ x: -12, y: -8, width: 420, height: 246 }, lock)).toEqual({
      x: -12,
      y: -8,
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

describe("placeChromeBounds", () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };

  it("keeps top-left when there is room for a temporary popup strip", () => {
    expect(
      placeChromeBounds({ x: 100, y: 80, width: 420, height: 246 }, { width: 660, height: 246 }, work),
    ).toEqual({ x: 100, y: 80, width: 660, height: 246 });
  });

  it("shifts left when the popup strip would run off the work area, without changing crop height", () => {
    const next = placeChromeBounds(
      { x: 1700, y: 20, width: 420, height: 246 },
      { width: 660, height: 246 },
      work,
    );
    expect(next.height).toBe(246);
    expect(next.width).toBe(660);
    expect(next.x + next.width).toBe(work.width);
  });
});
