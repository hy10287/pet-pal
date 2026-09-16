import { describe, expect, it } from "vitest";
import { EDGE_SNAP_PX } from "../src/shared/edge-snap";
import { boundsDeficit, clampPlaceShift, snapWindowByVisual, visualPadding } from "../src/shared/edge-place";

const view = { width: 420, height: 560 };
const visual = { x: 80, y: 40, width: 260, height: 500 };

describe("visualPadding", () => {
  it("measures empty canvas around the drawable", () => {
    expect(visualPadding(view, visual)).toEqual({ left: 80, right: 80, top: 40, bottom: 20 });
  });

  it("is zero when the drawable fills the crop", () => {
    expect(visualPadding(view, { x: 0, y: 0, ...view })).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });
});

describe("clampPlaceShift", () => {
  const pad = visualPadding(view, visual);

  it("shifts the character left when Windows refuses a negative HWND x", () => {
    expect(clampPlaceShift({ x: -80, y: 0 }, pad)).toEqual({ x: -80, y: 0 });
    expect(clampPlaceShift({ x: -200, y: 0 }, pad)).toEqual({ x: -80, y: 0 });
  });

  it("shifts up so the head can sit on the true top edge", () => {
    expect(clampPlaceShift({ x: 0, y: -40 }, pad)).toEqual({ x: 0, y: -40 });
    expect(clampPlaceShift({ x: 0, y: -90 }, pad)).toEqual({ x: 0, y: -40 });
  });

  it("does not shift past the opposite padding", () => {
    expect(clampPlaceShift({ x: 80, y: 20 }, pad)).toEqual({ x: 80, y: 20 });
    expect(clampPlaceShift({ x: 120, y: 40 }, pad)).toEqual({ x: 80, y: 20 });
  });
});

describe("boundsDeficit", () => {
  it("is desired minus the clamped HWND", () => {
    expect(boundsDeficit({ x: -80, y: -12 }, { x: 0, y: 0 })).toEqual({ x: -80, y: -12 });
  });
});

describe("snapWindowByVisual", () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };

  it("snaps the drawable to the screen origin, even if that hangs the window off-screen", () => {
    const origin = snapWindowByVisual({ x: 6 - visual.x, y: 5 - visual.y }, visual, area, true, EDGE_SNAP_PX);
    expect(origin).toEqual({ x: -80, y: -40 });
  });

  it("does nothing when the switch is off", () => {
    expect(snapWindowByVisual({ x: 6, y: 5 }, visual, area, false)).toEqual({ x: 6, y: 5 });
  });

  it("snaps the drawable to the right/bottom screen edges", () => {
    const origin = snapWindowByVisual(
      { x: area.width - visual.x - visual.width - 4, y: area.height - visual.y - visual.height - 3 },
      visual,
      area,
      true,
    );
    expect(origin.x + visual.x + visual.width).toBe(area.width);
    expect(origin.y + visual.y + visual.height).toBe(area.height);
  });
});
