export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawableBoundsSource {
  getDrawableIDs?: () => string[];
  getDrawableBounds?: (index: number, bounds?: Rect) => Rect;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  coreModel?: {
    getDrawableCount?: () => number;
    getDrawableOpacity?: (index: number) => number;
    getDrawableDynamicFlagIsVisible?: (index: number) => boolean;
  };
}

/**
 * Union of visible Cubism drawable AABBs in model canvas space (not the empty
 * layout canvas). Live2D Sample models are often a 1024² canvas with the
 * character in the middle — fitting the canvas leaves a gap at every screen edge.
 */
export function unionDrawableCanvasRect(source: DrawableBoundsSource | null | undefined): Rect | null {
  if (!source?.getDrawableBounds) return null;
  const count = source.getDrawableIDs?.().length ?? source.coreModel?.getDrawableCount?.() ?? 0;
  if (count <= 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const tmp: Rect = { x: 0, y: 0, width: 0, height: 0 };

  for (let i = 0; i < count; i += 1) {
    if (source.coreModel?.getDrawableDynamicFlagIsVisible?.(i) === false) continue;
    const opacity = source.coreModel?.getDrawableOpacity?.(i);
    if (typeof opacity === "number" && opacity < 0.02) continue;
    let bounds: Rect;
    try {
      bounds = source.getDrawableBounds(i, tmp);
    } catch {
      continue;
    }
    if (!bounds || bounds.width < 8 || bounds.height < 8) continue;
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) continue;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(minX) || width < 8 || height < 8) return null;
  return { x: minX, y: minY, width, height };
}

/** Map canvas-space drawable rect into PIXI local space (layout-scaled). */
export function canvasRectToLocal(source: DrawableBoundsSource, canvas: Rect): Rect {
  const originalW = source.originalWidth && source.originalWidth > 0 ? source.originalWidth : canvas.width;
  const originalH = source.originalHeight && source.originalHeight > 0 ? source.originalHeight : canvas.height;
  const layoutW = source.width && source.width > 0 ? source.width : originalW;
  const layoutH = source.height && source.height > 0 ? source.height : originalH;
  const sx = layoutW / Math.max(1, originalW);
  const sy = layoutH / Math.max(1, originalH);
  return {
    x: canvas.x * sx,
    y: canvas.y * sy,
    width: canvas.width * sx,
    height: canvas.height * sy,
  };
}

/**
 * World/stage rect of a bottom-center anchored model (`anchor` 0.5, 1).
 * `local` is in the model's PIXI local space (layout canvas).
 */
export function worldRectFromBottomCenter(
  home: { x: number; y: number },
  scale: number,
  local: Rect,
  canvasSize: { width: number; height: number },
): Rect {
  const s = scale > 0 ? scale : 1;
  const canvasW = canvasSize.width > 0 ? canvasSize.width : local.width;
  const canvasH = canvasSize.height > 0 ? canvasSize.height : local.height;
  return {
    x: home.x + (local.x - canvasW / 2) * s,
    y: home.y + (local.y - canvasH) * s,
    width: local.width * s,
    height: local.height * s,
  };
}
