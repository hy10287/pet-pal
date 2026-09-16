import { describe, expect, it } from "vitest";
import { popupWindowBounds, sidePanelRect } from "../src/shared/ui-chrome";

describe("popupWindowBounds", () => {
  it("grows the window to the right when there is room", () => {
    const stage = { x: 100, y: 100, width: 420, height: 246 };
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
    const { bounds, side } = popupWindowBounds(stage, workArea);
    expect(side).toBe("right");
    expect(bounds).toEqual({ x: 100, y: 100, width: 660, height: 246 });
  });

  it("grows to the left when the pet is at the right screen edge", () => {
    const stage = { x: 1480, y: 100, width: 420, height: 246 };
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
    const { bounds, side } = popupWindowBounds(stage, workArea);
    expect(side).toBe("left");
    expect(bounds.x).toBe(1480 - 240);
  });

  it("keeps the stage exactly where it was on screen", () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
    const rightStage = { x: 100, y: 100, width: 420, height: 246 };
    const right = popupWindowBounds(rightStage, workArea);
    expect(right.side === "right" ? right.bounds.x === rightStage.x : right.bounds.x + 240 === rightStage.x).toBe(true);
    const leftStage = { x: 1480, y: 100, width: 420, height: 246 };
    const left = popupWindowBounds(leftStage, workArea);
    expect(left.side === "right" ? left.bounds.x === leftStage.x : left.bounds.x + 240 === leftStage.x).toBe(true);
  });

  it("clamps into the work area when neither side has full room", () => {
    const stage = { x: 200, y: 100, width: 420, height: 246 };
    const workArea = { x: 0, y: 0, width: 700, height: 1040 };
    const { bounds } = popupWindowBounds(stage, workArea);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(700);
  });

  it("puts the panel rect beside the stage for both sides", () => {
    expect(sidePanelRect("right", { width: 420, height: 246 })).toEqual({
      x: 428,
      y: 8,
      width: 232,
      height: 230,
    });
    expect(sidePanelRect("left", { width: 420, height: 246 }).x).toBe(8);
    expect(sidePanelRect("left", { width: 420, height: 246 }).height).toBe(230);
  });
});
