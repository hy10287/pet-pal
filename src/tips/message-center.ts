export interface TipMessage {
  text: string;
  timeoutMs: number;
  priority: number;
  override?: boolean;
  /** true = 被动消息（闲置、启动问候），受免打扰约束；false/缺省 = 对用户动作或 agent 的直接反馈 */
  passive?: boolean;
}

/** 当前无消息 => true；override !== false 时 priority >= current 可替换；override === false 时必须严格更高。 */
export function shouldAccept(
  current: { priority: number } | null,
  next: { priority: number; override?: boolean },
): boolean {
  if (current == null) return true;
  if (next.override === false) return next.priority > current.priority;
  return next.priority >= current.priority;
}

function hourInQuietRange(hour: number, range: string): boolean {
  const parts = range.split("-").map(Number);
  if (parts.length === 1) return hour === parts[0];
  const start = parts[0] ?? 0;
  const end = parts[1] ?? start;
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

/** 免打扰闸门：命中 quietHours 且 message.passive === true 时返回 true（丢弃）。 */
export function shouldSuppressByQuietHours(
  quietHours: string[],
  message: { passive?: boolean },
  hour: number,
): boolean {
  if (message.passive !== true) return false;
  return quietHours.some((range) => hourInQuietRange(hour, range));
}

/** 替换 {year} {hour} {model} {idle}；未知 {xxx} 原样保留。 */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (all, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key] ?? all;
    return all;
  });
}

/** 从 string | string[] 里随机取一条；空输入返回 null。rng 可注入。 */
export function pickText(text: string | string[], rng: () => number = Math.random): string | null {
  const list = typeof text === "string" ? [text] : Array.isArray(text) ? text : [];
  const usable = list.filter((item) => typeof item === "string" && item.trim() !== "");
  if (usable.length === 0) return null;
  const index = Math.min(usable.length - 1, Math.max(0, Math.floor(rng() * usable.length)));
  return usable[index] ?? null;
}

export class TipBubbleController {
  private current: { priority: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly io: {
      show: (text: string, timeoutMs: number) => void;
      hide: () => void;
    },
    private readonly getQuietHours: () => string[] = () => [],
    private readonly getHour: () => number = () => new Date().getHours(),
  ) {}

  push(message: TipMessage, vars: Record<string, string> = {}): boolean {
    if (shouldSuppressByQuietHours(this.getQuietHours(), message, this.getHour())) return false;
    if (!shouldAccept(this.current, message)) return false;
    const text = renderTemplate(message.text, vars);
    this.current = { priority: message.priority };
    if (this.timer) clearTimeout(this.timer);
    this.io.show(text, message.timeoutMs);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.current = null;
      this.io.hide();
    }, message.timeoutMs);
    return true;
  }
}
