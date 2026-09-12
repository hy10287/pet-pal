import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "../src/emotion/catalog";
import {
  createRetrievalState,
  intensityFit,
  rememberPlay,
  retrieve,
  retrievePair,
} from "../src/emotion/retrieve";
import type { EmotionIntent, MotionCatalog } from "../src/shared/types";

function loadSample(): MotionCatalog {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, "../fixtures/motions.tags.sample.json"), "utf8"),
  );
  return parseCatalog(raw);
}

function intent(partial: Partial<EmotionIntent> & Pick<EmotionIntent, "emotion">): EmotionIntent {
  return {
    intensity: 0.6,
    contextTags: [],
    ...partial,
  };
}

function always(value: number): () => number {
  return () => value;
}

describe("intensityFit", () => {
  it("returns 1 inside the range", () => {
    expect(intensityFit(0.5, [0.3, 0.8])).toBe(1);
  });

  it("decays outside the range", () => {
    expect(intensityFit(0.1, [0.4, 0.8])).toBeLessThan(1);
    expect(intensityFit(0.1, [0.4, 0.8])).toBeGreaterThan(0);
    expect(intensityFit(0, [0.9, 1])).toBe(0);
  });
});

describe("retrieve()", () => {
  const catalog = loadSample();

  it("hard-filters by emotion on the requested layer", () => {
    const result = retrieve(catalog, intent({ emotion: "shy" }), "face", createRetrievalState(), {
      rng: always(0),
    });
    expect(result.item).toBeTruthy();
    expect(result.item?.layer).toBe("face");
    expect(result.item?.exclusiveGroup).toBe("face");
    expect(result.item?.emotion).toContain("shy");
    expect(result.usedFallbackEmotion).toBe(false);
  });

  it("falls back to neutral when the emotion is missing", () => {
    const result = retrieve(
      catalog,
      intent({ emotion: "melancholy" }),
      "face",
      createRetrievalState(),
      { rng: always(0) },
    );
    expect(result.usedFallbackEmotion).toBe(true);
    expect(result.item?.emotion).toContain("neutral");
  });

  it("excludes eventOnly unless intent.event is set", () => {
    const blocked = retrieve(
      catalog,
      intent({ emotion: "sparkle", intensity: 0.95, contextTags: ["double"] }),
      "face",
      createRetrievalState(),
      { rng: always(0) },
    );
    expect(blocked.item?.eventOnly ?? false).toBe(false);

    const allowed = retrieve(
      catalog,
      intent({ emotion: "sparkle", intensity: 0.95, contextTags: ["double"], event: true }),
      "face",
      createRetrievalState(),
      { rng: always(0) },
    );
    expect(allowed.item?.eventOnly).toBe(true);
    // face_excited_sparkle scores above face_sparkle_burst (extra context hit + higher weight).
    expect(allowed.item?.id).toBe("face_excited_sparkle");
    expect(allowed.item?.emotion).toEqual(expect.arrayContaining(["sparkle"]));
  });

  it("adds score for matching variant, context, and styleHint", () => {
    const base = retrieve(
      catalog,
      intent({ emotion: "happy", intensity: 0.6 }),
      "face",
      createRetrievalState(),
      { rng: always(0) },
    );
    const boosted = retrieve(
      catalog,
      intent({
        emotion: "happy",
        variant: "smile",
        intensity: 0.6,
        contextTags: ["click", "head"],
        styleHint: "warm",
      }),
      "face",
      createRetrievalState(),
      { rng: always(0) },
    );
    expect(boosted.score).toBeGreaterThan(base.score);
    expect(boosted.item?.id).toBe("face_happy_smile");
  });

  it("prefers intensityFit when two clips share an emotion", () => {
    const soft = retrieve(
      catalog,
      intent({ emotion: "happy", intensity: 0.4, contextTags: ["click"] }),
      "face",
      createRetrievalState(),
      { rng: always(0) },
    );
    const intense = retrieve(
      catalog,
      intent({ emotion: "happy", intensity: 0.95, contextTags: ["play"], styleHint: "bright" }),
      "face",
      createRetrievalState(),
      { rng: always(0) },
    );
    expect(soft.item?.id).toBe("face_happy_smile");
    // At intensity 0.95 + styleHint bright + context play, face_happy_grin beats
    // face_happy_intense on item.weight while sharing the same intensityFit/style/context.
    expect(intense.item?.id).toBe("face_happy_grin");
  });

  it("honors cooldown and anti-repeat", () => {
    const state = createRetrievalState();
    const first = retrieve(catalog, intent({ emotion: "curious", variant: "look" }), "face", state, {
      now: 1_000,
      rng: always(0),
    });
    expect(first.item?.id).toBe("face_curious_look");
    rememberPlay(state, first.item, 1_000);

    const duringCooldown = retrieve(
      catalog,
      intent({ emotion: "curious", variant: "look" }),
      "face",
      state,
      { now: 2_000, rng: always(0) },
    );
    expect(duringCooldown.item?.id).not.toBe("face_curious_look");

    const afterCooldown = retrieve(
      catalog,
      intent({ emotion: "curious", variant: "look" }),
      "face",
      state,
      { now: 1_000 + catalog.retrieval.cooldownMs + 10, rng: always(0) },
    );
    expect(afterCooldown.item?.id).toBe("face_curious_look");
  });

  it("picks among top-N using the supplied rng", () => {
    const a = retrieve(
      catalog,
      intent({ emotion: "neutral", intensity: 0.2, contextTags: ["idle"], styleHint: "soft" }),
      "body",
      createRetrievalState(),
      { rng: always(0) },
    );
    const b = retrieve(
      catalog,
      intent({ emotion: "neutral", intensity: 0.2, contextTags: ["idle"], styleHint: "soft" }),
      "body",
      createRetrievalState(),
      { rng: always(0.99) },
    );
    expect(a.item?.id).not.toBe(b.item?.id);
    expect(a.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("retrieves face + body together without crossing exclusive groups", () => {
    const pair = retrievePair(
      catalog,
      intent({
        emotion: "excited",
        variant: "sparkle",
        intensity: 0.92,
        contextTags: ["click", "double"],
        styleHint: "bright",
        event: true,
      }),
      { face: createRetrievalState(), body: createRetrievalState() },
      { rng: always(0) },
    );
    expect(pair.face.item?.layer).toBe("face");
    expect(pair.body.item?.layer).toBe("body");
    expect(pair.face.item?.exclusiveGroup).toBe("face");
    expect(pair.body.item?.exclusiveGroup).toBe("body");
    expect(pair.face.item?.id).toMatch(/sparkle|excited/);
    expect(pair.body.item?.id).toMatch(/sparkle|excited/);
  });

  it("parses the shipped sample catalog as schemaVersion 1", () => {
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.items.length).toBeGreaterThanOrEqual(20);
    expect(catalog.items.length).toBeLessThanOrEqual(30);
    expect(catalog.items.every((item) => item.exclusiveGroup === item.layer)).toBe(true);
  });
});
