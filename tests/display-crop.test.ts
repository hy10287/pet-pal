import { describe, expect, it } from "vitest";
import { applyStageCrop, pinnedTopY } from "../src/renderer/display-crop";
import { fitScale, visualScale } from "../src/renderer/fit-scale";
import { DEFAULT_FULL_WINDOW, windowHeightForPreset } from "../src/shared/display-preset";
import type { DisplayPresetId } from "../src/shared/types";

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

describe("pinnedTopY", () => {
  it("pins the top edge to the window top when the sprite is taller than the crop", () => {
    expect(pinnedTopY(560, 246)).toBe(0);
    expect(pinnedTopY(1008, 246)).toBe(0);
  });

  it("centers the sprite when it fits inside the crop", () => {
    expect(pinnedTopY(210, 560)).toBe(175);
    expect(pinnedTopY(179, 179)).toBe(0);
  });

  it("keeps the sprite visible for every preset and user scale", () => {
    const presets: DisplayPresetId[] = ["compact", "balanced", "standard", "full"];
    const scales = [0.6, 1, 1.2, 1.8];
    const naturals: Array<[number, number]> = [
      [1000, 2000],
      [2000, 1000],
      [1200, 1300],
    ];
    for (const preset of presets) {
      const cropH = windowHeightForPreset(DEFAULT_FULL_WINDOW.height, preset);
      for (const s of scales) {
        for (const [w, h] of naturals) {
          const fitted = fitScale(w, h, 420, 560);
          const vis = visualScale(fitted, s);
          const boxHeight = h * vis;
          const top = pinnedTopY(boxHeight, cropH);
          const bottom = top + boxHeight;
          expect(top).toBeGreaterThanOrEqual(0);
          expect(bottom).toBeGreaterThan(0);
          expect(Math.min(top, cropH)).toBeLessThan(cropH);
        }
      }
    }
  });

  it("keeps the x anchor at the horizontal center", () => {
    const width = 420;
    const cropH = 246;
    const boxHeight = 560;
    const top = pinnedTopY(boxHeight, cropH);
    const home = { x: width / 2, y: top + boxHeight };
    expect(home.x).toBe(210);
    expect(top).toBe(0);
  });
});
