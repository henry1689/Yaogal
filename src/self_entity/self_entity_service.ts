/**
 * 自我实体模型 — 世界唯一第一人称主体
 * 收敛所有模块的「人」属性，统一读写
 * 每秒 tick 持久化，全时序不可逆
 */
import { getDb } from '../common/database';
import { log, nowMs, clamp } from '../common/utils';
import { worldBus } from '../core_bus/event_bus';

// ============================================================
// 类型定义
// ============================================================

export type Posture = 'stand' | 'sit' | 'lie' | 'walk' | 'bend';
export type Action = 'idle' | 'type' | 'drink' | 'eat' | 'sleep' | 'read' | 'think' | 'talk';
export type Scene = 'home' | 'office' | 'outdoor';
export type ClothingState = 'casual' | 'formal' | 'sleepwear' | 'sportswear' | 'undressed';

export interface LimbFatigue {
  left_arm: number;   // 0-100
  right_arm: number;
  left_leg: number;
  right_leg: number;
  neck: number;
  back: number;
}

export interface SelfState {
  // 身体状态
  posture: Posture;
  action: Action;
  gaze_direction: string;
  clothing_state: ClothingState;
  limb_fatigue: LimbFatigue;
  // 空间状态
  current_scene: Scene;
  position_x: number;
  position_y: number;
  position_z: number;
  facing: number;           // 朝向角度 0-360
  velocity: number;         // 移动速度 m/s
  // 注意力
  focus_target: string | null;
  focus_intensity: number;  // 0-1
  distraction_threshold: number; // 0-1
  // 内部状态
  energy: number;
  fatigue: number;
  hunger: number;
  mood_baseline: number;
  health: number;
  // 元数据
  last_behavior: string | null;
  state_tags: string | null;
}

const DEFAULT_SELF: SelfState = {
  posture: 'sit',
  action: 'idle',
  gaze_direction: 'forward',
  clothing_state: 'casual',
  limb_fatigue: { left_arm: 0, right_arm: 0, left_leg: 0, right_leg: 0, neck: 0, back: 0 },
  current_scene: 'home',
  position_x: 0, position_y: 0, position_z: 0,
  facing: 0, velocity: 0,
  focus_target: null, focus_intensity: 0.5, distraction_threshold: 0.3,
  energy: 100, fatigue: 0, hunger: 0, mood_baseline: 50, health: 100,
  last_behavior: null, state_tags: null,
};

let current: SelfState = { ...DEFAULT_SELF };
let initialized = false;
let tickCount = 0;

// ============================================================
// 初始化
// ============================================================

export function initSelfEntity(): void {
  const db = getDb();

  // 尝试从数据库恢复上次状态
  const row = db.prepare(
    'SELECT * FROM self_state ORDER BY tick DESC LIMIT 1'
  ).get() as any;

  if (row) {
    try {
      current.posture = row.posture || 'sit';
      current.action = row.action || 'idle';
      current.gaze_direction = row.gaze_direction || 'forward';
      current.clothing_state = row.clothing_state || 'casual';
      current.limb_fatigue = JSON.parse(row.limb_fatigue_json || '{}');
      current.current_scene = row.current_scene || 'home';
      current.position_x = row.position_x ?? 0;
      current.position_y = row.position_y ?? 0;
      current.position_z = row.position_z ?? 0;
      current.facing = row.facing ?? 0;
      current.velocity = row.velocity ?? 0;
      current.focus_target = row.focus_target || null;
      current.focus_intensity = row.focus_intensity ?? 0.5;
      current.distraction_threshold = row.distraction_threshold ?? 0.3;
      current.energy = row.energy ?? 100;
      current.fatigue = row.fatigue ?? 0;
      current.hunger = row.hunger ?? 0;
      current.mood_baseline = row.mood_baseline ?? 50;
      current.health = row.health ?? 100;
      log('SELF', `从数据库恢复状态: 场景=${current.current_scene}, 姿势=${current.posture}`);
    } catch (e) {
      log('SELF', `恢复状态失败，使用默认值: ${e}`);
    }
  }

  initialized = true;
  log('SELF', '自我实体初始化完成');
}

// ============================================================
// 读取接口
// ============================================================

export function getSelfState(): SelfState {
  return { ...current };
}

export function getPosture(): Posture { return current.posture; }
export function getAction(): Action { return current.action; }
export function getScene(): Scene { return current.current_scene; }
export function getEnergy(): number { return current.energy; }
export function getFatigue(): number { return current.fatigue; }
export function getHunger(): number { return current.hunger; }
export function getMoodBaseline(): number { return current.mood_baseline; }
export function getHealth(): number { return current.health; }
export function getPosition(): { x: number; y: number; z: number } {
  return { x: current.position_x, y: current.position_y, z: current.position_z };
}
export function getLimbFatigue(): LimbFatigue {
  return { ...current.limb_fatigue };
}

// ============================================================
// 写入接口（所有修改世界的入口）
// ============================================================

export function setPosture(posture: Posture): void {
  const prev = current.posture;
  current.posture = posture;
  worldBus.emit('self.posture_changed', { from: prev, to: posture });
}

export function setAction(action: Action): void {
  const prev = current.action;
  current.action = action;
  worldBus.emit('self.action_changed', { from: prev, to: action });
}

export function setScene(scene: Scene): void {
  const prev = current.current_scene;
  current.current_scene = scene;
  worldBus.emit('self.scene_changed', { from: prev, to: scene });
}

export function setClothing(state: ClothingState): void {
  current.clothing_state = state;
  worldBus.emit('self.clothing_changed', { to: state });
}

export function moveTo(x: number, y: number, z: number): void {
  current.position_x = x;
  current.position_y = y;
  current.position_z = z;
  worldBus.emit('self.moved', { x, y, z });
}

export function setFacing(degrees: number): void {
  current.facing = degrees % 360;
}

export function setVelocity(speed: number): void {
  current.velocity = clamp(speed, 0, 10);
}

/** 设置注意力焦点 */
export function focusOn(target: string | null, intensity?: number): void {
  const prev = current.focus_target;
  current.focus_target = target;
  if (intensity !== undefined) {
    current.focus_intensity = clamp(intensity, 0, 1);
  }
  worldBus.emit('self.focus_changed', { from: prev, to: target });
}

/** 修改内部状态（增量） */
export function modifyEnergy(delta: number): void {
  current.energy = clamp(current.energy + delta, 0, 100);
}
export function modifyFatigue(delta: number): void {
  current.fatigue = clamp(current.fatigue + delta, 0, 100);
}
export function modifyHunger(delta: number): void {
  current.hunger = clamp(current.hunger + delta, 0, 100);
}
export function modifyMood(delta: number): void {
  current.mood_baseline = clamp(current.mood_baseline + delta, 0, 100);
}
export function modifyHealth(delta: number): void {
  current.health = clamp(current.health + delta, 0, 100);
}

/** 设置肢体疲劳 */
export function setLimbFatigue(part: keyof LimbFatigue, value: number): void {
  current.limb_fatigue[part] = clamp(value, 0, 100);
}

/** 记录最近行为 */
export function setLastBehavior(behavior: string): void {
  current.last_behavior = behavior;
}

/** 设置状态标签 */
export function setStateTags(tags: string): void {
  current.state_tags = tags;
}

// ============================================================
// 生命周期 tick（每秒调用）
// ============================================================

export function selfEntityTick(dtSeconds: number): void {
  if (!initialized) return;

  // 被动生理变化
  // 久坐 → 背部和颈部疲劳累积
  if (current.posture === 'sit') {
    setLimbFatigue('back', current.limb_fatigue.back + 0.02 * dtSeconds);
    setLimbFatigue('neck', current.limb_fatigue.neck + 0.015 * dtSeconds);
  }
  // 站立 → 腿部和背部缓慢疲劳
  if (current.posture === 'stand') {
    setLimbFatigue('left_leg', current.limb_fatigue.left_leg + 0.03 * dtSeconds);
    setLimbFatigue('right_leg', current.limb_fatigue.right_leg + 0.03 * dtSeconds);
    setLimbFatigue('back', current.limb_fatigue.back + 0.01 * dtSeconds);
  }
  // 躺下 → 所有疲劳缓慢恢复
  if (current.posture === 'lie') {
    for (const part of Object.keys(current.limb_fatigue) as (keyof LimbFatigue)[]) {
      setLimbFatigue(part, current.limb_fatigue[part] - 0.1 * dtSeconds);
    }
    modifyFatigue(-0.5 * dtSeconds);
  }

  // 饥饿累积（每分钟约 0.03）
  modifyHunger(0.03 * dtSeconds);

  // 疲劳自然累积（站立/行走更快）
  const fatigueRate = current.posture === 'walk' ? 0.15 : (current.posture === 'stand' ? 0.08 : 0.04);
  modifyFatigue(fatigueRate * dtSeconds);

  // 精力消耗
  modifyEnergy(-0.02 * dtSeconds);
  // 躺下或坐下时精力缓慢恢复
  if (current.posture === 'lie' || current.posture === 'sit') {
    modifyEnergy(0.01 * dtSeconds);
  }

  // 持久化到数据库
  persistState();

  tickCount++;
  if (tickCount % 60 === 0) {
    log('SELF', `[tick ${tickCount}] 姿势=${current.posture} 精力=${current.energy.toFixed(1)} 疲劳=${current.fatigue.toFixed(1)} 饥饿=${current.hunger.toFixed(1)}`);
  }
}

// ============================================================
// 持久化
// ============================================================

function persistState(): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO self_state (tick, timestamp, posture, action, gaze_direction, clothing_state,
      limb_fatigue_json, current_scene, position_x, position_y, position_z, facing, velocity,
      focus_target, focus_intensity, distraction_threshold, energy, fatigue, hunger,
      mood_baseline, health, last_behavior, state_tags)
    VALUES (?, datetime('now','localtime'), ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?)
  `).run(
    tickCount,
    current.posture, current.action, current.gaze_direction, current.clothing_state,
    JSON.stringify(current.limb_fatigue),
    current.current_scene, current.position_x, current.position_y, current.position_z,
    current.facing, current.velocity,
    current.focus_target, current.focus_intensity, current.distraction_threshold,
    current.energy, current.fatigue, current.hunger,
    current.mood_baseline, current.health,
    current.last_behavior, current.state_tags
  );
}

/** 获取自我状态历史（用于日报） */
export function getSelfStateHistory(limit: number = 100): SelfState[] {
  const rows = getDb().prepare(
    'SELECT * FROM self_state ORDER BY tick DESC LIMIT ?'
  ).all(limit) as any[];

  return rows.map(r => ({
    posture: r.posture,
    action: r.action,
    gaze_direction: r.gaze_direction,
    clothing_state: r.clothing_state,
    limb_fatigue: JSON.parse(r.limb_fatigue_json || '{}'),
    current_scene: r.current_scene,
    position_x: r.position_x, position_y: r.position_y, position_z: r.position_z,
    facing: r.facing, velocity: r.velocity,
    focus_target: r.focus_target, focus_intensity: r.focus_intensity,
    distraction_threshold: r.distraction_threshold,
    energy: r.energy, fatigue: r.fatigue, hunger: r.hunger,
    mood_baseline: r.mood_baseline, health: r.health,
    last_behavior: r.last_behavior, state_tags: r.state_tags,
  }));
}
