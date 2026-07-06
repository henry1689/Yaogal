/**
 * 世界Hook探针系统 — 独立监控所有模块运行时状态
 * 每个Hook独立运行，不耦合被监控模块
 * 定时采样 → 阈值告警 → 写入数据库
 */
import { getDb } from '../../common/database';
import { log, nowMs, clamp } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';
import { getCurrentScene, getPlayerPosition, isSceneTransitioning, getTransitionProgress } from '../../perception_space/scene_definition/scene_service';
import { getSceneObjects, getObjectById } from '../../perception_space/spatial_object/object_service';
import { getFallingObjects, getSlidingObjects, getJumpState } from '../../simple_physics/basic_gravity/gravity_service';
import { getAllCoolingStates, getFoodFreshness, getTeaState, getBurnState } from '../../simple_physics/simple_chem/chem_service';
import { getHeldObject } from '../../simple_physics/force_interact/force_service';

// ============================================================
// Hook 类型
// ============================================================
export interface HookSnapshot {
  hook_id: string;
  module: string;
  metric: string;
  value: number;
  threshold: number;
  status: 'ok' | 'warning' | 'critical';
  message: string;
  timestamp_ms: number;
}

// ============================================================
// 各 Hook 实现
// ============================================================

/** Hook 1: 场景连通性检查 */
function hookSceneTransition(): HookSnapshot {
  const transitioning = isSceneTransitioning();
  const progress = getTransitionProgress();
  const status = transitioning ? 'ok' : 'ok';

  return {
    hook_id: 'scene_transition',
    module: 'perception_space',
    metric: 'transition_progress',
    value: progress?.progress ?? 100,
    threshold: 0,
    status,
    message: transitioning
      ? `场景切换中: 进度 ${progress?.progress ?? 0}%，剩余 ${progress?.remaining_sec ?? 0}s`
      : '无场景切换',
    timestamp_ms: nowMs(),
  };
}

/** Hook 2: 物件健康检查 */
function hookObjectsHealth(): HookSnapshot[] {
  const objects = getSceneObjects();
  const snapshots: HookSnapshot[] = [];

  const total = objects.length;
  let damaged = 0;
  let onFire = 0;

  for (const obj of objects) {
    if (obj.state?.damaged) damaged++;
    if (obj.state?.burning) onFire++;
  }

  if (onFire > 0) {
    snapshots.push({
      hook_id: 'objects_fire',
      module: 'perception_space',
      metric: 'burning_objects',
      value: onFire,
      threshold: 0,
      status: 'critical',
      message: `当前场景有 ${onFire} 个物品在燃烧！`,
      timestamp_ms: nowMs(),
    });
  }

  if (damaged > 0) {
    snapshots.push({
      hook_id: 'objects_damaged',
      module: 'perception_space',
      metric: 'damaged_objects',
      value: damaged,
      threshold: total * 0.3,
      status: damaged > total * 0.3 ? 'warning' : 'ok',
      message: `当前场景 ${damaged}/${total} 个物品损坏`,
      timestamp_ms: nowMs(),
    });
  }

  snapshots.push({
    hook_id: 'objects_total',
    module: 'perception_space',
    metric: 'total_objects',
    value: total,
    threshold: 0,
    status: 'ok',
    message: `当前场景共有 ${total} 个物件`,
    timestamp_ms: nowMs(),
  });

  return snapshots;
}

/** Hook 3: 食品变质警报 */
function hookFoodDecay(): HookSnapshot[] {
  const objects = getSceneObjects();
  const snapshots: HookSnapshot[] = [];

  for (const obj of objects) {
    const freshness = getFoodFreshness(obj.object_id);
    if (!freshness) continue;

    if (freshness.level === 'spoiled') {
      snapshots.push({
        hook_id: 'food_spoiled',
        module: 'simple_physics',
        metric: 'freshness',
        value: freshness.freshness,
        threshold: 20,
        status: 'critical',
        message: `${obj.display_name} 已变质! 新鲜度 ${freshness.freshness}%`,
        timestamp_ms: nowMs(),
      });
    } else if (freshness.level === 'slightly_spoiled') {
      snapshots.push({
        hook_id: 'food_warning',
        module: 'simple_physics',
        metric: 'freshness',
        value: freshness.freshness,
        threshold: 60,
        status: 'warning',
        message: `${obj.display_name} 开始变质 (新鲜度 ${freshness.freshness}%)`,
        timestamp_ms: nowMs(),
      });
    }
  }

  return snapshots;
}

/** Hook 4: 化学状态检查 */
function hookChemistry(): HookSnapshot[] {
  const snapshots: HookSnapshot[] = [];

  // 冷却状态
  const coolingItems = getAllCoolingStates();
  for (const item of coolingItems) {
    snapshots.push({
      hook_id: 'chemistry_cooling',
      module: 'simple_physics',
      metric: 'temperature',
      value: item.temp,
      threshold: item.env,
      status: 'ok',
      message: `${item.id}: ${item.temp}°C (冷却中)`,
      timestamp_ms: nowMs(),
    });
  }

  // 燃烧状态
  const objects = getSceneObjects();
  for (const obj of objects) {
    const burn = getBurnState(obj.object_id);
    if (burn && burn.lit) {
      snapshots.push({
        hook_id: 'chemistry_burning',
        module: 'simple_physics',
        metric: 'fuel_remaining',
        value: burn.fuel_remaining,
        threshold: 10,
        status: burn.fuel_remaining < 10 ? 'warning' : 'ok',
        message: `${obj.display_name}: 燃烧中 (剩余 ${burn.fuel_remaining.toFixed(1)}%)`,
        timestamp_ms: nowMs(),
      });
    }
  }

  return snapshots;
}

/** Hook 5: 物理状态检查 */
function hookPhysics(): HookSnapshot[] {
  const snapshots: HookSnapshot[] = [];

  const fallingItems = getFallingObjects();
  for (const item of fallingItems) {
    if (!item.landed) {
      snapshots.push({
        hook_id: 'physics_falling',
        module: 'simple_physics',
        metric: 'height',
        value: item.current_z,
        threshold: 0.5,
        status: item.current_z > 1 ? 'warning' : 'ok',
        message: `${item.name}: 掉落中 (高度 ${item.current_z.toFixed(1)}m)`,
        timestamp_ms: nowMs(),
      });
    }
  }

  const slideItems = getSlidingObjects();
  for (const item of slideItems) {
    snapshots.push({
      hook_id: 'physics_sliding',
      module: 'simple_physics',
      metric: 'speed',
      value: item.speed,
      threshold: 1,
      status: item.speed > 2 ? 'warning' : 'ok',
      message: `${item.name}: 滑落中 (速度 ${item.speed.toFixed(1)} m/s)`,
      timestamp_ms: nowMs(),
    });
  }

  // 手持物品
  const held = getHeldObject();
  if (held) {
    const obj = getObjectById(held);
    if (obj) {
      snapshots.push({
        hook_id: 'player_holding',
        module: 'simple_physics',
        metric: '1',
        value: 1,
        threshold: 0,
        status: 'ok',
        message: `手持: ${obj.display_name}`,
        timestamp_ms: nowMs(),
      });
    }
  }

  return snapshots;
}

/** Hook 6: 环境舒适度 */
function hookEnvironment(weather: string, temperature: number): HookSnapshot[] {
  const snapshots: HookSnapshot[] = [];

  // 温度
  if (temperature > 35) {
    snapshots.push({
      hook_id: 'env_heat',
      module: 'natural_env',
      metric: 'temperature',
      value: temperature,
      threshold: 35,
      status: 'critical',
      message: `高温警报: ${temperature}°C`,
      timestamp_ms: nowMs(),
    });
  } else if (temperature < 5) {
    snapshots.push({
      hook_id: 'env_cold',
      module: 'natural_env',
      metric: 'temperature',
      value: temperature,
      threshold: 5,
      status: 'critical',
      message: `低温警报: ${temperature}°C`,
      timestamp_ms: nowMs(),
    });
  }

  // 极端天气
  if (weather.includes('暴') || weather.includes('雷')) {
    snapshots.push({
      hook_id: 'env_severe',
      module: 'natural_env',
      metric: '1',
      value: 1,
      threshold: 0,
      status: 'warning',
      message: `恶劣天气: ${weather}`,
      timestamp_ms: nowMs(),
    });
  }

  return snapshots;
}

// ============================================================
// 全量采样 + 存储
// ============================================================
export function runAllHooks(weather: string, temperature: number): HookSnapshot[] {
  const allSnapshots: HookSnapshot[] = [];

  // 场景 & 物件
  allSnapshots.push(hookSceneTransition());
  allSnapshots.push(...hookObjectsHealth());

  // 物理 & 化学
  allSnapshots.push(...hookFoodDecay());
  allSnapshots.push(...hookChemistry());
  allSnapshots.push(...hookPhysics());

  // 环境
  allSnapshots.push(...hookEnvironment(weather, temperature));

  // 存入数据库（使用实际 DB 列：module, event, severity, detail_json, timestamp_ms）
  const db = getDb();
  const severityMap: Record<string, string> = {
    ok: 'info',
    warning: 'warning',
    critical: 'error',
  };
  const insert = db.prepare(`
    INSERT INTO hook_log (timestamp_ms, module, event, severity, detail_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const snap of allSnapshots) {
      insert.run(
        snap.timestamp_ms,
        snap.module,
        snap.hook_id,
        severityMap[snap.status] || 'info',
        JSON.stringify({
          metric: snap.metric,
          value: snap.value,
          threshold: snap.threshold,
          message: snap.message,
        })
      );
    }
  });
  tx();

  return allSnapshots;
}

/** 获取最近的Hook日志 */
export function getRecentHookLogs(limit: number = 20): HookSnapshot[] {
  const rows = getDb().prepare(
    'SELECT * FROM hook_log ORDER BY timestamp_ms DESC LIMIT ?'
  ).all(limit) as any[];

  return rows.map(r => {
    let detail: any = {};
    try { detail = JSON.parse(r.detail_json || '{}'); } catch (_) {}
    return {
      hook_id: r.event,
      module: r.module,
      metric: detail.metric || '',
      value: detail.value ?? 0,
      threshold: detail.threshold ?? 0,
      status: r.severity === 'error' ? 'critical' : (r.severity === 'warning' ? 'warning' : 'ok'),
      message: detail.message || '',
      timestamp_ms: r.timestamp_ms,
    };
  });
}

/** 获取Hook统计摘要 */
export function getHookStats(sinceMs: number): {
  total: number;
  ok: number;
  warning: number;
  critical: number;
} {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok_count,
      SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warn_count,
      SUM(CASE WHEN status = 'critical' THEN 1 ELSE 0 END) as crit_count
    FROM hook_log WHERE timestamp_ms > ?
  `).get(sinceMs) as any;

  return {
    total: stats.total || 0,
    ok: stats.ok_count || 0,
    warning: stats.warn_count || 0,
    critical: stats.crit_count || 0,
  };
}
