import { pickText } from "./message-center";
import type { TipMessage } from "./message-center";
import type { TipsConfig } from "./schema";

const INTERACTION_KINDS = [
  "head-click",
  "head-pat",
  "body-click",
  "hover-dwell",
  "double-click",
] as const;

export type InteractionTipKind = (typeof INTERACTION_KINDS)[number];

export function tipForInteraction(
  tips: TipsConfig,
  kind: InteractionTipKind,
  _vars: Record<string, string>,
  rng?: () => number,
): TipMessage | null {
  const groups = tips.reactions[kind] ?? [];
  const group = groups.find((item) => item.text.length > 0);
  if (!group) return null;
  const text = pickText(group.text, rng);
  if (!text) return null;
  const message: TipMessage = {
    text,
    timeoutMs: group.timeoutMs,
    priority: group.priority,
    passive: false,
  };
  if (typeof group.override === "boolean") message.override = group.override;
  return message;
}
