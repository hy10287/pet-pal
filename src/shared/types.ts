export type MotionLayer = "face" | "body";
export type ExclusiveGroup = "face" | "body";
export type HitZone = "head" | "face" | "body" | "empty";

export interface EmotionIntent {
  emotion: string;
  variant?: string;
  intensity: number;
  contextTags: string[];
  styleHint?: string;
  /** When true, eventOnly catalog items may be selected. */
  event?: boolean;
}

export interface CatalogItem {
  id: string;
  file: string;
  path: string;
  layer: MotionLayer;
  exclusiveGroup: ExclusiveGroup;
  emotion: string[];
  variant: string[];
  gestures: string[];
  style: string[];
  intensity: [number, number];
  context: string[];
  eventOnly: boolean;
  weight: number;
  duration: number;
  loop: boolean;
  tags: string[];
}

export interface RetrievalWeights {
  variant: number;
  context: number;
  styleHint: number;
  intensityFit: number;
  itemWeight: number;
}

export interface RetrievalConfig {
  topN: number;
  cooldownMs: number;
  antiRepeatWindow: number;
  idleIntervalMs: [number, number];
  weights: RetrievalWeights;
  notes?: string;
}

export interface MotionCatalog {
  schemaVersion: 1;
  retrieval: RetrievalConfig;
  items: CatalogItem[];
}

export type DisplayPresetId = "compact" | "balanced" | "standard" | "full";

export type ChatProvider = "stub" | "grokbot";

/** Tunable body-click chat. Endpoints and timeouts stay in config. */
export interface ChatConfig {
  /** Master switch: show bubble / accept body-click chat. */
  enabled: boolean;
  /** stub = local fake reply (no network); grokbot = HTTP POST to hub. */
  provider: ChatProvider;
  /** Default http://127.0.0.1:3937/nori-chat */
  grokBotUrl: string;
  /** Request timeout in ms. Default 15000. */
  timeoutMs: number;
  /** Optional later knob: hint for the remote hub (not sent in v1 body). */
  systemPromptHint?: string;
  /** Optional later knob: max user text length. */
  maxChars?: number;
}

export interface AppConfig {
  modelPath: string;
  cubismCorePath: string;
  motionsTagsPath: string;
  motionsDir: string;
  scale: number;
  clickThrough: boolean;
  debugHud: boolean;
  /** Window-crop preset. Default: balanced / 上半身. Does not change model scale. */
  displayPreset: DisplayPresetId;
  /** Full-body baseline size. Presets only shorten height; this stays the fit reference. */
  window: {
    width: number;
    height: number;
  };
  /**
   * Loopback agent-control HTTP port (always bound to 127.0.0.1).
   * Override with NORI_CONTROL_PORT. v1 has no auth.
   */
  agentControlPort: number;
  chat: ChatConfig;
}

export interface BootstrapPayload {
  config: AppConfig;
  catalog: MotionCatalog;
  cubismCoreUrl: string | null;
  modelUrl: string | null;
  motionsBaseUrl: string | null;
  isElectron: boolean;
  preview: boolean;
}

export type InteractionKind =
  | "head-click"
  | "head-pat"
  | "body-click"
  | "double-click"
  | "hover-dwell"
  | "idle"
  | "random"
  | "menu-idle"
  | "menu-motion"
  | "chat"
  | "agent";

export interface DirectorDebugState {
  intent: EmotionIntent | null;
  source: InteractionKind | "boot" | null;
  faceId: string | null;
  bodyId: string | null;
  faceScore: number | null;
  bodyScore: number | null;
  reason: string;
  playingUntil: number;
  scale: number;
  clickThrough: boolean;
  actor: "live2d" | "fallback";
  motionSource?: "file" | "params";
  chatEnabled?: boolean;
  chatProvider?: ChatProvider;
}
