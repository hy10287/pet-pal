/**
 * Desktop-pet chrome used by PPet / Live2DPet: square corners so the window can
 * sit on true screen edges, no taskbar button (tray owns quit), no native frame.
 */
export const PET_WINDOW_CHROME = {
  frame: false,
  transparent: true,
  backgroundColor: "#00000000",
  hasShadow: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
  roundedCorners: false,
  /** Windows WS_THICKFRAME adds an invisible ~8px border that blocks true screen edges. */
  thickFrame: false,
  /** Allow the window (and empty canvas padding) to hang off-screen so the character can sit on the edge. */
  enableLargerThanScreen: true,
} as const;
