/**
 * 空间碰撞检测 —— 防穿墙、防悬空、物件碰撞
 * 简化圆形碰撞区，场景边界检测
 */
import { log } from '../../common/utils';
import { getCurrentScene, getPlayerPosition, getSceneEdge } from '../scene_definition/scene_service';
import { getSceneObjects, SpatialObject } from '../spatial_object/object_service';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 碰撞结果
// ============================================================
export interface CollisionResult {
  can_move: boolean;
  /** 碰撞到的物件名，无则为null */
  blocked_by: string | null;
  /** 修正后的位置 */
  corrected: { x: number; y: number; z: number } | null;
  reason: string;
}

// ============================================================
// 核心碰撞检测
// ============================================================
/** 检测玩家移动到目标位置是否合法 */
export function checkCollision(
  targetX: number, targetY: number, targetZ: number
): CollisionResult {
  const scene = getCurrentScene();
  const edge = getSceneEdge();

  // 1. 场景边界检测
  if (targetX < 0) return { can_move: false, blocked_by: null, corrected: null, reason: '碰到西墙' };
  if (targetX > edge) return { can_move: false, blocked_by: null, corrected: null, reason: '碰到东墙' };
  if (targetY < 0) return { can_move: false, blocked_by: null, corrected: null, reason: '碰到南墙' };
  if (targetY > edge) return { can_move: false, blocked_by: null, corrected: null, reason: '碰到北墙' };
  if (targetZ < scene.min_z) return { can_move: false, blocked_by: null, corrected: { x: targetX, y: targetY, z: scene.min_z }, reason: '回到地面' };

  // 2. 物件碰撞检测（只检测 z=0 或 z=targetZ 层的物件）
  const objects = getSceneObjects();
  for (const obj of objects) {
    // 物件只在自身z高度±0.3米范围内阻挡
    if (Math.abs(targetZ - obj.pos_z) > 0.5) continue;
    // 大门类物件（窗户/门）不阻挡除非 explicit barrier
    if (obj.object_type === 'furniture' && (obj.state?.['open'] === true)) continue;

    const dx = targetX - obj.pos_x;
    const dy = targetY - obj.pos_y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = 0.3 + obj.radius; // 玩家半径0.3m + 物件碰撞半径

    if (dist < minDist) {
      return {
        can_move: false,
        blocked_by: obj.display_name,
        corrected: null,
        reason: `碰到 ${obj.display_name}`,
      };
    }
  }

  // 3. 悬空检测：z>0 且脚下没有物件支撑 → 掉落
  if (targetZ > 0) {
    const support = objects.find(obj => {
      if (obj.pos_z < targetZ - 0.1 && obj.pos_z > targetZ - 0.6) {
        const dx = targetX - obj.pos_x;
        const dy = targetY - obj.pos_y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < obj.radius;
      }
      return false;
    });

    if (!support) {
      // 没有支撑 → 触发掉落事件
      log('COLLISION', `悬空检测: z=${targetZ.toFixed(2)} 无支撑物 → 掉落`);
      worldBus.emit(WorldEvents.PHYSICS_OBJECT_FELL, {
        from_z: targetZ,
        to_z: scene.min_z,
        object: 'player',
      });
      return {
        can_move: false,
        blocked_by: null,
        corrected: { x: targetX, y: targetY, z: scene.min_z },
        reason: '没有支撑物，坠落到地面',
      };
    }
  }

  return { can_move: true, blocked_by: null, corrected: null, reason: '' };
}

/** 安全移动玩家——先检测再移动 */
export function safeMovePlayer(
  dx: number, dy: number, dz: number
): { x: number; y: number; z: number; moved: boolean; blocked: boolean; reason: string } {
  const { x, y, z } = getPlayerPosition();
  const targetX = x + dx;
  const targetY = y + dy;
  const targetZ = z + dz;

  const result = checkCollision(targetX, targetY, targetZ);

  if (result.can_move) {
    return { x: targetX, y: targetY, z: targetZ, moved: true, blocked: false, reason: '' };
  }

  if (result.corrected) {
    return {
      x: result.corrected.x,
      y: result.corrected.y,
      z: result.corrected.z,
      moved: true,
      blocked: false,
      reason: result.reason,
    };
  }

  return { x, y, z, moved: false, blocked: true, reason: result.reason };
}

/** 物物件之间碰撞检测 */
export function objectsColliding(obj1: SpatialObject, obj2: SpatialObject): boolean {
  const dx = obj1.pos_x - obj2.pos_x;
  const dy = obj1.pos_y - obj2.pos_y;
  const dz = obj1.pos_z - obj2.pos_z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return dist < (obj1.radius + obj2.radius);
}

/** 获取指定位置范围内的物件 */
export function getObjectsInRange(
  x: number, y: number, z: number, range: number
): SpatialObject[] {
  const objects = getSceneObjects();
  return objects.filter(obj => {
    const dx = obj.pos_x - x;
    const dy = obj.pos_y - y;
    const dz = obj.pos_z - z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist <= range;
  });
}
