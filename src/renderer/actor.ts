import type { Container } from "pixi.js";
import type { CatalogItem, HitZone } from "../shared/types";
import type { LookState } from "../interaction/mouse-follow";
import type { ExpressionParams } from "./expression";

export interface VisualRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PetActor {
  kind: "live2d" | "fallback";
  view: Container;
  setScale(scale: number): void;
  /** Full-body window used for contain-fit. Crop must not change this. */
  setBaseline(fullWidth: number, fullHeight: number): void;
  layout(width: number, height: number): void;
  /** Extra offset so the drawable can sit on a screen edge when the HWND is clamped. */
  setPlaceShift(x: number, y: number): void;
  /** Drawn character AABB in stage pixels, at rest (no place-shift). */
  visualRect(): VisualRect;
  hitTest(x: number, y: number): HitZone;
  contains(x: number, y: number): boolean;
  playClips(face: CatalogItem | null, body: CatalogItem | null): Promise<boolean>;
  isPlayingMotion(): boolean;
  lastMotionSource(): "file" | "params";
  update(
    dt: number,
    look: LookState,
    params: ExpressionParams,
    motion: { nod: number; tilt: number; bounce: number; sway: number; sparkle: number },
  ): void;
}
