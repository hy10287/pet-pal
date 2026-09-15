import { describe, expect, it } from "vitest";
import { DRAG_OVERRIDE, DRAG_THRESHOLD, resolvePointerGesture } from "../src/interaction/head-pat";

function gesture(
  partial: Partial<Parameters<typeof resolvePointerGesture>[0]> & { dx: number; dy: number },
) {
  return resolvePointerGesture({
    button: 0,
    downZone: "body",
    decided: "none",
    ...partial,
  });
}

describe("resolvePointerGesture", () => {
  it("treats sub-threshold movement as a click, not a window drag", () => {
    expect(gesture({ dx: 3, dy: 4, downZone: "head" })).toBe("none");
    expect(gesture({ dx: DRAG_THRESHOLD - 1, dy: 0, downZone: "body" })).toBe("none");
  });

  it("starts a window drag from the body once the pointer travels far enough", () => {
    expect(gesture({ dx: 0, dy: 16, downZone: "body" })).toBe("window-drag");
  });

  it("does not lock the window to a head-pat: far travel becomes a drag", () => {
    const pat = gesture({ dx: 18, dy: 2, downZone: "head" });
    expect(pat).toBe("head-pat");
    expect(
      resolvePointerGesture({
        button: 0,
        downZone: "head",
        dx: DRAG_OVERRIDE,
        dy: 4,
        decided: "head-pat",
      }),
    ).toBe("window-drag");
  });

  it("keeps a decided window-drag so a later tiny move cannot fire a click", () => {
    expect(
      resolvePointerGesture({
        button: 0,
        downZone: "face",
        dx: 1,
        dy: 1,
        decided: "window-drag",
      }),
    ).toBe("window-drag");
  });

  it("ignores empty-space strokes so click-through pixels do not steal the window", () => {
    expect(gesture({ dx: 40, dy: 40, downZone: "empty" })).toBe("none");
  });
});
