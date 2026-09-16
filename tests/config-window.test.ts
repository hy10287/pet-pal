import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/main/config";

describe("loadAppConfig window baseline", () => {
  it("keeps an explicit window when displayPreset is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-config-"));
    writeFileSync(
      join(dir, "app.config.json"),
      JSON.stringify({
        displayPreset: "balanced",
        window: { width: 420, height: 246 },
      }),
    );
    const loaded = loadAppConfig("/nonexistent-nori-root", dir);
    expect(loaded.config.window.height).toBe(246);
    expect(loaded.config.window).toEqual({ width: 420, height: 246 });
    expect(loaded.config.displayPreset).toBe("balanced");
    expect(loaded.config.edgeSnap).toBe(false);
  });

  it("lifts a saved crop height when displayPreset is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-config-"));
    writeFileSync(join(dir, "app.config.json"), JSON.stringify({ window: { width: 420, height: 246 } }));
    const loaded = loadAppConfig("/nonexistent-nori-root", dir);
    expect(loaded.config.window.height).toBe(560);
    expect(loaded.config.window).toEqual({ width: 420, height: 560 });
  });

  it("only enables edge snap when the saved flag is true", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-config-"));
    writeFileSync(join(dir, "app.config.json"), JSON.stringify({ edgeSnap: true }));
    expect(loadAppConfig("/nonexistent-nori-root", dir).config.edgeSnap).toBe(true);
    const dirOff = mkdtempSync(join(tmpdir(), "nori-config-"));
    writeFileSync(join(dirOff, "app.config.json"), JSON.stringify({ edgeSnap: "yes" }));
    expect(loadAppConfig("/nonexistent-nori-root", dirOff).config.edgeSnap).toBe(false);
  });

  it("registers a main-process error handler", () => {
    const source = readFileSync(resolve(__dirname, "../src/main/index.ts"), "utf8");
    expect(source).toContain('process.on("uncaughtException"');
  });

  it("keeps a module-level tray reference", () => {
    const source = readFileSync(resolve(__dirname, "../src/main/index.ts"), "utf8");
    expect(source).toContain("let tray: Tray | null");
    expect(source).toContain("tray = createTray(");
  });
});
