/** Stretch .motion3 timeline so catalog clips play slower than raw Cubism timing. */
export const MOTION_TIME_SCALE = 1.65;
export const MOTION_FADE_IN = 0.55;
export const MOTION_FADE_OUT = 0.72;

const SEG_LINEAR = 0;
const SEG_BEZIER = 1;
const SEG_STEPPED = 2;
const SEG_INV_STEPPED = 3;

/**
 * Scale every keyframe time in a Cubism 3/4 motion JSON.
 * Segment types: 0 linear, 1 bezier, 2 stepped, 3 inverse-stepped.
 */
export function slowMotion3(data: object, scale = MOTION_TIME_SCALE): object {
  const copy = structuredClone(data) as {
    Meta?: { Duration?: number; FadeInTime?: number; FadeOutTime?: number };
    Curves?: Array<{ Segments?: number[] }>;
  };

  if (copy.Meta) {
    if (typeof copy.Meta.Duration === "number") {
      copy.Meta.Duration = Number((copy.Meta.Duration * scale).toFixed(4));
    }
    copy.Meta.FadeInTime = Math.max(MOTION_FADE_IN, (copy.Meta.FadeInTime ?? 0) * scale);
    copy.Meta.FadeOutTime = Math.max(MOTION_FADE_OUT, (copy.Meta.FadeOutTime ?? 0) * scale);
  }

  for (const curve of copy.Curves ?? []) {
    if (Array.isArray(curve.Segments)) {
      curve.Segments = scaleSegments(curve.Segments, scale);
    }
  }
  return copy;
}

export function scaleSegments(segments: number[], scale: number): number[] {
  if (segments.length < 2) return segments.slice();
  const out = segments.slice();
  out[0] = out[0]! * scale;
  let i = 2;
  while (i < out.length) {
    const kind = out[i];
    if (kind === SEG_BEZIER) {
      // type, cx1, cy1, cx2, cy2, t, v
      if (i + 6 >= out.length) break;
      out[i + 1] = out[i + 1]! * scale;
      out[i + 3] = out[i + 3]! * scale;
      out[i + 5] = out[i + 5]! * scale;
      i += 7;
      continue;
    }
    if (kind === SEG_LINEAR || kind === SEG_STEPPED || kind === SEG_INV_STEPPED) {
      // type, t, v
      if (i + 2 >= out.length) break;
      out[i + 1] = out[i + 1]! * scale;
      i += 3;
      continue;
    }
    break;
  }
  return out;
}

export function pacedDurationSec(rawSec: number): number {
  return Math.max(0.8, rawSec) * MOTION_TIME_SCALE;
}
