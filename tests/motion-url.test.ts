import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/shared/types";
import {
  catalogMotionRefs,
  joinMotionUrl,
  motionUrlsForItem,
  pickMotionUrls,
} from "../src/renderer/motion-url";

function item(partial: Partial<CatalogItem> & Pick<CatalogItem, "id">): CatalogItem {
  return {
    file: "",
    path: "",
    layer: "face",
    exclusiveGroup: "face",
    emotion: ["neutral"],
    variant: [],
    gestures: [],
    style: [],
    intensity: [0, 1],
    context: [],
    eventOnly: false,
    weight: 1,
    duration: 2,
    loop: false,
    tags: [],
    ...partial,
  };
}

describe("joinMotionUrl", () => {
  it("joins a file:// motionsDir with a relative path", () => {
    expect(joinMotionUrl("file:///C:/Live2D/motions", "face_lookaway_01r.motion3.json")).toBe(
      "file:///C:/Live2D/motions/face_lookaway_01r.motion3.json",
    );
  });

  it("encodes spaces but keeps slashes", () => {
    expect(joinMotionUrl("http://127.0.0.1:43187/motions", "body/w adult.motion3.json")).toBe(
      "http://127.0.0.1:43187/motions/body/w%20adult.motion3.json",
    );
  });

  it("returns absolute file/http refs unchanged", () => {
    expect(joinMotionUrl("/motions", "file:///C:/clip.motion3.json")).toBe("file:///C:/clip.motion3.json");
  });

  it("returns null without a base or relative path", () => {
    expect(joinMotionUrl(null, "a.motion3.json")).toBeNull();
    expect(joinMotionUrl("/motions", "")).toBeNull();
  });
});

describe("catalogMotionRefs", () => {
  it("prefers path then file", () => {
    expect(catalogMotionRefs(item({ id: "x", path: "a.json", file: "b.json" }))).toEqual(["a.json", "b.json"]);
  });

  it("falls back to id.motion3.json when path and file are empty", () => {
    expect(catalogMotionRefs(item({ id: "w-adult01-think" }))).toEqual(["w-adult01-think.motion3.json"]);
  });
});

describe("pickMotionUrls", () => {
  it("prefers the body clip when both layers have files", () => {
    const picked = pickMotionUrls(
      item({ id: "face_lookaway_01r", file: "face_lookaway_01r.motion3.json" }),
      item({ id: "w-adult01-think", file: "w-adult01-think.motion3.json", layer: "body", exclusiveGroup: "body" }),
      "file:///C:/Live2D/motions",
    );
    expect(picked.prefer).toBe("body");
    expect(picked.primary[0]).toContain("w-adult01-think.motion3.json");
  });

  it("uses the face clip when there is no body file", () => {
    const picked = pickMotionUrls(item({ id: "face_a", file: "face_a.motion3.json" }), null, "/motions");
    expect(picked.prefer).toBe("face");
    expect(picked.primary).toEqual(["/motions/face_a.motion3.json"]);
  });
});

describe("motionUrlsForItem", () => {
  it("returns nothing for a null item", () => {
    expect(motionUrlsForItem(null, "/motions")).toEqual([]);
  });
});
