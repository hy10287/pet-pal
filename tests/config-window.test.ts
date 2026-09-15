import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/main/config";

describe("loadAppConfig window baseline", () => {
  it("lifts a saved crop height back to the full-body baseline", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-config-"));
    writeFileSync(
      join(dir, "app.config.json"),
      JSON.stringify({
        displayPreset: "balanced",
        window: { width: 420, height: 246 },
      }),
    );
    const loaded = loadAppConfig("/nonexistent-nori-root", dir);
    expect(loaded.config.window).toEqual({ width: 420, height: 560 });
    expect(loaded.config.displayPreset).toBe("balanced");
    expect(loaded.config.edgeSnap).toBe(false);
  });

  it("only enables edge snap when the saved flag is true", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-config-"));
    writeFileSync(join(dir, "app.config.json"), JSON.stringify({ edgeSnap: true }));
    expect(loadAppConfig("/nonexistent-nori-root", dir).config.edgeSnap).toBe(true);
    const dirOff = mkdtempSync(join(tmpdir(), "nori-config-"));
    writeFileSync(join(dirOff, "app.config.json"), JSON.stringify({ edgeSnap: "yes" }));
    expect(loadAppConfig("/nonexistent-nori-root", dirOff).config.edgeSnap).toBe(false);
  });
});
