export function bindTipBubble(el: HTMLElement): {
  show: (text: string, timeoutMs: number) => void;
  hide: () => void;
  setSuppressed: (flag: boolean) => void;
} {
  let suppressed = false;
  let holding = false;

  const paint = () => {
    const visible = holding && !suppressed;
    el.classList.toggle("is-visible", visible);
    if (visible) el.hidden = false;
  };

  return {
    show(text) {
      el.textContent = text;
      holding = true;
      paint();
    },
    hide() {
      holding = false;
      paint();
    },
    setSuppressed(flag) {
      suppressed = flag;
      paint();
    },
  };
}
