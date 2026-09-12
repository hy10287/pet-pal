import type { EmotionIntent, InteractionKind } from "../shared/types";

export type Rng = () => number;

const HEAD_EMOTIONS = ["shy", "happy"] as const;
const RANDOM_EMOTIONS = ["happy", "shy", "curious", "excited"] as const;
const BODY_VARIANTS = ["nod", "tilthead"] as const;

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))] as T;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function vary(base: number, spread: number, rng: Rng): number {
  return clamp01(base + (rng() - 0.5) * spread);
}

/**
 * Local interaction → EmotionIntent router.
 * No cloud model required. `classifyIntentFromText` is a future-API stub.
 */
export function routeInteraction(
  kind: InteractionKind,
  rng: Rng = Math.random,
): EmotionIntent {
  switch (kind) {
    case "head-click": {
      const emotion = pick(HEAD_EMOTIONS, rng);
      return {
        emotion,
        variant: emotion === "shy" ? "blush" : "smile",
        intensity: vary(0.66, 0.18, rng),
        contextTags: ["click", "head"],
        styleHint: emotion === "shy" ? "soft" : "warm",
      };
    }
    case "head-pat": {
      const emotion = pick(HEAD_EMOTIONS, rng);
      return {
        emotion,
        variant: emotion === "shy" ? "blush" : "smile",
        intensity: vary(0.72, 0.16, rng),
        contextTags: ["pat", "head"],
        styleHint: emotion === "shy" ? "soft" : "warm",
      };
    }
    case "chat":
      return {
        emotion: "acknowledge",
        variant: pick(BODY_VARIANTS, rng),
        intensity: vary(0.5, 0.14, rng),
        contextTags: ["chat", "local-stub"],
        styleHint: "quiet",
      };
    case "body-click":
      return {
        emotion: "acknowledge",
        variant: pick(BODY_VARIANTS, rng),
        intensity: vary(0.48, 0.16, rng),
        contextTags: ["click", "body"],
        styleHint: "quiet",
      };
    case "double-click":
      return {
        emotion: "excited",
        variant: "sparkle",
        intensity: vary(0.9, 0.1, rng),
        contextTags: ["click", "double"],
        styleHint: "bright",
        event: true,
      };
    case "hover-dwell":
      return {
        emotion: "curious",
        variant: "look",
        intensity: vary(0.5, 0.14, rng),
        contextTags: ["hover", "dwell"],
        styleHint: "soft",
      };
    case "random": {
      const emotion = pick(RANDOM_EMOTIONS, rng);
      return {
        emotion,
        intensity: vary(0.7, 0.2, rng),
        contextTags: ["play"],
        styleHint: emotion === "shy" ? "soft" : "bright",
        event: emotion === "excited",
      };
    }
    case "menu-idle":
    case "idle":
    default:
      return {
        emotion: "neutral",
        variant: rng() > 0.55 ? "breath" : "pose",
        intensity: vary(0.22, 0.12, rng),
        contextTags: ["idle"],
        styleHint: "soft",
      };
  }
}

/** Optional stub for a future remote emotion classifier. */
export async function classifyIntentFromText(_text: string): Promise<EmotionIntent | null> {
  return null;
}
