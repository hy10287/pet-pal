import { describe, expect, it } from "vitest";
import { shouldDismissMenu } from "../src/renderer/menu";

describe("shouldDismissMenu", () => {
  it("does not dismiss clicks that belong to the menu", () => {
    expect(shouldDismissMenu(0, 1000, true)).toBe(false);
  });

  it("ignores the right-click that just opened the menu", () => {
    expect(shouldDismissMenu(1000, 1100, false, 280)).toBe(false);
  });

  it("dismisses a later click outside the menu", () => {
    expect(shouldDismissMenu(1000, 1400, false, 280)).toBe(true);
  });
});
