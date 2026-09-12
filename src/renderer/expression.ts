import type { CatalogItem, EmotionIntent } from "../shared/types";

export type ExpressionParams = Record<string, number>;

/** Face channels only — never applied as a second Cubism motion group. */
export const FACE_PARAM_IDS = [
  "ParamEyeLOpen",
  "ParamEyeROpen",
  "ParamEyeLSmile",
  "ParamEyeRSmile",
  "ParamMouthForm",
  "ParamMouthOpenY",
  "ParamCheek",
  "ParamBrowLY",
  "ParamBrowRY",
  "ParamBrowLForm",
  "ParamBrowRForm",
  "ParamBreath",
] as const;


const BASE: ExpressionParams = {
  ParamEyeLOpen: 1,
  ParamEyeROpen: 1,
  ParamEyeLSmile: 0,
  ParamEyeRSmile: 0,
  ParamEyeBallX: 0,
  ParamEyeBallY: 0,
  ParamBrowLY: 0,
  ParamBrowRY: 0,
  ParamBrowLForm: 0,
  ParamBrowRForm: 0,
  ParamMouthForm: 0,
  ParamMouthOpenY: 0,
  ParamCheek: 0,
  ParamAngleX: 0,
  ParamAngleY: 0,
  ParamAngleZ: 0,
  ParamBodyAngleX: 0,
  ParamBreath: 0,
};

export function baseParams(): ExpressionParams {
  return { ...BASE };
}

function mix(target: ExpressionParams, patch: ExpressionParams, amount: number): void {
  for (const [key, value] of Object.entries(patch)) {
    target[key] = (target[key] ?? 0) + value * amount;
  }
}

export function paramsForClip(item: CatalogItem | null, intent: EmotionIntent | null): ExpressionParams {
  const out = baseParams();
  if (!item || !intent) return out;
  const intensity = Math.max(0.15, intent.intensity);
  const emotion = item.emotion[0] ?? intent.emotion;
  const variant = item.variant[0] ?? intent.variant ?? "";

  if (emotion === "happy" || variant === "smile" || variant === "grin" || variant === "laugh") {
    mix(
      out,
      {
        ParamEyeLSmile: 1,
        ParamEyeRSmile: 1,
        ParamMouthForm: variant === "grin" || variant === "laugh" ? 1 : 0.7,
        ParamMouthOpenY: variant === "laugh" ? 0.45 : 0.12,
        ParamBrowLY: 0.25,
        ParamBrowRY: 0.25,
      },
      intensity,
    );
  }

  if (emotion === "shy" || variant === "blush") {
    mix(
      out,
      {
        ParamCheek: 1,
        ParamEyeLOpen: -0.12,
        ParamEyeROpen: -0.12,
        ParamMouthForm: 0.25,
        ParamAngleX: variant === "glance" ? -8 : 5,
        ParamAngleZ: -7,
        ParamBrowLForm: -0.2,
        ParamBrowRForm: -0.2,
      },
      intensity,
    );
  }

  if (emotion === "excited" || emotion === "sparkle" || variant === "sparkle" || variant === "wow") {
    mix(
      out,
      {
        ParamEyeLOpen: 0.15,
        ParamEyeROpen: 0.15,
        ParamMouthOpenY: 0.55,
        ParamMouthForm: 0.4,
        ParamBrowLY: 0.4,
        ParamBrowRY: 0.4,
      },
      intensity,
    );
  }

  if (emotion === "curious" || variant === "look" || variant === "wide") {
    mix(
      out,
      {
        ParamEyeLOpen: 0.12,
        ParamEyeROpen: 0.12,
        ParamMouthForm: 0.1,
        ParamAngleZ: 10,
        ParamAngleX: 6,
        ParamBrowLY: 0.2,
        ParamBrowRY: -0.05,
      },
      intensity,
    );
  }

  if (emotion === "acknowledge" || variant === "nod" || variant === "tilthead" || variant === "bow") {
    mix(
      out,
      {
        ParamMouthForm: 0.2,
        ParamEyeLSmile: 0.25,
        ParamEyeRSmile: 0.25,
      },
      intensity,
    );
  }

  if (variant === "breath" || variant === "soft" || emotion === "neutral") {
    mix(out, { ParamBreath: 0.6, ParamMouthForm: 0.05 }, Math.max(0.2, 1 - intensity));
  }

  return out;
}

export function motionOffsets(
  item: CatalogItem | null,
  t: number,
): { nod: number; tilt: number; bounce: number; sway: number; sparkle: number } {
  if (!item) return { nod: 0, tilt: 0, bounce: 0, sway: 0, sparkle: 0 };
  const tags = `${item.id} ${item.variant.join(" ")} ${item.gestures.join(" ")}`.toLowerCase();
  const wave = Math.sin(t * Math.PI * 2);
  return {
    nod: tags.includes("nod") || tags.includes("bow") ? Math.sin(t * Math.PI * 2.2) * 10 : 0,
    tilt: tags.includes("tilt") ? Math.sin(t * Math.PI) * 12 : 0,
    bounce: tags.includes("bounce") || tags.includes("jump") ? Math.abs(Math.sin(t * Math.PI * 2.4)) * 16 : 0,
    sway: tags.includes("sway") || tags.includes("breath") ? wave * 4 : 0,
    sparkle: tags.includes("sparkle") || tags.includes("excited") ? 1 : 0,
  };
}

export function lerpParams(from: ExpressionParams, to: ExpressionParams, t: number): ExpressionParams {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const out: ExpressionParams = {};
  for (const key of keys) {
    const a = from[key] ?? 0;
    const b = to[key] ?? 0;
    out[key] = a + (b - a) * t;
  }
  return out;
}
