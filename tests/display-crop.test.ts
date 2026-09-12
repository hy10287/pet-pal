import { describe, expect, it } from "vitest";
import { applyStageCrop } from "../src/renderer/display-crop";
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
