export interface IdleState {
  firedCount: number;
  lastFiredAtMs: number | null;
}

/** 纯函数：给定系统闲置秒数与当前时间，返回新状态与是否该发消息。 */
export function nextIdleState(
  policy: { firstIdleSec: number; repeatEverySec: number },
  state: IdleState,
  idleSec: number,
  nowMs: number,
): { state: IdleState; fire: boolean } {
  if (idleSec < policy.firstIdleSec) {
    return { state: { firedCount: 0, lastFiredAtMs: null }, fire: false };
  }
  if (state.firedCount === 0) {
    return { state: { firedCount: 1, lastFiredAtMs: nowMs }, fire: true };
  }
  const elapsed = nowMs - (state.lastFiredAtMs ?? 0);
  if (elapsed >= policy.repeatEverySec * 1000) {
    return { state: { firedCount: state.firedCount + 1, lastFiredAtMs: nowMs }, fire: true };
  }
  return { state, fire: false };
}
