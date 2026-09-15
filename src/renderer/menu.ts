import type { CatalogItem, DisplayPresetId } from "../shared/types";
import { DISPLAY_PRESETS, USER_SCALE_MAX, USER_SCALE_MIN } from "../shared/display-preset";
import { faceSafeRect, placePopupAwayFromFace, type Rect } from "../shared/ui-chrome";

export interface MenuHooks {
  onOpen?: (info?: { menuHeight: number; clientX: number; clientY: number }) => void;
  onClose?: () => void;
  faceRect?: () => Rect;
}

export type MenuCommand =
  | { type: "idle" }
  | { type: "chat" }
  | { type: "random" }
  | { type: "toggle-hud" }
  | { type: "toggle-click-through" }
  | { type: "toggle-edge-snap" }
  | { type: "quit" }
  | { type: "scale"; value: number }
  | { type: "display-preset"; id: DisplayPresetId }
  | { type: "motion"; id: string };

export interface MenuState {
  scale: number;
  hudOn: boolean;
  clickThrough: boolean;
  edgeSnap: boolean;
  displayPreset: DisplayPresetId;
  motions: { id: string; label: string }[];
}

export const SCALE_MIN = USER_SCALE_MIN;
export const SCALE_MAX = USER_SCALE_MAX;

const EMOTION_ZH: Record<string, string> = {
  neutral: "待机",
  happy: "开心",
  shy: "害羞",
  excited: "兴奋",
  curious: "好奇",
  acknowledge: "回应",
  sparkle: "闪光",
};

const VARIANT_ZH: Record<string, string> = {
  breath: "呼吸",
  sway: "轻晃",
  pose: "换姿势",
  bounce: "蹦跳",
  wave: "挥手",
  blush: "脸红",
  shrink: "缩一下",
  glance: "扭头",
  smile: "微笑",
  grin: "咧嘴",
  wow: "惊喜",
  jump: "跳",
  sparkle: "闪光",
  look: "看过来",
  lean: "探身",
  wide: "睁大眼",
  tilthead: "歪头",
  nod: "点头",
  bow: "鞠躬",
  stretch: "伸懒腰",
};

export function motionMenuLabel(item: CatalogItem): string {
  const emotion = EMOTION_ZH[item.emotion[0] ?? ""] ?? item.emotion[0] ?? "";
  const variant = VARIANT_ZH[item.variant[0] ?? ""] ?? item.variant[0] ?? "";
  const label = [emotion, variant].filter(Boolean).join(" · ");
  return label || item.id;
}

export function bodyMotionsForMenu(items: CatalogItem[]): { id: string; label: string }[] {
  return items
    .filter((item) => item.layer === "body")
    .map((item) => ({ id: item.id, label: motionMenuLabel(item) }));
}

/** Ignore the pointer event that opened the menu (right-click mouseup/click). */
export function shouldDismissMenu(openedAt: number, now: number, targetInMenu: boolean, graceMs = 320): boolean {
  if (targetInMenu) return false;
  return now - openedAt >= graceMs;
}

export function bindContextMenu(
  root: HTMLElement,
  menu: HTMLElement,
  onCommand: (command: MenuCommand) => void,
  hooks: MenuHooks & { getState: () => MenuState; isBusy?: () => boolean },
): { close: () => void; isOpen: () => boolean; lastClosedAt: () => number } {
  let openedAt = 0;
  let lastClosedAt = 0;
  let open = false;
  let outsidePointer = false;

  const hide = () => {
    if (!open) return;
    open = false;
    lastClosedAt = performance.now();
    menu.hidden = true;
    hooks.onClose?.();
  };

  const place = () => {
    const rect = menu.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const face = hooks.faceRect?.() ?? faceSafeRect(viewport);
    const pos = placePopupAwayFromFace(face, { width: rect.width, height: rect.height }, viewport);
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
  };

  const show = (clientX = 0, clientY = 0) => {
    open = true;
    openedAt = performance.now();
    renderMenu(menu, hooks.getState(), onCommand, hide);
    menu.hidden = false;
    hooks.onOpen?.({ menuHeight: 0, clientX, clientY });
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
  };

  const toggle = (clientX: number, clientY: number) => {
    if (open) hide();
    else show(clientX, clientY);
  };

  root.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.contains(event.target as Node)) return;
    toggle(event.clientX, event.clientY);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) hide();
  });

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!open || event.button !== 0) return;
      const inMenu = menu.contains(event.target as Node);
      outsidePointer = shouldDismissMenu(openedAt, performance.now(), inMenu);
    },
    true,
  );

  window.addEventListener(
    "pointerup",
    (event) => {
      if (!outsidePointer || event.button !== 0) return;
      outsidePointer = false;
      if (!open || hooks.isBusy?.()) return;
      hide();
    },
    true,
  );

  return { close: hide, isOpen: () => open, lastClosedAt: () => lastClosedAt };
}

export function renderMenu(
  menu: HTMLElement,
  state: MenuState,
  onCommand: (command: MenuCommand) => void,
  hide: () => void,
): void {
  menu.replaceChildren();
  menu.classList.add("nori-menu");

  const headingRow = document.createElement("div");
  headingRow.className = "menu-head";
  const title = document.createElement("h2");
  title.textContent = "设置";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "menu-close";
  close.setAttribute("aria-label", "关闭设置");
  close.textContent = "×";
  close.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hide();
  });
  headingRow.append(title, close);
  bindMenuDrag(headingRow, menu);
  menu.append(headingRow);

  menu.append(
    section("交互", [
      actionButton("待机", () => {
        hide();
        onCommand({ type: "idle" });
      }),
      actionButton("随机情绪", () => {
        hide();
        onCommand({ type: "random" });
      }),
    ]),
  );

  const scaleBox = document.createElement("div");
  scaleBox.className = "menu-scale";
  const scaleLabel = document.createElement("div");
  scaleLabel.className = "menu-scale-row";
  const scaleTitle = document.createElement("span");
  scaleTitle.textContent = "大小";
  const scaleValue = document.createElement("span");
  scaleValue.dataset.scaleValue = "1";
  scaleValue.textContent = state.scale.toFixed(2);
  scaleLabel.append(scaleTitle, scaleValue);
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(SCALE_MIN);
  slider.max = String(SCALE_MAX);
  slider.step = "0.02";
  slider.value = String(state.scale);
  slider.setAttribute("aria-label", "角色大小");
  slider.addEventListener("pointerdown", (event) => event.stopPropagation());
  slider.addEventListener("click", (event) => event.stopPropagation());
  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    scaleValue.textContent = value.toFixed(2);
    onCommand({ type: "scale", value });
  });
  scaleBox.append(scaleLabel, slider);
  menu.append(section("大小（拖窗口不会变）", [scaleBox]));

  const cropWrap = document.createElement("div");
  cropWrap.className = "menu-presets";
  const cropButtons: HTMLButtonElement[] = [];
  for (const preset of DISPLAY_PRESETS) {
    const button = actionButton(preset.id === state.displayPreset ? `✓ ${preset.label}` : preset.label, () => {
      onCommand({ type: "display-preset", id: preset.id });
      for (const [index, item] of DISPLAY_PRESETS.entries()) {
        const el = cropButtons[index];
        if (!el) continue;
        const active = item.id === preset.id;
        el.classList.toggle("is-active", active);
        el.textContent = active ? `✓ ${item.label}` : item.label;
        el.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
    button.classList.toggle("is-active", preset.id === state.displayPreset);
    button.setAttribute("aria-pressed", preset.id === state.displayPreset ? "true" : "false");
    cropButtons.push(button);
    cropWrap.append(button);
  }
  menu.append(section("显示范围（窗口裁切：头肩/上半身/到腰/全身）", [cropWrap]));

  const motionWrap = document.createElement("div");
  motionWrap.className = "menu-motions";
  if (!state.motions.length) {
    const empty = document.createElement("p");
    empty.className = "menu-empty";
    empty.textContent = "目录里还没有身体动作";
    motionWrap.append(empty);
  } else {
    for (const motion of state.motions) {
      motionWrap.append(
        actionButton(motion.label, () => {
          hide();
          onCommand({ type: "motion", id: motion.id });
        }),
      );
    }
  }
  menu.append(section("身体动作", [motionWrap]));

  const snapBtn = actionButton(state.edgeSnap ? "贴边吸附：开" : "贴边吸附：关", () => {
    onCommand({ type: "toggle-edge-snap" });
    const next = !state.edgeSnap;
    state.edgeSnap = next;
    snapBtn.textContent = next ? "贴边吸附：开" : "贴边吸附：关";
  });
  snapBtn.dataset.edgeSnap = "1";
  menu.append(
    section("系统", [
      snapBtn,
      actionButton(state.hudOn ? "隐藏调试 HUD" : "显示调试 HUD", () => {
        onCommand({ type: "toggle-hud" });
      }),
      actionButton(state.clickThrough ? "关闭鼠标穿透" : "打开鼠标穿透", () => {
        hide();
        onCommand({ type: "toggle-click-through" });
      }),
      actionButton("退出", () => {
        hide();
        onCommand({ type: "quit" });
      }),
    ]),
  );
}

/** Drag the popup by its header so it can be moved off the character. */
export function bindMenuDrag(handle: HTMLElement, menu: HTMLElement): void {
  let dragging = false;
  let origin = { x: 0, y: 0, left: 0, top: 0 };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest?.(".menu-close")) return;
    dragging = true;
    origin = {
      x: event.clientX,
      y: event.clientY,
      left: menu.offsetLeft,
      top: menu.offsetTop,
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const x = origin.left + event.clientX - origin.x;
    const y = origin.top + event.clientY - origin.y;
    const maxX = Math.max(8, window.innerWidth - menu.offsetWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = `${Math.min(maxX, Math.max(8, x))}px`;
    menu.style.top = `${Math.min(maxY, Math.max(8, y))}px`;
  });

  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

function section(title: string, children: HTMLElement[]): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "menu-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  wrap.append(heading, ...children);
  return wrap;
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}
