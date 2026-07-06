/**
 * 极简重力物理 — 日常重力/掉落/位移/跳跃
 * 纯写实规则，不可逆，不可瞬移
 */
import { log, clamp, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 物理常数
// ============================================================
const G = 9.8;                // 重力加速度 m/s²
const WALK_SPEED = 1.4;       // 步行 m/s
const FAST_WALK_SPEED = 2.0;  // 快走 m/s
const RUN_SPEED = 3.5;        // 跑步 m/s
const JUMP_VELOCITY = 3.0;    // 起跳初速度 m/s
const DROP_THRESHOLD = 0.1;   // z<此值视为地面

// ============================================================
// 掉落物体
// ============================================================
interface FallingObject {
  id: string;
  name: string;
  start_z: number;
  current_z: number;
  start_ms: number;
  velocity: number;
  landed: boolean;
}

let fallingObjects: FallingObject[] = [];

/** 让物体从指定高度掉落 */
export function startDrop(objectId: string, name: string, startZ: number): FallingObject {
  const obj: FallingObject = {
    id: objectId,
    name,
    start_z: startZ,
    current_z: startZ,
    start_ms: nowMs(),
    velocity: 0,
    landed: false,
  };
  fallingObjects.push(obj);

  log('PHYSICS', `${name} 从 ${startZ.toFixed(1)}m 开始掉落`);
  worldBus.emit(WorldEvents.PHYSICS_OBJECT_FELL, {
    object: objectId,
    name,
    from_z: startZ,
    timestamp_ms: nowMs(),
  });

  return obj;
}

/** 每秒调用：更新掉落物体的位置 */
export function tickGravity(dtSeconds: number): void {
  for (const obj of fallingObjects) {
    if (obj.landed) continue;

    obj.velocity += G * dtSeconds;
    obj.current_z -= obj.velocity * dtSeconds;

    if (obj.current_z <= DROP_THRESHOLD) {
      obj.current_z = 0;
      obj.velocity = 0;
      obj.landed = true;
      log('PHYSICS', `${obj.name} 已落地（耗时 ${((nowMs() - obj.start_ms) / 1000).toFixed(1)}s）`);
    }
  }

  // 清理已落地的
  fallingObjects = fallingObjects.filter(o => !o.landed || (nowMs() - o.start_ms < 10000));
}

/** 获取掉落信息 */
export function getFallingObjects(): FallingObject[] {
  return [...fallingObjects];
}

// ============================================================
// 位移计算
// ============================================================
export type MoveSpeed = 'walk' | 'fast_walk' | 'run';

export function getSpeed(speed: MoveSpeed): number {
  return speed === 'walk' ? WALK_SPEED : speed === 'fast_walk' ? FAST_WALK_SPEED : RUN_SPEED;
}

/** 计算在指定时间/速度下的位移 */
export function calculateDisplacement(speed: MoveSpeed, durationSeconds: number): number {
  return getSpeed(speed) * durationSeconds;
}

// ============================================================
// 跳跃
// ============================================================
let isJumping = false;
let jumpStartZ = 0;
let jumpVelocity = 0;
let jumpStartMs = 0;

export function startJump(currentZ: number): { ok: boolean; message: string } {
  if (isJumping) return { ok: false, message: '正在跳跃中' };
  if (currentZ > DROP_THRESHOLD) return { ok: false, message: '不在平地上，无法起跳' };

  isJumping = true;
  jumpStartZ = currentZ;
  jumpVelocity = JUMP_VELOCITY;
  jumpStartMs = nowMs();

  log('PHYSICS', `起跳！初速度 ${JUMP_VELOCITY} m/s`);
  return { ok: true, message: '起跳' };
}

/** 每秒调用：更新跳跃高度 */
export function tickJump(dtSeconds: number): number {
  if (!isJumping) return 0;

  jumpVelocity -= G * dtSeconds;
  const newZ = jumpStartZ + jumpVelocity * dtSeconds;

  if (newZ <= DROP_THRESHOLD && jumpVelocity <= 0) {
    // 落地
    isJumping = false;
    jumpVelocity = 0;
    log('PHYSICS', `落地（跳跃高度 ${(jumpStartZ + jumpStartZ).toFixed(2)}m，耗时 ${((nowMs() - jumpStartMs) / 1000).toFixed(1)}s）`);
    return 0;
  }

  return clamp(newZ, 0, 5);
}

export function getJumpState(): { jumping: boolean; current_z: number } {
  return { jumping: isJumping, current_z: isJumping ? jumpStartZ + jumpVelocity : 0 };
}

// ============================================================
// 推倒 / 滑落
// ============================================================
interface SlidingObject {
  id: string;
  name: string;
  start_x: number;
  start_y: number;
  current_x: number;
  current_y: number;
  direction_deg: number;
  speed: number;
  friction: number;
  start_ms: number;
  stopped: boolean;
}

let slidingObjects: SlidingObject[] = [];

export function startSlide(
  objectId: string, name: string,
  startX: number, startY: number,
  directionDeg: number, initialSpeed: number
): SlidingObject {
  const slide: SlidingObject = {
    id: objectId, name,
    start_x: startX, start_y: startY,
    current_x: startX, current_y: startY,
    direction_deg: directionDeg,
    speed: initialSpeed,
    friction: 2.0,  // 摩擦力减速度 m/s²
    start_ms: nowMs(),
    stopped: false,
  };
  slidingObjects.push(slide);
  log('PHYSICS', `${name} 被推倒，沿 ${directionDeg}° 滑出，初速 ${initialSpeed.toFixed(1)} m/s`);
  return slide;
}

export function tickSlide(dtSeconds: number): void {
  for (const s of slidingObjects) {
    if (s.stopped) continue;

    s.speed -= s.friction * dtSeconds;
    if (s.speed <= 0) {
      s.speed = 0;
      s.stopped = true;
      continue;
    }

    const rad = (s.direction_deg * Math.PI) / 180;
    s.current_x += s.speed * Math.cos(rad) * dtSeconds;
    s.current_y += s.speed * Math.sin(rad) * dtSeconds;
  }

  slidingObjects = slidingObjects.filter(o => !o.stopped);
}

export function getSlidingObjects(): SlidingObject[] {
  return [...slidingObjects];
}

// ============================================================
// 全局物理 tick
// ============================================================
export function physicsTick(dtSeconds: number): void {
  tickGravity(dtSeconds);
  tickJump(dtSeconds);
  tickSlide(dtSeconds);
}
