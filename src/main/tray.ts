import { Menu, Tray, nativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface TrayActions {
  idle: () => void;
  random: () => void;
  toggleHud: () => void;
  toggleClickThrough: () => void;
  quit: () => void;
}

export function createTray(root: string, actions: TrayActions): Tray {
  const iconPath = join(root, "assets", "icon.png");
  const image = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  const tray = new Tray(image.isEmpty() ? nativeImage.createFromDataURL(FALLBACK_PNG) : image);
  tray.setToolTip("Nori Desktop Pet");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "待机 Idle", click: () => actions.idle() },
      { label: "随机情绪 Random", click: () => actions.random() },
      { type: "separator" },
      { label: "调试 HUD", click: () => actions.toggleHud() },
      { label: "鼠标穿透 Click-through", click: () => actions.toggleClickThrough() },
      { type: "separator" },
      { label: "退出 Quit", click: () => actions.quit() },
    ]),
  );
  return tray;
}

const FALLBACK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA+klEQVRYhe2VwQ3CMAxFvyojMAojdAQmoCMwQjdgBEZghI7ACB0BNz5Sq1ZJ3DqpK pro/yUnjv+3nbiKKKUghIBz7oVz7o1z7oVz7o1z7oVz7o1z7oVz7o1z7oVz7o1z7oVz7o1z7oUQfO+9lFJKKeW11lsp5bXWSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSyr8BAAD//7vWBm8AAAAASUVORK5CYII=";
