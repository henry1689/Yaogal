/**
 * 生理服务测试 — physio_service
 * 伤病愈合、孕期时序
 */
import { initDatabase, getDb } from '../src/common/database';
import { applyInjury, startPregnancy } from '../src/creature_law/human_physio/physio_service';
import { assert, assertEq, assertClose, assertNotNull, runSuite, summarize } from './test_harness';

// 初始化数据库
initDatabase();

runSuite('applyInjury 伤病触发', () => {
  const db = getDb();

  // === 轻度擦伤 severity=1，预计3天愈合 ===
  applyInjury('轻度擦伤', 1);
  let row = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  assertNotNull(row, 'physio_state 行存在');
  assertEq(row.injury_type, '轻度擦伤', 'injury_type 应为 轻度擦伤');
  assertEq(row.injury_severity, 1, 'severity=1');
  assertEq(row.health_score, 50, '受伤后 health_score=50');
  assert(row.injury_start_ms > 0, 'injury_start_ms 已设置');
  assert(row.injury_heal_by_ms > 0, 'injury_heal_by_ms 已设置');
  const healDuration1 = row.injury_heal_by_ms - row.injury_start_ms;
  const expectedDuration1 = 3 * 24 * 60 * 60 * 1000;
  assertClose(healDuration1, expectedDuration1, 1000, 'severity=1 愈合时间约3天');

  // === 轻伤 severity=2，预计7天愈合 ===
  applyInjury('轻伤', 2);
  row = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  assertEq(row.injury_type, '轻伤', 'injury_type 应为 轻伤');
  assertEq(row.injury_severity, 2, 'severity=2');
  const healDuration2 = row.injury_heal_by_ms - row.injury_start_ms;
  const expectedDuration2 = 7 * 24 * 60 * 60 * 1000;
  assertClose(healDuration2, expectedDuration2, 1000, 'severity=2 愈合时间约7天');

  // === 重伤 severity=3，预计30天愈合 ===
  applyInjury('重伤', 3);
  row = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  assertEq(row.injury_type, '重伤', 'injury_type 应为 重伤');
  assertEq(row.injury_severity, 3, 'severity=3');
  const healDuration3 = row.injury_heal_by_ms - row.injury_start_ms;
  const expectedDuration3 = 30 * 24 * 60 * 60 * 1000;
  assertClose(healDuration3, expectedDuration3, 1000, 'severity=3 愈合时间约30天');
});

runSuite('startPregnancy 孕期启动', () => {
  const db = getDb();
  const beforeMs = Date.now();

  startPregnancy();

  const row = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  assertNotNull(row, 'physio_state 行存在');
  assertEq(row.pregnancy_stage, 'early', 'pregnancy_stage 应为 early');
  assert(row.pregnancy_start_ms > 0, 'pregnancy_start_ms 已设置');
  assert(row.pregnancy_due_ms > 0, 'pregnancy_due_ms 已设置');

  // 预产期是280天后（±1天误差 = ±86400000ms）
  const expectedDue = beforeMs + 280 * 24 * 60 * 60 * 1000;
  assertClose(row.pregnancy_due_ms, expectedDue, 86400000, '预产期约280天后（±1天）');

  // 清理：重置孕期状态
  db.prepare(`UPDATE physio_state SET pregnancy_stage = NULL, pregnancy_start_ms = NULL, pregnancy_due_ms = NULL WHERE id = 1`).run();
});

summarize();
