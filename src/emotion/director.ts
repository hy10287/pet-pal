import type {
  CatalogItem,
  DirectorDebugState,
  EmotionIntent,
  InteractionKind,
  MotionCatalog,
} from "../shared/types";
import { pacedDurationSec } from "../shared/motion-pace";
import {
  createRetrievalState,
  rememberPlay,
  retrievePair,
  type RetrievalState,
} from "./retrieve";

export interface PlayedPair {
  face: CatalogItem | null;
  body: CatalogItem | null;
  intent: EmotionIntent;
  source: InteractionKind | "boot";
  until: number;
  faceScore: number | null;
  bodyScore: number | null;
  reason: string;
}

export interface IdleDirectorOptions {
  now?: number;
  rng?: () => number;
}

export class MotionDirector {
  readonly faceState: RetrievalState;
  readonly bodyState: RetrievalState;
  private lastPair: PlayedPair | null = null;
  private nextIdleAt = 0;
  private lastFaceId: string | null = null;
  private lastBodyId: string | null = null;

  constructor(private catalog: MotionCatalog) {
    this.faceState = createRetrievalState();
    this.bodyState = createRetrievalState();
  }

  setCatalog(catalog: MotionCatalog): void {
    this.catalog = catalog;
  }

  get playing(): PlayedPair | null {
    return this.lastPair;
  }

  isBusy(now = Date.now()): boolean {
    return Boolean(this.lastPair && now < this.lastPair.until);
  }

  scheduleIdle(now = Date.now(), rng: () => number = Math.random): void {
    const [lo, hi] = this.catalog.retrieval.idleIntervalMs;
    const span = Math.max(0, hi - lo);
    this.nextIdleAt = now + lo + rng() * span;
  }

  shouldIdle(now = Date.now()): boolean {
    if (this.isBusy(now)) return false;
    if (!this.nextIdleAt) {
      this.scheduleIdle(now);
      return false;
    }
    return now >= this.nextIdleAt;
  }

  /** Play an exact face/body pair (menu motion list) without retrieval. */
  playExact(
    face: CatalogItem | null,
    body: CatalogItem | null,
    intent: EmotionIntent,
    source: InteractionKind | "boot",
    options: IdleDirectorOptions = {},
  ): PlayedPair {
    const now = options.now ?? Date.now();
    if (face) {
      rememberPlay(this.faceState, face, now);
      this.lastFaceId = face.id;
    }
    if (body) {
      rememberPlay(this.bodyState, body, now);
      this.lastBodyId = body.id;
    }
    const durationMs = pacedDurationSec(Math.max(face?.duration ?? 0, body?.duration ?? 0, 1.2)) * 1000;
    const played: PlayedPair = {
      face,
      body,
      intent,
      source,
      until: now + durationMs,
      faceScore: null,
      bodyScore: null,
      reason: "exact-menu",
    };
    this.lastPair = played;
    this.scheduleIdle(played.until + 900, options.rng ?? Math.random);
    return played;
  }

  play(
    intent: EmotionIntent,
    source: InteractionKind | "boot",
    options: IdleDirectorOptions = {},
  ): PlayedPair {
    const now = options.now ?? Date.now();
    const pair = retrievePair(
      this.catalog,
      intent,
      { face: this.faceState, body: this.bodyState },
      options,
    );

    const face = this.maybeSkipRepeat(pair.face.item, this.lastFaceId, this.faceState, now);
    const body = this.maybeSkipRepeat(pair.body.item, this.lastBodyId, this.bodyState, now);

    if (face) {
      rememberPlay(this.faceState, face, now);
      this.lastFaceId = face.id;
    }
    if (body) {
      rememberPlay(this.bodyState, body, now);
      this.lastBodyId = body.id;
    }

    const durationMs = pacedDurationSec(Math.max(face?.duration ?? 0, body?.duration ?? 0, 1.2)) * 1000;
    const played: PlayedPair = {
      face,
      body,
      intent,
      source,
      until: now + durationMs,
      faceScore: pair.face.item ? pair.face.score : null,
      bodyScore: pair.body.item ? pair.body.score : null,
      reason: [pair.face.reason, pair.body.reason].filter(Boolean).join(" | "),
    };
    this.lastPair = played;
    this.scheduleIdle(played.until + 900, options.rng ?? Math.random);
    return played;
  }


  /** Play a specific catalog body clip (menu list). Face still comes from retrieve() for params. */
  playChosenBody(
    body: CatalogItem,
    source: InteractionKind | "boot" = "menu-motion",
    options: IdleDirectorOptions = {},
  ): PlayedPair {
    const now = options.now ?? Date.now();
    const intensity = (body.intensity[0] + body.intensity[1]) / 2;
    const intent: EmotionIntent = {
      emotion: body.emotion[0] ?? "neutral",
      variant: body.variant[0],
      intensity: Number.isFinite(intensity) ? intensity : 0.55,
      contextTags: ["menu", ...body.context],
      event: body.eventOnly,
    };
    const pair = retrievePair(
      this.catalog,
      intent,
      { face: this.faceState, body: this.bodyState },
      options,
    );
    const face = this.maybeSkipRepeat(pair.face.item, this.lastFaceId, this.faceState, now);
    if (face) {
      rememberPlay(this.faceState, face, now);
      this.lastFaceId = face.id;
    }
    rememberPlay(this.bodyState, body, now);
    this.lastBodyId = body.id;
    const durationMs = pacedDurationSec(Math.max(face?.duration ?? 0, body.duration, 1.2)) * 1000;
    const played: PlayedPair = {
      face,
      body,
      intent,
      source,
      until: now + durationMs,
      faceScore: pair.face.item ? pair.face.score : null,
      bodyScore: null,
      reason: `menu:${body.id}`,
    };
    this.lastPair = played;
    this.scheduleIdle(played.until + 900, options.rng ?? Math.random);
    return played;
  }

  debug(
    scale: number,
    clickThrough: boolean,
    actor: DirectorDebugState["actor"],
    motionSource?: DirectorDebugState["motionSource"],
  ): DirectorDebugState {
    const pair = this.lastPair;
    return {
      intent: pair?.intent ?? null,
      source: pair?.source ?? null,
      faceId: pair?.face?.id ?? null,
      bodyId: pair?.body?.id ?? null,
      faceScore: pair?.faceScore ?? null,
      bodyScore: pair?.bodyScore ?? null,
      reason: pair?.reason ?? "waiting",
      playingUntil: pair?.until ?? 0,
      scale,
      clickThrough,
      actor,
      motionSource,
    };
  }

  private maybeSkipRepeat(
    item: CatalogItem | null,
    lastId: string | null,
    state: RetrievalState,
    now: number,
  ): CatalogItem | null {
    if (!item) return null;
    const last = state.lastPlayedAt.get(item.id) ?? 0;
    if (item.id === lastId && now - last < this.catalog.retrieval.cooldownMs) {
      return null;
    }
    return item;
  }
}
