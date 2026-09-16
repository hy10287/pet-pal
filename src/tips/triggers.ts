import { pickText, renderTemplate } from "./message-center";
import type { TipMessage } from "./message-center";
import type { TipsConfig } from "./schema";
import { inDateRange, inHourRange } from "../shared/tips-time";

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

/** seasons 命中 → 用节日文案；否则 time 命中 → 时段文案；否则 welcome 随机。三者只取一条，无命中返回 null。 */
export function startupGreeting(
  tips: TipsConfig,
  now: { month: number; day: number; hour: number; year: number },
  vars: Record<string, string>,
  rng?: () => number,
): TipMessage | null {
  const season = tips.seasons.find(
    (slot) => inDateRange(now.month, now.day, slot.date) && slot.text.length > 0,
  );
  const timeSlot = tips.time.find(
    (slot) => inHourRange(now.hour, slot.hour) && slot.text.length > 0,
  );
  const picked = season
    ? pickText(season.text, rng)
    : timeSlot
      ? pickText(timeSlot.text, rng)
      : pickText(tips.welcome, rng);
  if (!picked) return null;
  return {
    text: renderTemplate(picked, vars),
    timeoutMs: 6000,
    priority: 11,
    passive: true,
  };
}
