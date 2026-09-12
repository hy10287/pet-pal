import type { DirectorDebugState } from "../shared/types";

const LABELS: Record<string, string> = {
  actor: "角色",
  source: "来源",
  intent: "意图",
  face: "表情",
  body: "身体",
  scale: "大小",
  motion: "动作",
  through: "穿透",
  chat: "对话",
};

export function hudSnapshot(state: DirectorDebugState): string {
  const intent = state.intent;
  return [
    state.actor,
    state.source ?? "",
    intent ? `${intent.emotion}/${intent.variant ?? ""}/${intent.intensity.toFixed(2)}` : "",
    state.faceId ?? "",
    state.bodyId ?? "",
    state.scale.toFixed(2),
    state.motionSource ?? "",
    state.clickThrough ? "on" : "off",
    state.chatEnabled ? "chat-on" : "chat-off",
    state.chatProvider ?? "",
  ].join("|");
}

export function renderHud(el: HTMLElement, state: DirectorDebugState, visible: boolean): void {
  el.hidden = !visible;
  if (!visible) return;
  const intent = state.intent;
  const rows: Array<[string, string]> = [
    ["actor", state.actor === "live2d" ? "Live2D 模型" : "占位角色"],
    ["source", sourceLabel(state.source)],
    [
      "intent",
      intent ? `${intent.emotion}${intent.variant ? " / " + intent.variant : ""}  ${intent.intensity.toFixed(2)}` : "—",
    ],
    [
      "face",
      `${state.faceId ?? "—"} ${state.faceScore != null ? state.faceScore.toFixed(1) : ""}`.trim(),
    ],
    [
      "body",
      `${state.bodyId ?? "—"} ${state.bodyScore != null ? state.bodyScore.toFixed(1) : ""}`.trim(),
    ],
    ["scale", `${state.scale.toFixed(2)}（仅菜单调节）`],
    ["motion", state.motionSource === "file" ? "file · 身体 .motion3" : "params · 只调参数"],
    ["through", state.clickThrough ? "开（点不到角色，用托盘）" : "关"],
    [
      "chat",
      `${state.chatEnabled ? "开" : "关"} · ${state.chatProvider === "grokbot" ? "Grok Bot" : "本地 stub"}`,
    ],
  ];

  el.innerHTML = `
    <div class="hud-title">Nori 调试 HUD</div>
    ${rows
      .map(
        ([key, value]) =>
          `<div class="hud-row"><span>${escapeHtml(LABELS[key] ?? key)}</span>${escapeHtml(value)}</div>`,
      )
      .join("")}
    <details class="hud-help">
      <summary>HUD 说明</summary>
      <ul>
        <li><b>角色</b>：当前是 Live2D 还是占位图。</li>
        <li><b>来源</b>：这次动作由点击 / 摸头 / 对话 / 悬停 / 待机 / 菜单触发。</li>
        <li><b>意图</b>：检索用的情绪、变体和强度。</li>
        <li><b>表情</b>：脸部条目，只改五官参数，不播脸部动作文件。</li>
        <li><b>身体</b>：正在播的一条身体 .motion3。</li>
        <li><b>大小</b>：你设的缩放；拖窗口不会改这个值。</li>
        <li><b>动作</b>：file=播身体文件，params=只用参数演。</li>
        <li><b>穿透</b>：开着时点不到角色，请用任务栏或托盘。</li>
        <li><b>对话</b>：右键菜单开关。开着时点身体出气泡；关着只播点头。</li>
      </ul>
    </details>
  `;
}

function sourceLabel(source: DirectorDebugState["source"]): string {
  switch (source) {
    case "head-click":
      return "单击头/脸";
    case "head-pat":
      return "摸摸头";
    case "body-click":
      return "单击身体";
    case "chat":
      return "对话气泡";
    case "double-click":
      return "双击";
    case "hover-dwell":
      return "悬停注视";
    case "idle":
      return "待机";
    case "random":
      return "随机";
    case "menu-idle":
      return "菜单 · 待机";
    case "menu-motion":
      return "菜单 · 指定动作";
    case "agent":
      return "本地 Agent";
    case "boot":
      return "启动";
    default:
      return "—";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
