import type {
  CatalogItem,
  EmotionIntent,
  MotionCatalog,
  MotionLayer,
} from "../shared/types";

export interface RetrievalState {
  lastIds: string[];
  lastPlayedAt: Map<string, number>;
}

export interface ScoredItem {
  id: string;
  score: number;
  reasons: string[];
  item: CatalogItem;
}

export interface RetrieveResult {
  item: CatalogItem | null;
  score: number;
  candidates: ScoredItem[];
  usedFallbackEmotion: boolean;
  reason: string;
}

export type Rng = () => number;

export function createRetrievalState(): RetrievalState {
  return {
    lastIds: [],
    lastPlayedAt: new Map(),
  };
}

export function rememberPlay(state: RetrievalState, item: CatalogItem | null, now = Date.now()): void {
  if (!item) return;
  state.lastPlayedAt.set(item.id, now);
  state.lastIds = [...state.lastIds.filter((id) => id !== item.id), item.id].slice(-8);
}

export function intensityFit(intensity: number, range: [number, number]): number {
  const [lo, hi] = range;
  if (intensity >= lo && intensity <= hi) return 1;
  const dist = intensity < lo ? lo - intensity : intensity - hi;
  return Math.max(0, 1 - dist / 0.55);
}

function hasEmotion(item: CatalogItem, emotion: string): boolean {
  return item.emotion.some((value) => value.toLowerCase() === emotion.toLowerCase());
}

function overlapCount(left: string[], right: string[]): number {
  const set = new Set(right.map((value) => value.toLowerCase()));
  return left.reduce((count, value) => count + (set.has(value.toLowerCase()) ? 1 : 0), 0);
}

function scoreItem(
  item: CatalogItem,
  intent: EmotionIntent,
  catalog: MotionCatalog,
): ScoredItem {
  const weights = catalog.retrieval.weights;
  let score = 0;
  const reasons: string[] = [];

  if (intent.variant && item.variant.some((value) => value.toLowerCase() === intent.variant!.toLowerCase())) {
    score += weights.variant;
    reasons.push(`variant:+${weights.variant}`);
  } else if (
    intent.variant &&
    item.gestures.some((value) => value.toLowerCase() === intent.variant!.toLowerCase())
  ) {
    score += weights.variant * 0.85;
    reasons.push(`gestureVariant:+${(weights.variant * 0.85).toFixed(2)}`);
  }

  const contextHits = overlapCount(intent.contextTags, item.context);
  if (contextHits > 0) {
    const add = weights.context * contextHits;
    score += add;
    reasons.push(`context:${contextHits}:+${add}`);
  }

  if (
    intent.styleHint &&
    item.style.some((value) => value.toLowerCase() === intent.styleHint!.toLowerCase())
  ) {
    score += weights.styleHint;
    reasons.push(`style:+${weights.styleHint}`);
  }

  const fit = intensityFit(intent.intensity, item.intensity);
  const fitScore = weights.intensityFit * fit;
  score += fitScore;
  reasons.push(`intensityFit:${fit.toFixed(2)}:+${fitScore.toFixed(2)}`);

  const weightBonus = weights.itemWeight * item.weight;
  score += weightBonus;
  reasons.push(`weight:+${weightBonus}`);

  return { id: item.id, score, reasons, item };
}

function filterPool(
  catalog: MotionCatalog,
  layer: MotionLayer,
  emotion: string,
  intent: EmotionIntent,
  state: RetrievalState,
  now: number,
): CatalogItem[] {
  const cooldown = catalog.retrieval.cooldownMs;

  return catalog.items.filter((item) => {
    if (item.layer !== layer) return false;
    if (item.exclusiveGroup !== layer) return false;
    if (!hasEmotion(item, emotion)) return false;
    if (item.eventOnly && !intent.event) return false;
    const last = state.lastPlayedAt.get(item.id);
    if (last != null && now - last < cooldown) return false;
    return true;
  });
}

function pickTopN(
  scored: ScoredItem[],
  topN: number,
  rng: Rng,
  recentIds: string[],
): ScoredItem | null {
  if (scored.length === 0) return null;
  const n = Math.max(1, Math.min(topN, scored.length));
  const top = scored.slice(0, n);
  const best = top[0]?.score ?? 0;
  const similar = top.filter((entry) => best - entry.score <= 1.05);
  let pool = similar.length > 0 ? similar : top;
  if (recentIds.length > 0 && pool.length > 1) {
    const withoutRecent = pool.filter((entry) => !recentIds.includes(entry.id));
    if (withoutRecent.length > 0) pool = withoutRecent;
  }
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index] ?? null;
}

/**
 * retrieve(intent) — catalog.retrieval scorer
 *
 * 1. Hard-filter by emotion (fallback to "neutral" if empty)
 * 2. Exclude eventOnly unless intent.event
 * 3. Apply cooldown + anti-repeat
 * 4. Score +variant +context +styleHint +intensityFit +item.weight
 * 5. Pick uniformly among top-N
 */
export function retrieve(
  catalog: MotionCatalog,
  intent: EmotionIntent,
  layer: MotionLayer,
  state: RetrievalState = createRetrievalState(),
  options: { now?: number; rng?: Rng } = {},
): RetrieveResult {
  const now = options.now ?? Date.now();
  const rng = options.rng ?? Math.random;
  const requested = (intent.emotion || "neutral").toLowerCase();

  let usedFallbackEmotion = false;
  let pool = filterPool(catalog, layer, requested, intent, state, now);
  if (pool.length === 0 && requested !== "neutral") {
    usedFallbackEmotion = true;
    pool = filterPool(catalog, layer, "neutral", intent, state, now);
  }

  if (pool.length === 0) {
    return {
      item: null,
      score: 0,
      candidates: [],
      usedFallbackEmotion,
      reason: usedFallbackEmotion
        ? `no ${layer} clip for "${requested}", neutral also empty`
        : `no ${layer} clip for "${requested}"`,
    };
  }

  const candidates = pool
    .map((item) => scoreItem(item, intent, catalog))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const recentIds = state.lastIds.slice(-catalog.retrieval.antiRepeatWindow);
  const picked = pickTopN(candidates, catalog.retrieval.topN, rng, recentIds);
  if (!picked) {
    return {
      item: null,
      score: 0,
      candidates,
      usedFallbackEmotion,
      reason: "top-N pick missed",
    };
  }

  return {
    item: picked.item,
    score: picked.score,
    candidates,
    usedFallbackEmotion,
    reason: usedFallbackEmotion
      ? `fallback neutral; ${picked.reasons.join(" ")}`
      : picked.reasons.join(" "),
  };
}

export function retrievePair(
  catalog: MotionCatalog,
  intent: EmotionIntent,
  state: { face: RetrievalState; body: RetrievalState },
  options: { now?: number; rng?: Rng } = {},
): { face: RetrieveResult; body: RetrieveResult } {
  return {
    face: retrieve(catalog, intent, "face", state.face, options),
    body: retrieve(catalog, intent, "body", state.body, options),
  };
}
