/**
 * 场景物件测试 — 场景管理、物件 CRUD、碰撞检测
 */
import { assert, assertEq, assertNotNull, runSuite, summarize } from './test_harness';
import { initDatabase, closeDatabase } from '../src/common/database';
import { getAllScenes, getCurrentScene, getSceneById } from '../src/perception_space/scene_definition/scene_service';
import { initObjectService, getSceneObjects, getObjectById, getObjectsByScene, updateObjectState, moveObject } from '../src/perception_space/spatial_object/object_service';
import { checkCollision, objectsColliding, getObjectsInRange } from '../src/perception_space/spatial_collision/collision_service';

// ==================== 初始化 ====================

// 先初始化数据库
console.log('正在初始化数据库...');
initDatabase();
console.log('数据库初始化完成');
initObjectService();

// ==================== 场景管理 ====================

runSuite('场景 — 场景列表返回三个场景', () => {
  const scenes = getAllScenes();
  assertEq(scenes.length, 3, 'getAllScenes() 应返回 3 个场景');

  const ids = scenes.map(s => s.id).sort();
  assertEq(ids[0], 'home', '场景列表包含 home');
  assertEq(ids[1], 'office', '场景列表包含 office');
  assertEq(ids[2], 'outdoor', '场景列表包含 outdoor');
});

runSuite('场景 — getSceneById 能找到每个场景', () => {
  const home = getSceneById('home');
  const office = getSceneById('office');
  const outdoor = getSceneById('outdoor');

  assertNotNull(home, 'home 场景应存在');
  assertNotNull(office, 'office 场景应存在');
  assertNotNull(outdoor, 'outdoor 场景应存在');

  assertEq(home!.indoor, true, 'home 应为室内场景');
  assertEq(office!.indoor, true, 'office 应为室内场景');
  assertEq(outdoor!.indoor, false, 'outdoor 应为室外场景');
});

runSuite('场景 — getSceneById 对未知 ID 返回 undefined', () => {
  const unknown = getSceneById('non_existent');
  assert(unknown === undefined, '不存在的场景应返回 undefined');
});

runSuite('场景 — getCurrentScene 默认返回 home', () => {
  const scene = getCurrentScene();
  assertNotNull(scene, '当前场景不应为 null');
  assertEq(scene.id, 'home', '默认当前场景应为 home');
  assertEq(scene.name, '家', 'home 场景名称为"家"');
});

runSuite('场景 — 场景属性验证', () => {
  const home = getSceneById('home')!;
  const office = getSceneById('office')!;
  const outdoor = getSceneById('outdoor')!;

  // 面积
  assertEq(home.size_m2, 80, 'home 面积 80m²');
  assertEq(office.size_m2, 60, 'office 面积 60m²');
  assertEq(outdoor.size_m2, 5000, 'outdoor 面积 5000m²');

  // 光照类型
  assertEq(home.lighting, 'artificial', 'home 是 artificial 光照');
  assertEq(outdoor.lighting, 'natural', 'outdoor 是 natural 光照');

  // Z 轴范围
  assertEq(outdoor.max_z, 30, 'outdoor 高度限制 30m');
});

// ==================== 物件 CRUD ====================

runSuite('物件 — getSceneObjects 返回当前场景物件', () => {
  const objects = getSceneObjects();
  assert(objects.length > 0, '当前场景(home)应包含物件');

  // 验证至少包含一些已知物件
  const ids = objects.map(o => o.object_id);
  assert(ids.includes('sofa_1'), 'home 场景应包含 sofa_1');
  assert(ids.includes('bed_1'), 'home 场景应包含 bed_1');
  assert(ids.includes('fridge_1'), 'home 场景应包含 fridge_1');
});

runSuite('物件 — getObjectsByScene 按场景过滤', () => {
  const homeObjects = getObjectsByScene('home');
  const officeObjects = getObjectsByScene('office');
  const outdoorObjects = getObjectsByScene('outdoor');

  assert(homeObjects.length > 0, 'home 场景应有物件');
  assert(officeObjects.length > 0, 'office 场景应有物件');
  assert(outdoorObjects.length > 0, 'outdoor 场景应有物件');

  // 场景物件不应重复
  const homeIds = homeObjects.map(o => o.object_id);
  const officeIds = officeObjects.map(o => o.object_id);

  const overlap = homeIds.filter(id => officeIds.includes(id));
  assertEq(overlap.length, 0, 'home 和 office 物件ID不应重叠');
});

runSuite('物件 — getObjectById 查找物件', () => {
  const sofa = getObjectById('sofa_1');
  assertNotNull(sofa, 'sofa_1 应存在');
  assertEq(sofa!.display_name, '沙发', 'sofa_1 的 display_name 应为"沙发"');
  assertEq(sofa!.object_type, 'furniture', 'sofa_1 的 object_type 应为 furniture');
  assertEq(sofa!.scene_name, 'home', 'sofa_1 的 scene_name 应为 home');

  // 不存在的物件
  const nonexistent = getObjectById('nonexistent_999');
  assert(nonexistent === null, '不存在的物件应返回 null');
});

runSuite('物件 — 查询返回完整字段', () => {
  const obj = getObjectById('fridge_1');
  assertNotNull(obj, 'fridge_1 应存在');

  // 验证所有关键字段存在
  assertEq(typeof obj!.object_id, 'string', 'object_id 应为 string');
  assertEq(typeof obj!.display_name, 'string', 'display_name 应为 string');
  assertEq(typeof obj!.object_type, 'string', 'object_type 应为 string');
  assertEq(typeof obj!.scene_name, 'string', 'scene_name 应为 string');
  assertEq(typeof obj!.pos_x, 'number', 'pos_x 应为 number');
  assertEq(typeof obj!.pos_y, 'number', 'pos_y 应为 number');
  assertEq(typeof obj!.pos_z, 'number', 'pos_z 应为 number');
  assertEq(typeof obj!.radius, 'number', 'radius 应为 number');
  assertNotNull(obj!.state, 'state 不应为 null');
  assert(typeof obj!.state === 'object', 'state 应为 object');
});

// ==================== 物件状态更新 ====================

runSuite('物件 — updateObjectState 更新物件状态', () => {
  // 确保 kettle_1 初始为空
  const kettle = getObjectById('kettle_1');
  assertNotNull(kettle, 'kettle_1 应存在');

  // 装满水
  const updated = updateObjectState('kettle_1', {
    full: true,
    temperature: 100,
    quantity: 1500
  });

  assertNotNull(updated, 'updateObjectState 应返回更新后物件');
  assertEq(updated!.state.full, true, 'kettle 应变为 full=true');
  assertEq(updated!.state.temperature, 100, 'kettle 温度应变为 100');
  assertEq(updated!.state.quantity, 1500, 'kettle 数量应变为 1500');

  // 恢复原状态
  updateObjectState('kettle_1', { full: false, temperature: 25, quantity: undefined });
});

runSuite('物件 — updateObjectState 对不存在的物件返回 null', () => {
  const result = updateObjectState('nonexistent_999', { intact: false });
  assert(result === null, '更新不存在的物件应返回 null');
});

// ==================== 物件移动 ====================

runSuite('物件 — moveObject 移动物件位置', () => {
  const before = getObjectById('bread_1');
  assertNotNull(before, 'bread_1 应存在');

  const origX = before!.pos_x;
  const origY = before!.pos_y;

  const moved = moveObject('bread_1', 99, 88, 1.5);
  assertNotNull(moved, 'moveObject 应返回移动后物件');
  assertEq(moved!.pos_x, 99, 'pos_x 应更新为 99');
  assertEq(moved!.pos_y, 88, 'pos_y 应更新为 88');
  assertEq(moved!.pos_z, 1.5, 'pos_z 应更新为 1.5');

  // 恢复位置
  moveObject('bread_1', origX, origY, before!.pos_z);
});

runSuite('物件 — moveObject 对不存在的物件返回 null', () => {
  const result = moveObject('nonexistent_999', 0, 0, 0);
  assert(result === null, '移动不存在的物件应返回 null');
});

// ==================== 碰撞检测 ====================

runSuite('碰撞 — 场景边界检测', () => {
  // 当前在 home 场景，边长 sqrt(80) ≈ 8.94m
  const scene = getCurrentScene();
  const edge = Math.sqrt(scene.size_m2);

  // 出界
  const outOfBounds = checkCollision(-1, 4, 0);
  assertEq(outOfBounds.can_move, false, 'x<0 应不可移动');
  assert(outOfBounds.blocked_by === null, '边界碰撞不应有 blocked_by');

  const eastWall = checkCollision(edge + 1, 4, 0);
  assertEq(eastWall.can_move, false, 'x>edge 应不可移动');

  // 界内自由移动
  const inside = checkCollision(4, 4, 0);
  assertEq(inside.can_move, true, '场景内部应可自由移动');
});

runSuite('碰撞 — 物件碰撞检测', () => {
  // 直接走到沙发位置 (2, 3, 0)
  const hitSofa = checkCollision(2, 3, 0);
  assertEq(hitSofa.can_move, false, '走到沙发位置应被阻挡');
  assertEq(hitSofa.blocked_by, '沙发', '被沙发阻挡');

  // 走在远离所有物件的位置
  const safe = checkCollision(8, 8, 0);
  // 根据场景边界 8.94，8 在边界内
  assertEq(safe.can_move, true, '空旷位置应可通过');
});

runSuite('碰撞 — objectsColliding 物物件碰撞', () => {
  const sofa = getObjectById('sofa_1');
  const table = getObjectById('table_1');

  assertNotNull(sofa, 'sofa_1 应存在');
  assertNotNull(table, 'table_1 应存在');

  // sofa 在 (2,3) table 在 (5,2)，距离 ≈ 3.16，sofa radius=1.5, table radius=1.2, sum=2.7
  const colliding = objectsColliding(sofa!, table!);
  assertEq(colliding, false, '沙发与餐桌不应碰撞（距离>半径和）');

  // 自己和自己碰撞
  const selfCollide = objectsColliding(sofa!, sofa!);
  assertEq(selfCollide, true, '物件自身碰撞应为 true（位置相同）');
});

runSuite('碰撞 — getObjectsInRange 范围查询', () => {
  // 查询 (0, 0, 0) 附近 5m 内的物件
  const nearby = getObjectsInRange(0, 0, 0, 5);
  assert(nearby.length > 0, '原点附近 5m 应有物件');

  // 查询 (100, 100, 100) 极远处 1m 内无物件
  const faraway = getObjectsInRange(100, 100, 100, 1);
  assertEq(faraway.length, 0, '极远处 1m 内应无物件');
});

// ==================== 清理 ====================

runSuite('清理 — 关闭数据库', () => {
  closeDatabase();
  console.log('数据库已关闭');
});

summarize();
