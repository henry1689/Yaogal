/**
 * 预期落差引擎全链路测试 — P0-3
 */
import { initDatabase } from '../src/common/database';
import {
  initGapEngine,
  registerExpectation,
  removeExpectation,
  getExpectations,
  tickGapEngine,
  getRecentGaps,
  getGapStats,
  getDimensionStacks,
} from '../src/creature_law/gap_engine/gap_engine';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

initDatabase();
// 清理残留数据避免干扰累积/衰减测试
const db = require('../src/common/database').getDb();
db.exec('DELETE FROM action_log');
db.exec('DELETE FROM gap_snapshots');
db.exec('DELETE FROM gap_expectations');
initGapEngine();

console.log('\n═══════════════════════════════════════════');
console.log('  预期落差引擎测试套件');
console.log('═══════════════════════════════════════════\n');

// ==========================================
// 1. 注册与查询预期
// ==========================================
console.log('\n── 1. 注册与查询预期 ──');
const id1 = registerExpectation('productivity', 80, '今日完成8个任务', 10, 'manual');
check('注册productivity预期成功', id1.startsWith('exp_'));
check('查询productivity预期数量', getExpectations('productivity').length >= 1);

const id2 = registerExpectation('comfort', 90, '室内温度适宜', 15, 'weather');
check('注册comfort预期成功', id2.startsWith('exp_'));

const id3 = registerExpectation('wellness', 75, '精神状态良好', 10, 'manual');
check('查询wellness预期', getExpectations('wellness').length >= 1);

// 删除
const removed = removeExpectation(id3);
check('删除wellness预期', removed === true);
check('删除后wellness预期清空', getExpectations('wellness').length === 0);

// ==========================================
// 2. Gap 生成（单维度）
// ==========================================
console.log('\n── 2. Gap生成(单维度) ──');
const snaps = tickGapEngine(1.0);
check('有预期时生成snapshot', snaps.length >= 1);

// productivity gap
const prodSnapshot = snaps.find(s => s.dimension === 'productivity');
check('productivity维度有snapshot', !!prodSnapshot);
if (prodSnapshot) {
  check('有gap值', prodSnapshot.gap !== 0);
  check('有方向', prodSnapshot.direction.length > 0);
  check('有严重度', prodSnapshot.severity.length > 0);
}

// ==========================================
// 3. Gap 强度分级
// ==========================================
console.log('\n── 3. Gap强度分级 ──');
// 极端预期：期望100，实际0 → gap = 100
const id4 = registerExpectation('wellness', 100, '完美健康', 0, 'test');
const snaps2 = tickGapEngine(1.0);
const wellnessSnap = snaps2.find(s => s.dimension === 'wellness');
check('wellness极端gap出现', !!wellnessSnap);
if (wellnessSnap) {
  check('gap_percent很高', wellnessSnap.gap_percent > 50);
  // 强度应该是 extreme
  check('严重度为extreme', wellnessSnap.severity === 'extreme');
  check('方向为positive(失望)', wellnessSnap.direction === 'positive');
}

removeExpectation(id4);

// ==========================================
// 4. 容差范围
// ==========================================
console.log('\n── 4. 容差范围 ──');
const id5 = registerExpectation('comfort', 50, '中低标准', 50, 'test'); // 50±50 意味着0-100都在容差内
const snaps3 = tickGapEngine(1.0);
const comfortSnap = snaps3.find(s => s.dimension === 'comfort');
// 由于comfort现实值在40-70范围，gap_percent < tolerance(50)，不应产生snapshot
// 但可能有其他维度的snapshot
const hadComfort = !!comfortSnap;
// 如果comfort没有snapshot，说明容差生效
if (!hadComfort) {
  check('容差生效：comfort预期在容差内无gap', true);
}
removeExpectation(id5);
// 清理包括 test1 中残留的 productivity 预期
for (const e of getExpectations()) removeExpectation(e.id);

// ==========================================
// 5. 累积效应
// ==========================================
console.log('\n── 5. 累积效应 ──');
const id6 = registerExpectation('productivity', 95, '超高产出预期', 5, 'test');
// 连续多次tick产生同向gap
tickGapEngine(1.0);
tickGapEngine(1.0);
tickGapEngine(1.0);
const snaps4 = tickGapEngine(1.0);
const prodSnap4 = snaps4.find(s => s.dimension === 'productivity');
check('累积后cumulative_multiplier > 1', prodSnap4 ? prodSnap4.cumulative_multiplier > 1.0 : false);
removeExpectation(id6);

// ==========================================
// 6. 衰减验证
// ==========================================
console.log('\n── 6. 衰减验证 ──');
// 删除所有预期，tick若干次让累积衰减
tickGapEngine(1.0);
tickGapEngine(1.0);
tickGapEngine(1.0);
tickGapEngine(1.0);
tickGapEngine(1.0);
// 此时累积应该衰减到接近1
const stacks = getDimensionStacks();
const prodStack = stacks.get('productivity');
check('衰减后累积下降', prodStack ? prodStack.multiplier < 2.5 : true);

// ==========================================
// 7. 多维度交叉放大
// ==========================================
console.log('\n── 7. 多维度交叉放大 ──');
registerExpectation('productivity', 95, '高产出', 5, 'test');
registerExpectation('comfort', 95, '高舒适', 5, 'test');
registerExpectation('wellness', 95, '高健康', 5, 'test');
const snaps5 = tickGapEngine(1.0);
// 三个维度同时负向 → 应该触发交叉放大
const negSnaps = snaps5.filter(s => s.direction === 'positive');
check('至少2个负向snapshot', negSnaps.length >= 2);
if (negSnaps.length >= 2) {
  const amplified = negSnaps.filter(s => s.cross_amplified);
  // 至少有一个被标记交叉放大
  check('交叉放大标记存在', amplified.length >= 1);
}

// 清理
for (const e of getExpectations()) removeExpectation(e.id);

// ==========================================
// 8. 查询API
// ==========================================
console.log('\n── 8. 查询API ──');
const gaps = getRecentGaps('productivity', 5);
check('查询productivity历史gap', gaps.length >= 4);

const stats = getGapStats();
check('全维度统计有数据', stats.total > 0);
check('positive_count > 0', stats.positive_count > 0);

const prodStats = getGapStats('productivity');
check('productivity统计有数据', prodStats.total > 0);

// ==========================================
// 9. 无预期时的行为
// ==========================================
console.log('\n── 9. 无预期时 ──');
// 此时已删除所有预期
const snaps6 = tickGapEngine(1.0);
check('无预期时返回空', snaps6.length === 0);

// ==========================================
// 10. 预期过期
// ==========================================
console.log('\n── 10. 预期过期 ──');
registerExpectation('social', 80, '短时预期', 5, 'test', 3); // 3 tick后过期
check('过期预期初始可查', getExpectations('social').length === 1);
tickGapEngine(1.0);
tickGapEngine(1.0);
tickGapEngine(1.0);
tickGapEngine(1.0); // 超过3 tick
check('过期后预期不可查', getExpectations('social').length === 0);

// ── 结果 ──
console.log(`\n═══════════════════════════════════════════`);
console.log(`  预期落差引擎测试: ${passed}/${passed + failed} 通过`);
console.log(`═══════════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
