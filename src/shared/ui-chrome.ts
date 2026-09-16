export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PopupSide = "right" | "left";
export const SETTINGS_PANEL_WIDTH = 232;
export const SETTINGS_PANEL_GAP = 8;
export const SETTINGS_PANEL_PAD = 8;

/** 窗口在弹层打开时的位置与尺寸：宠物（stage）在屏幕上原地不动，窗口向一侧长出 room。 */
export function popupWindowBounds(
  stage: Rect,
  workArea: Rect,
): { bounds: Rect; side: PopupSide } {
  const room = SETTINGS_PANEL_WIDTH + SETTINGS_PANEL_GAP;
  const width = stage.width + room;
  const height = stage.height;
  const right = { x: stage.x, y: stage.y, width, height };
  if (right.x + width <= workArea.x + workArea.width) return { bounds: right, side: "right" };
  const left = { x: stage.x - room, y: stage.y, width, height };
  if (left.x >= workArea.x) return { bounds: left, side: "left" };
  const roomRight = workArea.x + workArea.width - (stage.x + stage.width);
  const roomLeft = stage.x - workArea.x;
  if (roomRight >= roomLeft) {
    const x = Math.max(workArea.x, workArea.x + workArea.width - width);
    return { bounds: { x, y: stage.y, width, height }, side: "right" };
  }
  const x = Math.min(stage.x - room, workArea.x);
  return { bounds: { x: Math.max(workArea.x, x), y: stage.y, width, height }, side: "left" };
}

/** 弹层在窗口坐标系里的矩形（右：stage 右侧；左：贴窗口左边）。 */
export function sidePanelRect(side: PopupSide, stage: { width: number; height: number }): Rect {
  const pad = SETTINGS_PANEL_PAD;
  return {
    x: side === "left" ? pad : stage.width + SETTINGS_PANEL_GAP,
    y: pad,
    width: SETTINGS_PANEL_WIDTH,
    height: Math.max(96, stage.height - pad * 2),
  };
}
