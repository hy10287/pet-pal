import { describe, expect, it } from "vitest";
import {
  DEFAULT_FULL_WINDOW,
  DEFAULT_MENU_CHROME,
  MENU_CHROME_PAD,
  MIN_WINDOW_HEIGHT,
  croppedWindowSize,
  displayWindowSize,
  parseDisplayPreset,
  resolveFullWindow,
  windowHeightForPreset,
} from "../src/shared/display-preset";

const FULL = { width: DEFAULT_FULL_WINDOW.width, height: DEFAULT_FULL_WINDOW.height };

describe("windowHeightForPreset", () => {
  it("uses the documented crop fractions of the full-body baseline", () => {
    expect(windowHeightForPreset(560, "compact")).toBe(179);
    expect(windowHeightForPreset(560, "balanced")).toBe(246);
    expect(windowHeightForPreset(560, "standard")).toBe(325);
    expect(windowHeightForPreset(560, "full")).toBe(560);
  });

  it("clamps to MIN_WINDOW_HEIGHT without collapsing every preset", () => {
    expect(windowHeightForPreset(200, "compact")).toBe(MIN_WINDOW_HEIGHT);
    expect(windowHeightForPreset(200, "balanced")).toBe(MIN_WINDOW_HEIGHT);
    expect(windowHeightForPreset(200, "standard")).toBeGreaterThan(MIN_WINDOW_HEIGHT);
  });
});

describe("croppedWindowSize", () => {
  it("changes only height; width and scale reference stay the baseline", () => {
    const compact = croppedWindowSize(FULL, "compact");
    const full = croppedWindowSize(FULL, "full");
    expect(compact.width).toBe(FULL.width);
    expect(full.width).toBe(FULL.width);
    expect(compact.height).toBeLessThan(full.height);
    expect(full.height).toBe(FULL.height);
  });
});

describe("resolveFullWindow", () => {
  it("keeps a real full-body baseline", () => {
    expect(resolveFullWindow(FULL)).toEqual(FULL);
    expect(resolveFullWindow({ width: 480, height: 720 })).toEqual({ width: 480, height: 720 });
  });

  it("recovers when AppData saved a crop of the default baseline", () => {
    expect(resolveFullWindow({ width: 420, height: 179 }).height).toBe(560);
    expect(resolveFullWindow({ width: 420, height: 246 }).height).toBe(560);
    expect(resolveFullWindow({ width: 420, height: 325 }).height).toBe(560);
  });

  it("recovers a baseline too short to tell compact from balanced", () => {
    expect(resolveFullWindow({ width: 420, height: 200 }).height).toBe(560);
  });

  it("falls back for invalid numbers", () => {
    expect(resolveFullWindow({ width: NaN, height: 0 })).toEqual(FULL);
    expect(resolveFullWindow(null)).toEqual(FULL);
  });
});

describe("displayWindowSize", () => {
  it("matches the crop when HUD/menu are closed", () => {
    for (const id of ["compact", "balanced", "standard", "full"] as const) {
      expect(displayWindowSize(FULL, id)).toEqual(croppedWindowSize(FULL, id));
      expect(displayWindowSize(FULL, id, { hudOn: false, menuOpen: false })).toEqual(croppedWindowSize(FULL, id));
    }
  });

  it("does not jump to the full baseline just because HUD is on", () => {
    expect(displayWindowSize(FULL, "compact", { hudOn: true }).height).toBe(179);
    expect(displayWindowSize(FULL, "balanced", { hudOn: true }).height).toBe(246);
    expect(displayWindowSize(FULL, "standard", { hudOn: true }).height).toBe(325);
    expect(displayWindowSize(FULL, "full", { hudOn: true }).height).toBe(560);
  });

  it("keeps four distinct heights with HUD on so switching presets is visible", () => {
    const heights = (["compact", "balanced", "standard", "full"] as const).map(
      (id) => displayWindowSize(FULL, id, { hudOn: true }).height,
    );
    expect(new Set(heights).size).toBe(4);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });

  it("may grow for a tall menu but stays cropped after close", () => {
    const open = displayWindowSize(FULL, "compact", { menuOpen: true, menuHeight: 420 });
    expect(open.height).toBe(420 + MENU_CHROME_PAD);
    expect(open.height).toBeLessThan(FULL.height);
    expect(displayWindowSize(FULL, "compact", { menuOpen: false }).height).toBe(179);
  });

  it("uses a default menu chrome when height was not measured, not the full baseline", () => {
    const open = displayWindowSize(FULL, "balanced", { menuOpen: true });
    expect(open.height).toBe(DEFAULT_MENU_CHROME);
    expect(open.height).not.toBe(FULL.height);
  });

  it("never grows past the full-body baseline", () => {
    const open = displayWindowSize(FULL, "compact", { menuOpen: true, menuHeight: 900 });
    expect(open.height).toBe(FULL.height);
  });
});

describe("parseDisplayPreset", () => {
  it("accepts the four ids and defaults the rest", () => {
    expect(parseDisplayPreset("compact")).toBe("compact");
    expect(parseDisplayPreset("nope")).toBe("balanced");
  });
});
