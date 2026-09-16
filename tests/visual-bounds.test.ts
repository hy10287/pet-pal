import { describe, expect, it } from "vitest";
import {
  canvasRectToLocal,
  unionDrawableCanvasRect,
  worldRectFromBottomCenter,
} from "../src/renderer/visual-bounds";

describe("unionDrawableCanvasRect", () => {
  it("unions visible drawable AABBs and skips empty/hidden ones", () => {
    const bounds = [
      { x: 200, y: 80, width: 400, height: 700 },
      { x: 0, y: 0, width: 1024, height: 1024 },
      { x: 10, y: 10, width: 2, height: 2 },
    ];
    const rect = unionDrawableCanvasRect({
      getDrawableIDs: () => ["body", "bg", "dot"],
      getDrawableBounds: (index) => bounds[index]!,
      coreModel: {
        getDrawableOpacity: (index) => (index === 1 ? 0 : 1),
        getDrawableDynamicFlagIsVisible: () => true,
      },
    });
    expect(rect).toEqual({ x: 200, y: 80, width: 400, height: 700 });
  });

  it("returns null when the model has no usable meshes yet", () => {
    expect(
      unionDrawableCanvasRect({
        getDrawableIDs: () => [],
        getDrawableBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      }),
    ).toBeNull();
  });
});

describe("canvasRectToLocal / worldRectFromBottomCenter", () => {
  it("maps canvas-space drawables through layout scale and bottom-center anchor", () => {
    const canvas = { x: 100, y: 50, width: 200, height: 400 };
    const local = canvasRectToLocal(
      { originalWidth: 1000, originalHeight: 1000, width: 500, height: 500 },
      canvas,
    );
    expect(local).toEqual({ x: 50, y: 25, width: 100, height: 200 });

    const world = worldRectFromBottomCenter({ x: 210, y: 560 }, 1, local, { width: 500, height: 500 });
    expect(world).toEqual({
      x: 210 + (50 - 250),
      y: 560 + (25 - 500),
      width: 100,
      height: 200,
    });
  });
});
