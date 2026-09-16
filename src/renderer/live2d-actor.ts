import { Container, Ticker } from "pixi.js";
import type { CatalogItem, HitZone } from "../shared/types";
import { MOTION_FADE_IN, MOTION_FADE_OUT, pacedDurationSec, slowMotion3 } from "../shared/motion-pace";
import { geometricHitZone, mapHitAreaName, refineVisibleZone } from "../interaction/hit-zones";
import type { LookState } from "../interaction/mouse-follow";
import type { ExpressionParams } from "./expression";
import { FACE_PARAM_IDS } from "./expression";
import type { PetActor } from "./actor";
import { lockFullBodyFitted, MODEL_ANCHOR_Y, bottomPinHome } from "./display-crop";
import { visualScale } from "./fit-scale";
import { pickMotionUrls } from "./motion-url";

type CoreModel = {
  setParameterValueById?: (id: string, value: number, weight?: number) => void;
  addParameterValueById?: (id: string, value: number, weight?: number) => void;
};

type MotionLike = {
  setFadeInTime?: (seconds: number) => void;
  setFadeOutTime?: (seconds: number) => void;
};

type MotionManagerLike = {
  playing?: boolean;
  isFinished?: () => boolean;
  createMotion?: (data: object, group: string, definition: { File: string; FadeInTime?: number; FadeOutTime?: number }) => MotionLike | unknown;
  _startMotion?: (motion: unknown) => number;
  state?: { setCurrent?: (group: string, index: number, priority: number) => void };
};

type Live2DLike = Container & {
  autoFocus?: boolean;
  autoInteract?: boolean;
  internalModel?: {
    coreModel?: CoreModel;
    motionManager?: MotionManagerLike;
  };
  hitTest?: (x: number, y: number) => string[] | false;
  anchor?: { set: (x: number, y: number) => void };
  scale: { x: number; y: number; set: (x: number, y?: number) => void };
  position: { set: (x: number, y: number) => void };
  getLocalBounds?: () => { width: number; height: number };
  getBounds?: () => { x: number; y: number; width: number; height: number };
};

const POOL_GROUP = "nori_body";

export class Live2DActor implements PetActor {
  readonly kind = "live2d" as const;
  readonly view = new Container();
  private scaleValue = 1;
  private fitted: number | null = null;
  private natural = { width: 0, height: 0 };
  private measured = false;
  private viewSize = { width: 0, height: 0 };
  /** Full-body baseline used for scale (size stays constant across presets). */
  private baseline = { width: 420, height: 560 };
  private home = { x: 0, y: 0 };
  private playGen = 0;
  private motionUntil = 0;
  private motionSource: "file" | "params" = "params";

  constructor(
    private readonly model: Live2DLike,
    private readonly motionsBaseUrl: string | null,
  ) {
    model.autoFocus = false;
    model.autoInteract = false;
    model.anchor?.set(0.5, MODEL_ANCHOR_Y);
    this.view.addChild(model);
  }

  setScale(scale: number): void {
    this.scaleValue = scale;
    this.applyLayout();
  }

  setBaseline(fullWidth: number, fullHeight: number): void {
    if (fullWidth > 0 && fullHeight > 0) {
      this.baseline = { width: fullWidth, height: fullHeight };
    }
    this.applyLayout();
  }

  layout(width: number, height: number): void {
    this.viewSize = { width, height };
    this.ensureMeasured();
    this.applyLayout();
  }

  hitTest(x: number, y: number): HitZone {
    const bounds = this.model.getBounds?.();
    let localZone: HitZone = "empty";
    try {
      const hits = this.model.hitTest?.(x, y);
      if (Array.isArray(hits) && hits.length > 0) {
        localZone = mapHitAreaName(hits[0]!);
      }
    } catch {
      // geometric fallback below
    }
    if (localZone === "empty") {
      if (!bounds) return "empty";
      localZone = geometricHitZone(x, y, bounds);
    }
    if (localZone === "empty" || !bounds) return localZone;
    return refineVisibleZone(localZone, x, y, bounds);
  }

  contains(x: number, y: number): boolean {
    return this.hitTest(x, y) !== "empty";
  }

  async playClips(face: CatalogItem | null, body: CatalogItem | null): Promise<boolean> {
    const gen = ++this.playGen;
    const picked = pickMotionUrls(face, body, this.motionsBaseUrl);
    const urls = picked.primary;
    if (!urls.length) {
      this.motionSource = "params";
      return false;
    }

    const duration = pacedDurationSec(body?.duration ?? 2.4);
    for (const url of urls) {
      if (gen !== this.playGen) return false;
      const started = await this.startMotionFile(url, duration);
      if (started) {
        this.motionSource = "file";
        return true;
      }
    }

    this.motionSource = "params";
    return false;
  }

  isPlayingMotion(): boolean {
    const mgr = this.model.internalModel?.motionManager;
    const live = Boolean(mgr?.isFinished && !mgr.isFinished() && mgr.playing);
    return live || performance.now() < this.motionUntil;
  }

  lastMotionSource(): "file" | "params" {
    return this.motionSource;
  }

  update(
    _dt: number,
    look: LookState,
    params: ExpressionParams,
    motion: { nod: number; tilt: number; bounce: number; sway: number; sparkle: number },
  ): void {
    const core = this.model.internalModel?.coreModel;
    if (!core) return;

    const fileMotion = this.isPlayingMotion() && this.motionSource === "file";

    const set = (id: string, value: number, weight = 1) => {
      try {
        core.setParameterValueById?.(id, value, weight);
      } catch {
        // parameter may not exist on this model
      }
    };
    const add = (id: string, value: number) => {
      try {
        core.addParameterValueById?.(id, value);
      } catch {
        // parameter may not exist on this model
      }
    };

    // Face expression is always param-driven so it never starts a second Cubism motion.
    for (const id of FACE_PARAM_IDS) {
      set(id, params[id] ?? defaultFaceValue(id));
    }

    if (!fileMotion) {
      set("ParamEyeBallX", look.eyeX);
      set("ParamEyeBallY", look.eyeY);
      set("ParamAngleX", look.angleX + (params.ParamAngleX ?? 0) + motion.sway * 0.25);
      set("ParamAngleY", look.angleY + (params.ParamAngleY ?? 0) + motion.nod * 0.55);
      set("ParamAngleZ", look.angleZ + (params.ParamAngleZ ?? 0) + motion.tilt * 0.55);
      set("ParamBodyAngleX", look.bodyX + motion.sway * 0.18);
      this.model.position.set(this.home.x, this.home.y - motion.bounce * 0.1);
      return;
    }

    // Body .motion3 owns pose/angles. Only overlay eyes — no ADD on head/body (that twitches).
    add("ParamEyeBallX", look.eyeX * 0.22);
    add("ParamEyeBallY", look.eyeY * 0.22);
    this.model.position.set(this.home.x, this.home.y);
  }

  private applyLayout(): void {
    const { width, height } = this.viewSize;
    this.ensureMeasured();
    this.fitted = lockFullBodyFitted(
      this.fitted,
      this.natural.width,
      this.natural.height,
      this.baseline.width,
      this.baseline.height,
    );
    const fitted = this.fitted > 0 ? this.fitted : 0.22;
    this.model.anchor?.set(0.5, MODEL_ANCHOR_Y);
    this.model.scale?.set(visualScale(fitted, this.scaleValue));
    if (width <= 0) return;
    this.home = bottomPinHome(width, height, this.scaleValue, this.baseline.height);
    this.model.position.set(this.home.x, this.home.y);
  }

  private ensureMeasured(): void {
    if (this.measured) return;
    const prevX = this.model.scale?.x ?? 1;
    const prevY = this.model.scale?.y ?? 1;
    this.model.scale?.set(1);
    const local = this.model.getLocalBounds?.();
    const world = this.model.getBounds?.();
    // Prefer the larger measurement so hair/skirt aren't clipped later.
    const w = Math.max(local?.width ?? 0, world?.width ?? 0, 0);
    const h = Math.max(local?.height ?? 0, world?.height ?? 0, 0);
    this.model.scale?.set(prevX, prevY);
    if (w < 8 || h < 8) return;
    this.natural = { width: w, height: h };
    this.measured = true;
  }

  private async startMotionFile(url: string, durationSec: number): Promise<boolean> {
    const mgr = this.model.internalModel?.motionManager;
    if (!mgr?.createMotion || !mgr._startMotion) {
      console.warn("[nori] Live2D motion manager missing; cannot play", url);
      return false;
    }
    try {
      const data = await fetchMotionJson(url);
      if (!data) return false;
      const slowed = slowMotion3(data);
      const motion = mgr.createMotion(slowed, POOL_GROUP, {
        File: url,
        FadeInTime: MOTION_FADE_IN,
        FadeOutTime: MOTION_FADE_OUT,
      }) as MotionLike | null;
      if (!motion) return false;
      motion.setFadeInTime?.(MOTION_FADE_IN);
      motion.setFadeOutTime?.(MOTION_FADE_OUT);
      mgr.state?.setCurrent?.(POOL_GROUP, 0, 3);
      mgr.playing = true;
      mgr._startMotion(motion);
      this.motionUntil = performance.now() + durationSec * 1000 + MOTION_FADE_OUT * 1000;
      console.info("[nori] playing body motion", url);
      return true;
    } catch (error) {
      console.warn("[nori] motion load failed", url, error);
      return false;
    }
  }
}

function defaultFaceValue(id: string): number {
  if (id === "ParamEyeLOpen" || id === "ParamEyeROpen") return 1;
  return 0;
}

async function fetchMotionJson(url: string): Promise<object | null> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn("[nori] motion HTTP", response.status, url);
    return null;
  }
  const data = (await response.json()) as object;
  if (!data || typeof data !== "object") return null;
  return data;
}

/** Allow only local Cubism Core: file://, /vendor/..., or relative vendor paths — never remote http(s). */
export function isAllowedCubismCoreUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^https?:/i.test(trimmed)) return false;
  if (trimmed.startsWith("file:")) return true;
  if (trimmed.startsWith("/vendor/")) return true;
  if (trimmed.startsWith("vendor/")) return true;
  // bare relative path without a scheme
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  return false;
}

export async function loadCubismCore(url: string): Promise<void> {
  if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) return;
  if (!isAllowedCubismCoreUrl(url)) {
    throw new Error(`Cubism Core URL blocked (local vendor/file only): ${url}`);
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Cubism Core: ${url}`));
    document.head.appendChild(script);
  });
}

export async function loadLive2DModel(
  modelUrl: string,
  motionsBaseUrl: string | null,
): Promise<Live2DActor> {
  const pixi = await import("pixi.js");
  (window as unknown as { PIXI: unknown }).PIXI = pixi;
  const { Live2DModel } = await import("pixi-live2d-display/cubism4");
  Live2DModel.registerTicker(Ticker);
  const model = (await Live2DModel.from(modelUrl, {
    autoInteract: false,
    autoFocus: false,
    motionPreload: "NONE",
    idleMotionGroup: "",
  })) as Live2DLike;
  model.autoFocus = false;
  model.autoInteract = false;
  return new Live2DActor(model, motionsBaseUrl);
}
