import { describe, expect, it } from "vitest";
import { EDGE_SNAP_PX, snapRectToEdges } from "../src/shared/edge-snap";

const area = { x: 0, y: 0, width: 1920, height: 1040 };
const pet = { width: 420, height: 246 };

describe("snapRectToEdges", () => {
  it("does nothing when the switch is off", () => {
    const rect = { x: 4, y: 3, ...pet };
    expect(snapRectToEdges(rect, area, false)).toEqual({ x: 4, y: 3, ...pet });
  });

  it("snaps to the left/top when within 8px of the work-area edge", () => {
    expect(snapRectToEdges({ x: 8, y: 8, ...pet }, area, true)).toEqual({ x: 0, y: 0, ...pet });
    expect(snapRectToEdges({ x: EDGE_SNAP_PX, y: 40, ...pet }, area, true).x).toBe(0);
  });

  it("does not snap when farther than 8px", () => {
    const rect = { x: 9, y: 40, ...pet };
    expect(snapRectToEdges(rect, area, true)).toEqual(rect);
  });

  it("snaps to the right and bottom edges", () => {
    const x = area.width - pet.width - 5;
    const y = area.height - pet.height - 2;
    const snapped = snapRectToEdges({ x, y, ...pet }, area, true);
    expect(snapped.x).toBe(area.width - pet.width);
    expect(snapped.y).toBe(area.height - pet.height);
  });

  it("lets a later drag-end away from the edge keep the new position (no lock)", () => {
    const snapped = snapRectToEdges({ x: 2, y: 2, ...pet }, area, true);
    expect(snapped.x).toBe(0);
    const draggedAway = snapRectToEdges({ x: 24, y: 30, ...pet }, area, true);
    expect(draggedAway).toEqual({ x: 24, y: 30, ...pet });
  });
});
