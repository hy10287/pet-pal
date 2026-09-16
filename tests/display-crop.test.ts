import { describe, expect, it } from "vitest";
import { applyStageCrop, bottomPinFromLocalBottom, bottomPinHome } from "../src/renderer/display-crop";
import { DEFAULT_FULL_WINDOW } from "../src/shared/display-preset";

describe("applyStageCrop", () => {
  it("locks #stage to the crop so a taller chrome window cannot stretch it", () => {
    const style: Record<string, string> = {};
    const stage = { style } as unknown as HTMLElement;
    const size = applyStageCrop(stage, { ...DEFAULT_FULL_WINDOW }, "standard");
    expect(size).toEqual({ width: 420, height: 325 });
    expect(style.width).toBe("420px");
    expect(style.height).toBe("325px");
    expect(style.maxHeight).toBe("325px");
    expect(style.minHeight).toBe("325px");
    expect(style.overflow).toBe("hidden");
  });
});

describe("bottomPinHome", () => {
  it("pins the full-body floor to the window bottom so scale grows upward", () => {
    expect(bottomPinHome(420, 560, 1, 560)).toEqual({ x: 210, y: 560 });
    expect(bottomPinHome(420, 560, 1.8, 560).y).toBe(560);
    expect(bottomPinHome(420, 560, 0.6, 560).y).toBe(560);
  });

  it("keeps the crop's bottom edge as the scale origin", () => {
    const cropH = 179;
    const fullH = 560;
    expect(bottomPinHome(420, cropH, 1, fullH).y).toBe(fullH);
    const grown = bottomPinHome(420, cropH, 1.8, fullH);
    expect(grown.y).toBe(cropH + (fullH - cropH) * 1.8);
    expect(grown.y - cropH).toBeCloseTo((fullH - cropH) * 1.8);
  });

  it("clamps the slider so pin math matches visualScale", () => {
    expect(bottomPinHome(420, 179, 9, 560).y).toBe(bottomPinHome(420, 179, 1.8, 560).y);
    expect(bottomPinHome(420, 179, 0.1, 560).y).toBe(bottomPinHome(420, 179, 0.6, 560).y);
  });
});

describe("bottomPinFromLocalBottom", () => {
  it("maps the fallback local bottom onto the same floor", () => {
    const localBottom = 170;
    const at1 = bottomPinFromLocalBottom(420, 560, localBottom, 1, 1, 560);
    expect(at1.y + localBottom).toBe(560);
    const grown = bottomPinFromLocalBottom(420, 560, localBottom, 1, 1.5, 560);
    expect(grown.y + localBottom * 1.5).toBe(560);
  });
});
