/**
 * 空间场景定义 — 三固定场景管理
 * 居家 / 办公室 / 近郊户外
 * 场景切换带时间消耗，不可并发切换
 */
import { log, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 场景定义
// ============================================================
export interface Scene {
  id: string;
  name: string;
  size_m2: number;          // 面积，边长 = sqrt(size_m2)
  lighting: 'natural' | 'artificial' | 'dim';
  indoor: boolean;
  description: string;
  min_z: number;            // 最低高度（室外为地面，室内为楼层地板）
  max_z: number;            // 最高高度（天花板/天空）
}

const SCENES: Record<string, Scene> = {
  home: {
    id: 'home',
    name: '家',
    size_m2: 80,
    lighting: 'artificial',
    indoor: true,
    description: '温馨的居所，宽敞的客厅连接阳台，卧室安静舒适，厨房飘着淡淡的咖啡香',
    min_z: 0,
    max_z: 3,
  },
  office: {
    id: 'office',
    name: '办公室',
    size_m2: 60,
    lighting: 'artificial',
    indoor: true,
    description: '开放式办公区，工位整齐排列，窗外是城市天际线，空调轻轻嗡鸣',
    min_z: 0,
    max_z: 3,
  },
  outdoor: {
    id: 'outdoor',
    name: '近郊户外',
    size_m2: 5000,
    lighting: 'natural',
    indoor: false,
    description: '近郊的公园小径，树木成荫，鸟鸣清脆，远处能看到起伏的山丘',
    min_z: 0,
    max_z: 30,
  },
};

// ============================================================
// 场景切换配置
// ============================================================
interface SceneTransition {
  /** 切换耗时（毫秒） */
  cost_ms: number;
  /** 必须的步骤描述 */
  steps: string[];
}

const TRANSITIONS: Record<string, Record<string, SceneTransition>> = {
  home: {
    office: { cost_ms: 30 * 60 * 1000, steps: ['关好门窗', '拿上钥匙', '步行到地铁站', '乘坐地铁', '到达办公室'] },
    outdoor: { cost_ms: 10 * 60 * 1000, steps: ['换好衣服', '穿鞋', '下楼', '走到公园'] },
  },
  office: {
    home: { cost_ms: 30 * 60 * 1000, steps: ['收拾工位', '拿上背包', '乘坐地铁', '步行回家', '开门进屋'] },
    outdoor: { cost_ms: 15 * 60 * 1000, steps: ['下楼', '走出办公楼', '步行到附近公园'] },
  },
  outdoor: {
    home: { cost_ms: 10 * 60 * 1000, steps: ['收拾心情', '沿路返回', '上楼', '开门进屋', '换鞋'] },
    office: { cost_ms: 15 * 60 * 1000, steps: ['离开公园', '步行到办公楼', '上楼', '到达工位'] },
  },
};

// ============================================================
// 运行时状态
// ============================================================
let currentScene: Scene = SCENES.home;
let playerX = 4;
let playerY = 4;
let playerZ = 0;
let isTransitioning = false;
let transitionStartMs = 0;
let transitionTarget: Scene | null = null;

// ============================================================
// 公共API
// ============================================================
export function getCurrentScene(): Scene {
  return currentScene;
}

export function getAllScenes(): Scene[] {
  return Object.values(SCENES);
}

export function getSceneById(id: string): Scene | undefined {
  return SCENES[id];
}

export function getPlayerPosition(): { x: number; y: number; z: number } {
  return { x: playerX, y: playerY, z: playerZ };
}

export function isSceneTransitioning(): boolean {
  return isTransitioning;
}

/** 场景切换 —— 异步，带耗时 */
export function switchScene(targetSceneId: string): { ok: boolean; message: string } {
  if (isTransitioning) {
    return { ok: false, message: `正在切换到 ${transitionTarget?.name}，请等待完成` };
  }

  const target = SCENES[targetSceneId];
  if (!target) {
    return { ok: false, message: `未知场景: ${targetSceneId}` };
  }

  if (target.id === currentScene.id) {
    return { ok: false, message: `已经在 ${currentScene.name}` };
  }

  const transition = TRANSITIONS[currentScene.id]?.[target.id];
  if (!transition) {
    return { ok: false, message: `从 ${currentScene.name} 无法直接到 ${target.name}` };
  }

  isTransitioning = true;
  transitionStartMs = nowMs();
  transitionTarget = target;

  log('SCENE', `开始从 ${currentScene.name} 切换到 ${target.name}，预计耗时 ${Math.round(transition.cost_ms / 60000)} 分钟`);

  // 异步完成切换
  setTimeout(() => {
    if (transitionTarget) {
      const oldScene = currentScene;
      currentScene = transitionTarget;
      // 重置玩家位置到目标场景中心
      const halfEdge = Math.sqrt(currentScene.size_m2) / 2;
      playerX = halfEdge;
      playerY = halfEdge;
      playerZ = 0;
      isTransitioning = false;
      transitionTarget = null;
      transitionStartMs = 0;

      log('SCENE', `场景切换完成: ${oldScene.name} → ${currentScene.name}`);

      worldBus.emit(WorldEvents.SCENE_CHANGED, {
        from: oldScene.id,
        to: currentScene.id,
        from_name: oldScene.name,
        to_name: currentScene.name,
        timestamp_ms: nowMs(),
      });
    }
  }, transition.cost_ms);

  return { ok: true, message: `开始从 ${currentScene.name} 切换到 ${target.name}` };
}

/** 获取切换进度 0-100 */
export function getTransitionProgress(): { progress: number; remaining_sec: number } | null {
  if (!isTransitioning || !transitionTarget) return null;
  const transition = TRANSITIONS[currentScene.id]?.[transitionTarget.id];
  if (!transition) return null;

  const elapsed = nowMs() - transitionStartMs;
  const progress = Math.min(100, (elapsed / transition.cost_ms) * 100);
  const remaining = Math.max(0, (transition.cost_ms - elapsed) / 1000);

  return { progress: Math.round(progress), remaining_sec: Math.round(remaining) };
}

/** 获取场景边长（米） */
export function getSceneEdge(): number {
  return Math.sqrt(currentScene.size_m2);
}

/** 更新玩家位置 —— 返回新坐标或碰撞原因 */
export function movePlayer(
  dx: number, dy: number, dz: number
): { x: number; y: number; z: number; blocked: boolean; reason?: string } {
  const newX = playerX + dx;
  const newY = playerY + dy;
  const newZ = playerZ + dz;
  const edge = getSceneEdge();

  if (newX < 0 || newX > edge) {
    return { x: playerX, y: playerY, z: playerZ, blocked: true, reason: `X方向碰到边界 (${edge.toFixed(1)}m)` };
  }
  if (newY < 0 || newY > edge) {
    return { x: playerX, y: playerY, z: playerZ, blocked: true, reason: `Y方向碰到边界 (${edge.toFixed(1)}m)` };
  }
  if (newZ < currentScene.min_z) {
    return { x: playerX, y: playerY, z: playerZ, blocked: true, reason: `已在地面` };
  }
  if (newZ > currentScene.max_z) {
    return { x: playerX, y: playerY, z: playerZ, blocked: true, reason: `碰到天花板` };
  }

  playerX = newX;
  playerY = newY;
  playerZ = newZ;

  return { x: playerX, y: playerY, z: playerZ, blocked: false };
}
