import { describe, expect, it } from "vitest";
import { PET_WINDOW_CHROME } from "../src/shared/pet-window-chrome";

describe("PET_WINDOW_CHROME", () => {
  it("drops the Windows thick frame so the HWND can sit on true screen edges", () => {
    expect(PET_WINDOW_CHROME.frame).toBe(false);
    expect(PET_WINDOW_CHROME.thickFrame).toBe(false);
    expect(PET_WINDOW_CHROME.roundedCorners).toBe(false);
    expect(PET_WINDOW_CHROME.enableLargerThanScreen).toBe(true);
    expect(PET_WINDOW_CHROME.skipTaskbar).toBe(true);
    expect(PET_WINDOW_CHROME.resizable).toBe(false);
    expect(PET_WINDOW_CHROME.hasShadow).toBe(false);
  });
});
