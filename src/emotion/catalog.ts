import type { CatalogItem, MotionCatalog, RetrievalConfig } from "../shared/types";

export const DEFAULT_RETRIEVAL: RetrievalConfig = {
  topN: 3,
  cooldownMs: 3500,
  antiRepeatWindow: 2,
  idleIntervalMs: [11000, 18000],
  weights: {
    variant: 3,
    context: 2,
    styleHint: 1.5,
    intensityFit: 2,
    itemWeight: 1,
  },
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asIntensity(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [0, 1];
  const lo = Number(value[0]);
  const hi = Number(value[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

function parseItem(raw: unknown, index: number): CatalogItem {
  const item = (raw ?? {}) as Record<string, unknown>;
  const id = typeof item.id === "string" && item.id ? item.id : `item-${index}`;
  const layer = item.layer === "body" ? "body" : "face";
  const exclusiveGroup =
    item.exclusiveGroup === "body" || item.exclusiveGroup === "face"
      ? item.exclusiveGroup
      : layer;

  return {
    id,
    file: typeof item.file === "string" ? item.file : "",
    path: typeof item.path === "string" ? item.path : "",
    layer,
    exclusiveGroup,
    emotion: asStringArray(item.emotion),
    variant: asStringArray(item.variant),
    gestures: asStringArray(item.gestures),
    style: asStringArray(item.style),
    intensity: asIntensity(item.intensity),
    context: asStringArray(item.context),
    eventOnly: Boolean(item.eventOnly),
    weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1,
    duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : 2.4,
    loop: Boolean(item.loop),
    tags: asStringArray(item.tags),
  };
}

export function parseCatalog(raw: unknown): MotionCatalog {
  const data = (raw ?? {}) as Record<string, unknown>;
  if (data.schemaVersion !== 1) {
    throw new Error(
      `Unsupported motions.tags.json schemaVersion: ${String(data.schemaVersion)} (expected 1)`,
    );
  }

  const retrievalRaw = (data.retrieval ?? {}) as Record<string, unknown>;
  const weightsRaw = (retrievalRaw.weights ?? {}) as Record<string, unknown>;
  const idle = Array.isArray(retrievalRaw.idleIntervalMs)
    ? retrievalRaw.idleIntervalMs
    : DEFAULT_RETRIEVAL.idleIntervalMs;

  const retrieval: RetrievalConfig = {
    topN: Number(retrievalRaw.topN) > 0 ? Number(retrievalRaw.topN) : DEFAULT_RETRIEVAL.topN,
    cooldownMs:
      Number(retrievalRaw.cooldownMs) >= 0
        ? Number(retrievalRaw.cooldownMs)
        : DEFAULT_RETRIEVAL.cooldownMs,
    antiRepeatWindow:
      Number(retrievalRaw.antiRepeatWindow) >= 0
        ? Number(retrievalRaw.antiRepeatWindow)
        : DEFAULT_RETRIEVAL.antiRepeatWindow,
    idleIntervalMs: [
      Number(idle[0]) || DEFAULT_RETRIEVAL.idleIntervalMs[0],
      Number(idle[1]) || DEFAULT_RETRIEVAL.idleIntervalMs[1],
    ],
    weights: {
      variant: Number(weightsRaw.variant) || DEFAULT_RETRIEVAL.weights.variant,
      context: Number(weightsRaw.context) || DEFAULT_RETRIEVAL.weights.context,
      styleHint: Number(weightsRaw.styleHint) || DEFAULT_RETRIEVAL.weights.styleHint,
      intensityFit:
        Number(weightsRaw.intensityFit) || DEFAULT_RETRIEVAL.weights.intensityFit,
      itemWeight: Number(weightsRaw.itemWeight) || DEFAULT_RETRIEVAL.weights.itemWeight,
    },
    notes: typeof retrievalRaw.notes === "string" ? retrievalRaw.notes : undefined,
  };

  const items = Array.isArray(data.items) ? data.items.map(parseItem) : [];
  return { schemaVersion: 1, retrieval, items };
}

export function itemsForLayer(catalog: MotionCatalog, layer: CatalogItem["layer"]): CatalogItem[] {
  return catalog.items.filter((item) => item.layer === layer);
}
