/**
 * 七维感知层 — 统一感知快照接口
 * 每10秒生成一次完整感知快照，存入数据库并通过事件总线广播
 */
import { getDb } from '../common/database';
import { log, nowMs } from '../common/utils';
import { worldBus, WorldEvents } from '../core_bus/event_bus';
import { getPhysicalPerception } from './physical_perception/physical_sense';
import { getSpatialPerception } from './spatial_perception/spatial_sense';
import { getTemporalPerception } from './temporal_perception/temporal_sense';
import { getWorkPerception } from './work_perception/work_sense';
import { getLifePerception } from './life_perception/life_sense';
import { getWorldPerception } from './world_perception/world_sense';
import { getIntimacyPerception } from './intimacy_perception/intimacy_engine';

let perceptionTimer: NodeJS.Timeout | null = null;

export function startPerceptionService(): void {
  log('PERCEPTION', '七维感知服务启动...');
  
  // 每10秒生成感知快照
  perceptionTimer = setInterval(() => {
    try {
      const snapshot = generateSnapshot();
      saveSnapshot(snapshot);
      worldBus.emit(WorldEvents.PERCEPTION_SNAPSHOT, snapshot);
    } catch (err: any) {
      log('PERCEPTION', `快照生成异常: ${err.message}`);
    }
  }, 10000);

  // 立即生成首次快照
  const firstSnapshot = generateSnapshot();
  saveSnapshot(firstSnapshot);
}

function generateSnapshot(): any {
  return {
    timestamp_ms: nowMs(),
    physical: getPhysicalPerception(),
    spatial: getSpatialPerception(),
    temporal: getTemporalPerception(),
    work: getWorkPerception(),
    life: getLifePerception(),
    world: getWorldPerception(),
    intimacy: getIntimacyPerception(),
  };
}

function saveSnapshot(snapshot: any): void {
  getDb().prepare(`
    INSERT INTO perception_snapshots (timestamp_ms, physical_perception_json, spatial_perception_json, temporal_perception_json, work_perception_json, life_perception_json, world_perception_json, intimacy_perception_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.timestamp_ms,
    JSON.stringify(snapshot.physical),
    JSON.stringify(snapshot.spatial),
    JSON.stringify(snapshot.temporal),
    JSON.stringify(snapshot.work),
    JSON.stringify(snapshot.life),
    JSON.stringify(snapshot.world),
    JSON.stringify(snapshot.intimacy || {}),
  );
}

export function stopPerceptionService(): void {
  if (perceptionTimer) {
    clearInterval(perceptionTimer);
    perceptionTimer = null;
  }
}
