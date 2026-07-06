/**
 * 力交互 — 拾取/放置/推拉基础行为判定
 * 极简物理交互，不涉及复杂力学
 */
import { log, nowMs } from '../../common/utils';
import { getObjectById, updateObjectState, SpatialObject } from '../../perception_space/spatial_object/object_service';
import { getPlayerPosition } from '../../perception_space/scene_definition/scene_service';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 手持物品
// ============================================================
let heldObject: string | null = null;

/** 拾取物品 */
export function pickUpObject(objectId: string): { ok: boolean; message: string } {
  if (heldObject) {
    return { ok: false, message: `手里已经拿着 ${heldObject}` };
  }

  const obj = getObjectById(objectId);
  if (!obj) return { ok: false, message: `物件不存在: ${objectId}` };

  // 只能拾取 small_item 和 consumable
  if (!['small_item', 'consumable', 'food_drink'].includes(obj.object_type)) {
    return { ok: false, message: `${obj.display_name} 太重了，无法拾取` };
  }

  // 距离检测
  const player = getPlayerPosition();
  const dist = Math.sqrt(
    (player.x - obj.pos_x) ** 2 + (player.y - obj.pos_y) ** 2 + (player.z - obj.pos_z) ** 2
  );
  if (dist > 1.5) {
    return { ok: false, message: `${obj.display_name} 太远了 (${dist.toFixed(1)}m)` };
  }

  heldObject = objectId;
  updateObjectState(objectId, { in_use: true });

  log('FORCE', `拾起 ${obj.display_name} (${objectId})`);
  return { ok: true, message: `拾起 ${obj.display_name}` };
}

/** 放下物品 */
export function putDownObject(position?: { x: number; y: number; z: number }): { ok: boolean; message: string } {
  if (!heldObject) return { ok: false, message: '手里没有物品' };

  const obj = getObjectById(heldObject);
  if (!obj) { heldObject = null; return { ok: false, message: '物品已不存在' }; }

  const pos = position || getPlayerPosition();
  updateObjectState(heldObject, { in_use: false });

  log('FORCE', `放下 ${obj.display_name} (${heldObject}) 到 (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
  heldObject = null;
  return { ok: true, message: `放下 ${obj.display_name}` };
}

export function getHeldObject(): string | null {
  return heldObject;
}

// ============================================================
// 推拉
// ============================================================
/** 推/拉物件（仅家具类） */
export function pushObject(objectId: string, direction_deg: number, force: number): { ok: boolean; message: string } {
  const obj = getObjectById(objectId);
  if (!obj) return { ok: false, message: `物件不存在: ${objectId}` };

  if (obj.object_type !== 'furniture') {
    return { ok: false, message: `${obj.display_name} 不适合推拉` };
  }

  // 距离检测
  const player = getPlayerPosition();
  const dist = Math.sqrt(
    (player.x - obj.pos_x) ** 2 + (player.y - obj.pos_y) ** 2
  );
  if (dist > 1.0) {
    return { ok: false, message: `${obj.display_name} 太远了` };
  }

  // 新位置
  const rad = (direction_deg * Math.PI) / 180;
  const moveDist = force * 0.1; // 力量转换为位移
  const newX = obj.pos_x + moveDist * Math.cos(rad);
  const newY = obj.pos_y + moveDist * Math.sin(rad);

  // 更新位置
  const { moveObject } = require('../../perception_space/spatial_object/object_service');
  moveObject(objectId, newX, newY, obj.pos_z);

  log('FORCE', `${force > 0 ? '推' : '拉'} ${obj.display_name} 沿 ${direction_deg}°方向 ${Math.abs(force).toFixed(1)} 米`);
  return { ok: true, message: `${force > 0 ? '推' : '拉'}动了 ${obj.display_name}` };
}

// ============================================================
// 开关物件
// ============================================================
/** 开关物件（灯/电视/窗户/门等） */
export function toggleObject(objectId: string, action: 'open' | 'close' | 'on' | 'off'): { ok: boolean; message: string } {
  const obj = getObjectById(objectId);
  if (!obj) return { ok: false, message: `物件不存在: ${objectId}` };

  // 距离检测
  const player = getPlayerPosition();
  const dist = Math.sqrt(
    (player.x - obj.pos_x) ** 2 + (player.y - obj.pos_y) ** 2 + (player.z - obj.pos_z) ** 2
  );
  if (dist > 1.5) {
    return { ok: false, message: `${obj.display_name} 太远了` };
  }

  let newState: Record<string, any> = {};

  if (action === 'open' || action === 'close') {
    newState = { open: action === 'open', closed: action === 'close' };
  } else {
    newState = { on: action === 'on', off: action === 'off' };
  }

  updateObjectState(objectId, newState);

  const verb = action === 'open' ? '打开' : action === 'close' ? '关闭' : action === 'on' ? '开启' : '关闭';
  log('FORCE', `${verb}${obj.display_name}`);
  return { ok: true, message: `已${verb}${obj.display_name}` };
}
