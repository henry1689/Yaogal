/**
 * 空间物件管理 — 物件CRUD + 状态持久化
 * 每个物件属于一个场景，状态变更触发事件
 */
import { getDb } from '../../common/database';
import { log, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';
import { getCurrentScene } from '../scene_definition/scene_service';

// ============================================================
// 类型定义
// ============================================================
export type ObjectType = 'furniture' | 'appliance' | 'small_item' | 'food_drink' | 'consumable';

export interface SpatialObject {
  scene_name: string;
  object_id: string;
  object_type: ObjectType;
  display_name: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  state: Record<string, any>;
  radius: number;       // 碰撞半径(米)
  last_interaction_ms: number | null;
}

export interface ObjectState {
  intact?: boolean;    // 完好
  damaged?: boolean;   // 损坏
  in_use?: boolean;    // 使用中
  empty?: boolean;     // 空
  full?: boolean;      // 满
  open?: boolean;      // 开
  closed?: boolean;    // 关
  on?: boolean;        // 通电
  off?: boolean;       // 断电
  quantity?: number;   // 数量
  temperature?: number;// 温度
  freshness?: number;  // 新鲜度 0-100
  [key: string]: any;
}

// ============================================================
// 初始化默认物件
// ============================================================
const DEFAULT_OBJECTS: Omit<SpatialObject, 'last_interaction_ms'>[] = [
  // 居家场景
  { scene_name: 'home', object_id: 'sofa_1', object_type: 'furniture', display_name: '沙发', pos_x: 2, pos_y: 3, pos_z: 0, state: { intact: true, clean: true }, radius: 1.5 },
  { scene_name: 'home', object_id: 'table_1', object_type: 'furniture', display_name: '餐桌', pos_x: 5, pos_y: 2, pos_z: 0, state: { intact: true, clean: true }, radius: 1.2 },
  { scene_name: 'home', object_id: 'bed_1', object_type: 'furniture', display_name: '床', pos_x: 6, pos_y: 5, pos_z: 0.5, state: { intact: true, made: true }, radius: 1.8 },
  { scene_name: 'home', object_id: 'fridge_1', object_type: 'appliance', display_name: '冰箱', pos_x: 1, pos_y: 6, pos_z: 0, state: { on: true, full: true, temperature: 4 }, radius: 0.7 },
  { scene_name: 'home', object_id: 'tv_1', object_type: 'appliance', display_name: '电视', pos_x: 3, pos_y: 1, pos_z: 0.8, state: { off: true }, radius: 0.3 },
  { scene_name: 'home', object_id: 'kettle_1', object_type: 'small_item', display_name: '水壶', pos_x: 1.5, pos_y: 5, pos_z: 1, state: { full: false, temperature: 25 }, radius: 0.2 },
  { scene_name: 'home', object_id: 'teacup_1', object_type: 'small_item', display_name: '茶杯', pos_x: 4.5, pos_y: 2.5, pos_z: 0.9, state: { empty: true, temperature: 25, concentration: 100 }, radius: 0.1 },
  { scene_name: 'home', object_id: 'candle_1', object_type: 'consumable', display_name: '蜡烛', pos_x: 5, pos_y: 3, pos_z: 0.9, state: { off: true, quantity: 100, burning: false }, radius: 0.05 },
  { scene_name: 'home', object_id: 'window_1', object_type: 'furniture', display_name: '窗户', pos_x: 0.5, pos_y: 4, pos_z: 1.5, state: { closed: true, intact: true }, radius: 0.1 },
  { scene_name: 'home', object_id: 'bread_1', object_type: 'food_drink', display_name: '面包', pos_x: 5.5, pos_y: 2.5, pos_z: 0.9, state: { freshness: 100, quantity: 1 }, radius: 0.1 },
  // 办公室
  { scene_name: 'office', object_id: 'desk_1', object_type: 'furniture', display_name: '工位桌', pos_x: 2, pos_y: 3, pos_z: 0, state: { intact: true, clean: true }, radius: 0.8 },
  { scene_name: 'office', object_id: 'chair_1', object_type: 'furniture', display_name: '办公椅', pos_x: 2.5, pos_y: 3.5, pos_z: 0, state: { intact: true }, radius: 0.3 },
  { scene_name: 'office', object_id: 'computer_1', object_type: 'appliance', display_name: '电脑', pos_x: 2, pos_y: 3, pos_z: 0.8, state: { off: true }, radius: 0.2 },
  { scene_name: 'office', object_id: 'office_window_1', object_type: 'furniture', display_name: '窗户', pos_x: 0.5, pos_y: 2, pos_z: 1.5, state: { closed: true }, radius: 0.1 },
  // 户外
  { scene_name: 'outdoor', object_id: 'bench_1', object_type: 'furniture', display_name: '长椅', pos_x: 20, pos_y: 30, pos_z: 0, state: { intact: true }, radius: 1 },
  { scene_name: 'outdoor', object_id: 'tree_1', object_type: 'furniture', display_name: '大树', pos_x: 15, pos_y: 25, pos_z: 0, state: { intact: true }, radius: 2 },
  { scene_name: 'outdoor', object_id: 'tree_2', object_type: 'furniture', display_name: '松树', pos_x: 25, pos_y: 35, pos_z: 0, state: { intact: true }, radius: 1.5 },
  { scene_name: 'outdoor', object_id: 'pond_1', object_type: 'furniture', display_name: '小池塘', pos_x: 30, pos_y: 20, pos_z: 0, state: { intact: true, frozen: false }, radius: 3 },
];

// ============================================================
// 初始化
// ============================================================
let initialized = false;

export function initObjectService(): void {
  if (initialized) return;
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as cnt FROM spatial_objects').get() as any;
  if (existing.cnt === 0) {
    log('OBJECT', '初始化默认物件...');
    const insert = db.prepare(`
      INSERT INTO spatial_objects (scene_name, object_id, object_type, display_name, pos_x, pos_y, pos_z, state_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const obj of DEFAULT_OBJECTS) {
        insert.run(obj.scene_name, obj.object_id, obj.object_type, obj.display_name, obj.pos_x, obj.pos_y, obj.pos_z, JSON.stringify(obj.state));
      }
    });
    tx();
    log('OBJECT', `已创建 ${DEFAULT_OBJECTS.length} 个默认物件`);
  } else {
    log('OBJECT', `已有 ${existing.cnt} 个物件，跳过初始化`);
  }
  initialized = true;
}

// ============================================================
// 公共API
// ============================================================
/** 获取当前场景的所有物件 */
export function getSceneObjects(): SpatialObject[] {
  const scene = getCurrentScene();
  return getObjectsByScene(scene.id);
}

export function getObjectsByScene(sceneName: string): SpatialObject[] {
  const rows = getDb().prepare(
    'SELECT * FROM spatial_objects WHERE scene_name = ?'
  ).all(sceneName) as any[];

  return rows.map(rowToObject);
}

export function getObjectById(objectId: string): SpatialObject | null {
  const row = getDb().prepare(
    'SELECT * FROM spatial_objects WHERE object_id = ?'
  ).get(objectId) as any;

  return row ? rowToObject(row) : null;
}

/** 更新物件状态 —— 触发事件 */
export function updateObjectState(objectId: string, newState: Partial<ObjectState>): SpatialObject | null {
  const obj = getObjectById(objectId);
  if (!obj) return null;

  const mergedState = { ...obj.state, ...newState };
  const db = getDb();

  db.prepare(`
    UPDATE spatial_objects SET state_json = ?, last_interaction_ms = ?, updated_at = datetime('now')
    WHERE object_id = ?
  `).run(JSON.stringify(mergedState), nowMs(), objectId);

  const updated = getObjectById(objectId)!;

  worldBus.emit(WorldEvents.OBJECT_STATE_CHANGED, {
    object_id: objectId,
    display_name: obj.display_name,
    old_state: obj.state,
    new_state: mergedState,
    timestamp_ms: nowMs(),
  });

  log('OBJECT', `物件状态变更: ${obj.display_name} (${objectId})`);
  return updated;
}

/** 移动物件位置 */
export function moveObject(objectId: string, pos_x: number, pos_y: number, pos_z: number): SpatialObject | null {
  const obj = getObjectById(objectId);
  if (!obj) return null;

  getDb().prepare(`
    UPDATE spatial_objects SET pos_x = ?, pos_y = ?, pos_z = ?, updated_at = datetime('now')
    WHERE object_id = ?
  `).run(pos_x, pos_y, pos_z, objectId);

  return getObjectById(objectId);
}

function rowToObject(row: any): SpatialObject {
  const state = JSON.parse(row.state_json || '{}');
  return {
    scene_name: row.scene_name,
    object_id: row.object_id,
    object_type: row.object_type,
    display_name: row.display_name,
    pos_x: row.pos_x,
    pos_y: row.pos_y,
    pos_z: row.pos_z,
    state,
    radius: state.radius ?? getDefaultRadius(row.object_type),
    last_interaction_ms: row.last_interaction_ms,
  };
}

function getDefaultRadius(type: ObjectType): number {
  const map: Record<ObjectType, number> = {
    furniture: 1,
    appliance: 0.5,
    small_item: 0.15,
    food_drink: 0.1,
    consumable: 0.1,
  };
  return map[type];
}
