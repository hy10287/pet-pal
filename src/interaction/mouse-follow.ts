export interface LookState {
  angleX: number;
  angleY: number;
  angleZ: number;
  eyeX: number;
  eyeY: number;
  bodyX: number;
  strength: number;
}

export interface GazeTarget {
  nx: number;
  ny: number;
  strength: number;
}

const EYE_LIMIT = 1;
const ANGLE_X = 18;
const ANGLE_Y = 12;
const ANGLE_Z = 6;
const BODY_X = 8;

export function createLookState(): LookState {
  return { angleX: 0, angleY: 0, angleZ: 0, eyeX: 0, eyeY: 0, bodyX: 0, strength: 0 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function damp(current: number, target: number, dt: number, timeConstant: number): number {
  const lambda = 1 - Math.exp(-dt / Math.max(0.001, timeConstant));
  return current + (target - current) * lambda;
}

/**
 * Map a window-local cursor to a gaze target.
 * Inside the window: full strength. Within `margin` px outside: fade. Further: null (idle).
 */
export function gazeFromPointer(
  localX: number,
  localY: number,
  width: number,
  height: number,
  margin = 80,
): GazeTarget | null {
  if (width <= 0 || height <= 0) return null;
  const inside = localX >= 0 && localY >= 0 && localX <= width && localY <= height;
  let strength = 1;
  if (!inside) {
    const dx = localX < 0 ? -localX : localX > width ? localX - width : 0;
    const dy = localY < 0 ? -localY : localY > height ? localY - height : 0;
    const dist = Math.hypot(dx, dy);
    if (dist > margin) return null;
    strength = 1 - dist / margin;
  }
  const nx = clamp((localX / width) * 2 - 1, -1, 1);
  const ny = clamp((localY / height) * 2 - 1, -1, 1);
  return { nx, ny, strength };
}

export function updateLook(state: LookState, pointer: GazeTarget, dt: number): LookState {
  const strength = clamp(pointer.strength, 0, 1);
  const nx = clamp(pointer.nx, -1, 1) * strength;
  const ny = clamp(pointer.ny, -1, 1) * strength;

  state.strength = damp(state.strength, strength, dt, 0.12);
  state.eyeX = clamp(damp(state.eyeX, nx * EYE_LIMIT, dt, 0.07), -EYE_LIMIT, EYE_LIMIT);
  state.eyeY = clamp(damp(state.eyeY, ny * EYE_LIMIT, dt, 0.07), -EYE_LIMIT, EYE_LIMIT);
  state.angleX = clamp(damp(state.angleX, nx * ANGLE_X, dt, 0.16), -30, 30);
  state.angleY = clamp(damp(state.angleY, -ny * ANGLE_Y, dt, 0.18), -30, 30);
  state.angleZ = clamp(damp(state.angleZ, -nx * ANGLE_Z, dt, 0.22), -30, 30);
  state.bodyX = clamp(damp(state.bodyX, nx * BODY_X, dt, 0.28), -10, 10);
  return state;
}

export function settleLook(state: LookState, dt: number): LookState {
  return updateLook(state, { nx: 0, ny: 0, strength: 0 }, dt);
}
