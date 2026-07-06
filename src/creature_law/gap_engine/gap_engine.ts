/**
 * 预期-现实落差引擎 — P0-3 核心模块
 *
 * 位置：介于感知层与行为层之间，将"预期与现实之差"量化为情绪驱动力。
 * 不直接产生行为，但通过事件总线驱动行为系统和情感系统。
 *
 * 核心流程：
 *   1. 外部模块注册预期 → 存入 expectations 表
 *   2. 每个 tick 末尾收集现实值 → 计算 gap
 *   3. gap 分级、累积、衰减、交叉放大 → 广播 gap.generated 事件
 *
 * 六维预期域：
 *   - wellness:   健康/身体状态（睡眠、饮食、运动效果）
 *   - productivity: 工作产出/效率（任务完成量、专注时长）
 *   - social:     社交反馈（回复速度、关注度、认可度）
 *   - comfort:    舒适度（温度、环境、声音、空气）
 *   - weather:    天气预期（对比预报值 vs 实际值）
 *   - intimacy:   亲密关系（回应期望、触碰预期、情感反馈）
 *
 * 强度分级：
 *   轻微 gap < 10%  → 无感
 *   中等 10-30%     → 轻度情绪
 *   重度 30-50%     → 显著情绪
 *   极差 50%+        → 强烈情绪
 *
 * 累积与衰减：
 *   连续同向 gap → 放大 1.2x/次（上限 2.5x）
 *   无新 gap → 每 tick 衰减 5%（半衰期约14 tick）
 *
 * 交叉放大：
 *   多维度同时负向 → 互相放大 1.15x（如 productivity↓ + comfort↓ = 1.32x）
 */

import { getDb } from '../../common/database';
import { worldBus } from '../../core_bus/event_bus';

// ── 类型定义 ──

export type GapDimension = 'wellness' | 'productivity' | 'social' | 'comfort' | 'weather' | 'intimacy';

export interface GapExpectation {
  id: string;
  dimension: GapDimension;
  expected_value: number;     // 预期值 [0-100]
  tolerance: number;           // 容差 ± (0-100)
  source: string;              // 数据来源
  description: string;         // 人类可读描述
  expiry_tick: number;         // 过期tick，0=永不过期
  created_at_tick: number;
}

export interface GapSnapshot {
  dimension: GapDimension;
  expected: number;
  reality: number;
  gap: number;                 // expected - reality，正=失望，负=惊喜
  gap_percent: number;         // |gap|/expected * 100
  severity: 'none' | 'mild' | 'moderate' | 'severe' | 'extreme';
  direction: 'positive' | 'negative' | 'neutral';  // 正=低于预期(失望)，负=超出预期(惊喜)
  cumulative_multiplier: number;
  cross_amplified: boolean;
  timestamp_tick: number;
}

interface DimensionStack {
  recent_gaps: Array<{value: number; direction: 'positive' | 'negative'; tick: number}>;
  consecutive_count: number;
  cumulative_multiplier: number;
  last_tick: number;
}

// ── 运行时状态 ──

const expectations: Map<string, GapExpectation> = new Map();
const dimensionStacks: Map<GapDimension, DimensionStack> = new Map();
let tickCounter = 0;

// 衰减率（每 tick）
const DECAY_RATE = 0.05;
// 累积放大增量
const CUMULATIVE_INCREMENT = 0.2;
// 最大累积倍率
const MAX_CUMULATIVE_MULTIPLIER = 2.5;
// 交叉放大系数
const CROSS_AMPLIFY_FACTOR = 1.15;
// 历史窗口大小
const HISTORY_WINDOW = 10;

// ── 初始化 ──

function ensureGapTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS gap_expectations (
      id TEXT PRIMARY KEY,
      dimension TEXT NOT NULL,
      expected_value REAL NOT NULL,
      tolerance REAL NOT NULL DEFAULT 5,
      source TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      expiry_tick INTEGER NOT NULL DEFAULT 0,
      created_at_tick INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS gap_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension TEXT NOT NULL,
      expected REAL NOT NULL,
      reality REAL NOT NULL,
      gap REAL NOT NULL,
      gap_percent REAL NOT NULL,
      severity TEXT NOT NULL,
      direction TEXT NOT NULL,
      cumulative_multiplier REAL NOT NULL DEFAULT 1.0,
      cross_amplified INTEGER NOT NULL DEFAULT 0,
      timestamp_tick INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_gap_snapshots_tick ON gap_snapshots(timestamp_tick);
    CREATE INDEX IF NOT EXISTS idx_gap_snapshots_dim ON gap_snapshots(dimension);
  `);
}

function initDimensionStacks(): void {
  const dims: GapDimension[] = ['wellness', 'productivity', 'social', 'comfort', 'weather', 'intimacy'];
  for (const dim of dims) {
    dimensionStacks.set(dim, {
      recent_gaps: [],
      consecutive_count: 0,
      cumulative_multiplier: 1.0,
      last_tick: 0
    });
  }
}

export function initGapEngine(): void {
  ensureGapTables();
  initDimensionStacks();
}

// ── 注册预期 ──

export function registerExpectation(
  dimension: GapDimension,
  expectedValue: number,
  description: string,
  tolerance: number = 5,
  source: string = 'unknown',
  expiryTicks: number = 0
): string {
  const id = `exp_${dimension}_${tickCounter}_${Date.now()}`;
  const exp: GapExpectation = {
    id,
    dimension,
    expected_value: Math.max(0, Math.min(100, expectedValue)),
    tolerance,
    source,
    description,
    expiry_tick: expiryTicks > 0 ? tickCounter + expiryTicks : 0,
    created_at_tick: tickCounter
  };
  expectations.set(id, exp);

  // 持久化
  const db = getDb();
  db.prepare(`INSERT INTO gap_expectations (id, dimension, expected_value, tolerance, source, description, expiry_tick, created_at_tick)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, dimension, exp.expected_value, tolerance, source, description, exp.expiry_tick, tickCounter
  );

  worldBus.emit('gap.expectation_registered', { id, dimension, expected_value: expectedValue, description });
  return id;
}

export function removeExpectation(id: string): boolean {
  const existed = expectations.delete(id);
  if (existed) {
    getDb().prepare(`UPDATE gap_expectations SET status='removed' WHERE id=?`).run(id);
  }
  return existed;
}

export function getExpectations(dimension?: GapDimension): GapExpectation[] {
  const all = Array.from(expectations.values())
    .filter(e => e.expiry_tick === 0 || e.expiry_tick > tickCounter);
  return dimension ? all.filter(e => e.dimension === dimension) : all;
}

// ── 主 tick ──

export function tickGapEngine(dtSeconds: number): GapSnapshot[] {
  tickCounter++;

  const db = getDb();
  const snapshots: GapSnapshot[] = [];

  // 收集各维度活跃预期
  const activeExps = getExpectations();

  if (activeExps.length === 0) {
    // 没有活跃预期，对所有维度做衰减
    applyDecay();
    return [];
  }

  // 按维度分组
  const byDim: Map<GapDimension, GapExpectation[]> = new Map();
  for (const exp of activeExps) {
    if (!byDim.has(exp.dimension)) byDim.set(exp.dimension, []);
    byDim.get(exp.dimension)!.push(exp);
  }

  // 对每个维度计算 gap
  for (const [dim, exps] of byDim.entries()) {
    const reality = collectRealityValue(dim);

    // 取最严格的预期（最小的容忍度）
    const merged = mergeExpectations(exps);

    const gap = merged.expected_value - reality;
    const gapPercent = merged.expected_value > 0 ? (Math.abs(gap) / merged.expected_value) * 100 : 0;

    // 判断是否在容差范围内
    if (Math.abs(gapPercent) <= merged.tolerance) {
      // 在容差内，记录但不算有效gap
      continue;
    }

    const direction: 'positive' | 'negative' = gap > 0 ? 'positive' : 'negative';
    const severity = classifySeverity(gapPercent);

    // 累积与衰减
    const stack = dimensionStacks.get(dim)!;
    updateDimensionStack(stack, gap, direction);

    const snapshot: GapSnapshot = {
      dimension: dim,
      expected: merged.expected_value,
      reality,
      gap,
      gap_percent: Math.round(gapPercent * 100) / 100,
      severity,
      direction,
      cumulative_multiplier: stack.cumulative_multiplier,
      cross_amplified: false,
      timestamp_tick: tickCounter
    };
    snapshots.push(snapshot);
  }

  // 交叉放大检测
  if (snapshots.length >= 2) {
    const negatives = snapshots.filter(s => s.direction === 'positive'); // positive=失望
    if (negatives.length >= 2) {
      const crossFactor = Math.pow(CROSS_AMPLIFY_FACTOR, negatives.length - 1);
      for (const s of negatives) {
        s.cross_amplified = true;
        s.gap = Math.round(s.gap * crossFactor * 100) / 100;
        s.gap_percent = Math.min(100, Math.round(s.gap_percent * crossFactor * 100) / 100);
        s.severity = classifySeverity(s.gap_percent);
      }
    }
  }

  // 持久化与广播
  for (const s of snapshots) {
    db.prepare(`INSERT INTO gap_snapshots (dimension, expected, reality, gap, gap_percent, severity, direction, cumulative_multiplier, cross_amplified, timestamp_tick)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      s.dimension, s.expected, s.reality, s.gap, s.gap_percent, s.severity,
      s.direction, Number(s.cumulative_multiplier.toFixed(2)), Number(s.cross_amplified), s.timestamp_tick
    );

    worldBus.emit('gap.generated', s);
  }

  // 衰减无活动的维度
  for (const [dim, stack] of dimensionStacks.entries()) {
    if (!byDim.has(dim)) {
      decayDimensionStack(stack);
    }
  }

  return snapshots;
}

// ── 现实值收集 ──

function collectRealityValue(dim: GapDimension): number {
  // 从数据库最新记录中收集
  const db = getDb();
  try {
    switch (dim) {
      case 'wellness': {
        // 从 self_entity_state 获取
        const row = db.prepare(`SELECT * FROM self_entity_state ORDER BY tick DESC LIMIT 1`).get() as any;
        if (!row) return 70; // 默认
        return row.health_score || row.energy || 70;
      }
      case 'productivity': {
        const row = db.prepare(`SELECT COUNT(*) as cnt FROM action_log WHERE status='completed' AND started_at > ?`)
          .get(Math.floor(Date.now() / 1000) - 3600) as any;
        // 过去1h完成行为数，归一化到0-100
        return Math.min(100, (row?.cnt || 0) * 20);
      }
      case 'social': {
        // 社交反馈：从消息回复率近似
        const row = db.prepare(`SELECT * FROM self_entity_state ORDER BY tick DESC LIMIT 1`).get() as any;
        return row?.social_satisfaction || 60;
      }
      case 'comfort': {
        // 从场景+天气获取
        const envRow = db.prepare(`SELECT scene, temperature FROM scene_state ORDER BY tick DESC LIMIT 1`).get() as any;
        const temp = envRow?.temperature || 25;
        // 22-26°C 最舒适
        const comfort = 100 - Math.max(0, Math.abs(temp - 24) * 5);
        return Math.max(0, Math.min(100, comfort));
      }
      case 'weather': {
        const weatherRow = db.prepare(`SELECT * FROM weather_records ORDER BY timestamp_ms DESC LIMIT 1`).get() as any;
        return weatherRow?.comfort_index || 50;
      }
      case 'intimacy': {
        const row = db.prepare(`SELECT * FROM self_entity_state ORDER BY tick DESC LIMIT 1`).get() as any;
        return row?.intimacy_satisfaction || 50;
      }
      default:
        return 50;
    }
  } catch {
    return 50;
  }
}

// ── 预期合并 ──

function mergeExpectations(exps: GapExpectation[]): { expected_value: number; tolerance: number } {
  if (exps.length === 1) {
    return { expected_value: exps[0].expected_value, tolerance: exps[0].tolerance };
  }
  // 多预期取均值，容忍度取最严格
  const avg = exps.reduce((s, e) => s + e.expected_value, 0) / exps.length;
  const minTol = Math.min(...exps.map(e => e.tolerance));
  return { expected_value: Math.round(avg * 100) / 100, tolerance: minTol };
}

// ── 强度分级 ──

function classifySeverity(gapPercent: number): 'none' | 'mild' | 'moderate' | 'severe' | 'extreme' {
  if (gapPercent < 10) return 'mild';
  if (gapPercent < 30) return 'moderate';
  if (gapPercent < 50) return 'severe';
  return 'extreme';
}

// ── 累积与衰减 ──

function updateDimensionStack(
  stack: DimensionStack,
  gap: number,
  direction: 'positive' | 'negative'
): void {
  // 添加新 gap
  stack.recent_gaps.push({ value: gap, direction, tick: tickCounter });
  if (stack.recent_gaps.length > HISTORY_WINDOW) {
    stack.recent_gaps.shift();
  }

  // 检测连续性
  const last = stack.recent_gaps[stack.recent_gaps.length - 2];
  if (last && last.direction === direction) {
    stack.consecutive_count++;
    stack.cumulative_multiplier = Math.min(
      MAX_CUMULATIVE_MULTIPLIER,
      1.0 + stack.consecutive_count * CUMULATIVE_INCREMENT
    );
  } else {
    stack.consecutive_count = 1;
    stack.cumulative_multiplier = 1.0;
  }

  stack.last_tick = tickCounter;
}

function applyDecay(): void {
  for (const [, stack] of dimensionStacks) {
    decayDimensionStack(stack);
  }
}

function decayDimensionStack(stack: DimensionStack): void {
  if (stack.last_tick === tickCounter) return;

  // 清空过期记录
  stack.recent_gaps = stack.recent_gaps.filter(g => tickCounter - g.tick < HISTORY_WINDOW);

  // 衰减累积倍率
  if (stack.consecutive_count > 1 && tickCounter - stack.last_tick > 1) {
    stack.cumulative_multiplier = Math.max(1.0, stack.cumulative_multiplier - DECAY_RATE);
    if (stack.cumulative_multiplier <= 1.0) {
      stack.consecutive_count = 0;
      stack.cumulative_multiplier = 1.0;
    }
  }
}

// ── 查询 API ──

export function getRecentGaps(
  dimension?: GapDimension,
  limit: number = 20
): GapSnapshot[] {
  const db = getDb();
  let rows;
  if (dimension) {
    rows = db.prepare(`SELECT * FROM gap_snapshots WHERE dimension=? ORDER BY timestamp_tick DESC LIMIT ?`)
      .all(dimension, limit);
  } else {
    rows = db.prepare(`SELECT * FROM gap_snapshots ORDER BY timestamp_tick DESC LIMIT ?`)
      .all(limit);
  }
  return rows as GapSnapshot[];
}

export function getGapStats(dimension?: GapDimension): {
  total: number;
  avg_gap: number;
  positive_count: number;
  negative_count: number;
  dominant_mood: string;
} {
  const db = getDb();
  let rows: GapSnapshot[];
  if (dimension) {
    rows = db.prepare(`SELECT * FROM gap_snapshots WHERE dimension=? AND timestamp_tick > ?`)
      .all(dimension, Math.max(0, tickCounter - 100)) as GapSnapshot[];
  } else {
    rows = db.prepare(`SELECT * FROM gap_snapshots WHERE timestamp_tick > ?`)
      .all(Math.max(0, tickCounter - 100)) as GapSnapshot[];
  }

  const positiveCount = rows.filter(r => r.direction === 'positive').length;
  const negativeCount = rows.filter(r => r.direction === 'negative').length;
  const avgGap = rows.length > 0
    ? rows.reduce((s, r) => s + r.gap_percent, 0) / rows.length
    : 0;

  let dominantMood = 'neutral';
  if (positiveCount > negativeCount * 1.5) dominantMood = 'disappointed';
  else if (negativeCount > positiveCount * 1.5) dominantMood = 'pleased';
  else if (rows.length === 0) dominantMood = 'neutral';

  return {
    total: rows.length,
    avg_gap: Math.round(avgGap * 100) / 100,
    positive_count: positiveCount,
    negative_count: negativeCount,
    dominant_mood: dominantMood
  };
}

export function getDimensionStacks(): Map<GapDimension, { consecutive: number; multiplier: number }> {
  const result = new Map<GapDimension, { consecutive: number; multiplier: number }>();
  for (const [dim, stack] of dimensionStacks) {
    result.set(dim, {
      consecutive: stack.consecutive_count,
      multiplier: stack.cumulative_multiplier
    });
  }
  return result;
}
