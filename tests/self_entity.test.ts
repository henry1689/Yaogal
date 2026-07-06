/**
 * 自我实体模型集成测试
 */
import { strict as assert } from 'assert';
import { initDatabase, getDb, closeDatabase } from '../src/common/database';
import {
  initSelfEntity,
  getSelfState,
  getPosture, getAction, getScene,
  getEnergy, getFatigue, getHunger, getMoodBaseline, getHealth,
  setPosture, setAction, setScene, setClothing,
  modifyEnergy, modifyFatigue, modifyHunger, modifyMood, modifyHealth,
  setLimbFatigue, setLastBehavior, setStateTags,
  moveTo, setFacing, focusOn,
  selfEntityTick,
  getLimbFatigue, getPosition,
} from '../src/self_entity/self_entity_service';

// 需要先初始化数据库
initDatabase();
initSelfEntity();

// ============================================================
// 初始化测试
// ============================================================
console.log('--- 初始化测试 ---');

const initialState = getSelfState();
assert.strictEqual(initialState.posture, 'sit', '默认姿势应为 sit');
assert.strictEqual(initialState.action, 'idle', '默认动作为 idle');
assert.strictEqual(initialState.current_scene, 'home', '默认场景为 home');
assert.strictEqual(initialState.energy, 100, '默认精力 100');
assert.strictEqual(initialState.fatigue, 0, '默认疲劳 0');
assert.strictEqual(initialState.hunger, 0, '默认饥饿 0');
assert.strictEqual(initialState.mood_baseline, 50, '默认情绪 50');
console.log('  ✓ 默认状态正确');

// ============================================================
// 写入接口测试
// ============================================================
console.log('--- 写入接口测试 ---');

setPosture('stand');
assert.strictEqual(getPosture(), 'stand', 'setPosture 应生效');
setPosture('sit');

setAction('type');
assert.strictEqual(getAction(), 'type', 'setAction 应生效');

setScene('office');
assert.strictEqual(getScene(), 'office', 'setScene 应生效');
setScene('home');

setClothing('formal');
assert.strictEqual(getSelfState().clothing_state, 'formal', 'setClothing 应生效');

modifyEnergy(-20);
assert.strictEqual(getEnergy(), 80, 'modifyEnergy -20 → 80');

modifyEnergy(-100);
assert.strictEqual(getEnergy(), 0, 'modifyEnergy 有下限保护');

modifyEnergy(50);
assert.strictEqual(getEnergy(), 50, 'modifyEnergy 正常增减');

modifyFatigue(30);
assert.strictEqual(getFatigue(), 30, 'modifyFatigue');

modifyHunger(40);
assert.strictEqual(getHunger(), 40, 'modifyHunger');

modifyMood(10);
assert.strictEqual(getMoodBaseline(), 60, 'modifyMood');

modifyHealth(-30);
assert.strictEqual(getHealth(), 70, 'modifyHealth');

// 恢复
modifyEnergy(50);
modifyFatigue(-30);
modifyHunger(-40);
modifyMood(-10);
modifyHealth(30);

assert.strictEqual(getEnergy(), 100);
assert.strictEqual(getFatigue(), 0);
assert.strictEqual(getHunger(), 0);
assert.strictEqual(getMoodBaseline(), 50);
assert.strictEqual(getHealth(), 100);
console.log('  ✓ 所有写入接口正常');

// ============================================================
// 空间状态测试
// ============================================================
console.log('--- 空间状态测试 ---');

moveTo(3, 0, 1);
const pos = getPosition();
assert.strictEqual(pos.x, 3);
assert.strictEqual(pos.y, 0);
assert.strictEqual(pos.z, 1);
console.log('  ✓ 空间坐标正常');

setFacing(90);
assert.strictEqual(getSelfState().facing, 90, '朝向正常');
setFacing(400);
assert.strictEqual(getSelfState().facing, 40, '朝向取模正常');  // 400 % 360 = 40
console.log('  ✓ 朝向设置正常');

// ============================================================
// 注意力测试
// ============================================================
console.log('--- 注意力测试 ---');

focusOn('电脑屏幕', 0.8);
assert.strictEqual(getSelfState().focus_target, '电脑屏幕');
assert.strictEqual(getSelfState().focus_intensity, 0.8);
focusOn(null);
assert.strictEqual(getSelfState().focus_target, null);
console.log('  ✓ 注意力焦点正常');

// ============================================================
// 肢体疲劳测试
// ============================================================
console.log('--- 肢体疲劳测试 ---');

setLimbFatigue('back', 50);
setLimbFatigue('neck', 30);
const lf = getLimbFatigue();
assert.strictEqual(lf.back, 50);
assert.strictEqual(lf.neck, 30);
console.log('  ✓ 肢体疲劳设置正常');

// ============================================================
// 行为和标签测试
// ============================================================
console.log('--- 行为标签测试 ---');

setLastBehavior('drink_water');
assert.strictEqual(getSelfState().last_behavior, 'drink_water');
setStateTags('集中,工作');
assert.strictEqual(getSelfState().state_tags, '集中,工作');
console.log('  ✓ 行为标签正常');

// ============================================================
// tick 测试
// ============================================================
console.log('--- tick 测试 ---');

// 重置状态
modifyEnergy(100 - getEnergy());
modifyFatigue(-getFatigue());
modifyHunger(-getHunger());

// 坐姿 tick 10 秒
selfEntityTick(10);
const afterTick = getSelfState();
assert.ok(afterTick.fatigue > 0, '疲劳应累积');
assert.ok(afterTick.hunger > 0, '饥饿应累积');
assert.ok(afterTick.limb_fatigue.back > 0, '久坐背部疲劳应累积');
assert.ok(afterTick.limb_fatigue.neck > 0, '久坐颈部疲劳应累积');
console.log('  ✓ 坐姿tick正常');

// 躺下恢复
setPosture('lie');
modifyFatigue(50); // 先加一些疲劳
const fatigueBefore = getFatigue();
selfEntityTick(10);
assert.ok(getFatigue() < fatigueBefore, '躺下应恢复疲劳');
console.log('  ✓ 躺下恢复正常');

// 站立疲劳
setPosture('stand');
modifyFatigue(-getFatigue()); // 清空
selfEntityTick(10);
const lf2 = getLimbFatigue();
assert.ok(lf2.left_leg > 0 || lf2.right_leg > 0, '站立腿部疲劳应累积');
assert.ok(getFatigue() > 0, '站立疲劳应累积');
console.log('  ✓ 站立tick正常');

// ============================================================
// 持久化测试
// ============================================================
console.log('--- 持久化测试 ---');

const db = getDb();
const count = db.prepare('SELECT COUNT(*) as cnt FROM self_state').get() as any;
assert.ok(count.cnt > 0, 'self_state 表应有记录');
console.log(`  ✓ 持久化正常 (${count.cnt} 条记录)`);

closeDatabase();
console.log('\n✅ 自我实体模型测试全部通过');
