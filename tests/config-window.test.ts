import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModel3Json, loadAppConfig, LOCAL_TEST_MODEL_DIR, resolveLive2DModelFile } from "../src/main/config";

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

describe("findModel3Json", () => {
  it("returns a .model3.json file as-is", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-model-"));
    const file = join(dir, "hiyori.model3.json");
    writeFileSync(file, "{}");
    expect(findModel3Json(file)).toBe(file);
  });

  it("scans a folder for the first .model3.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-model-"));
    const nested = join(dir, "runtime");
    mkdirSync(nested);
    const file = join(nested, "nori.model3.json");
    writeFileSync(file, "{}");
    expect(findModel3Json(dir)).toBe(file);
  });

  it("ignores unrelated json files", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-model-"));
    writeFileSync(join(dir, "cdi3.json"), "{}");
    expect(findModel3Json(dir)).toBe("");
  });
});

describe("resolveLive2DModelFile", () => {
  it("resolves a configured directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-model-"));
    const file = join(dir, "pet.model3.json");
    writeFileSync(file, "{}");
    expect(resolveLive2DModelFile("/unused-root", dir)).toBe(file);
  });

  it("names the Windows placeholder folder", () => {
    expect(LOCAL_TEST_MODEL_DIR).toBe("C:/Users/33166/Desktop/新建文件夹 (3)");
  });

  it("prefers NORI_MODEL_PATH over an empty config path", () => {
    const dir = mkdtempSync(join(tmpdir(), "nori-model-"));
    const file = join(dir, "env.model3.json");
    writeFileSync(file, "{}");
    const prev = process.env.NORI_MODEL_PATH;
    process.env.NORI_MODEL_PATH = dir;
    try {
      expect(resolveLive2DModelFile("/unused-root", "")).toBe(file);
    } finally {
      if (prev === undefined) delete process.env.NORI_MODEL_PATH;
      else process.env.NORI_MODEL_PATH = prev;
    }
  });

  it("falls through when the Windows test folder is missing", () => {
    expect(resolveLive2DModelFile("/unused-root", "")).toBe("");
  });
});
