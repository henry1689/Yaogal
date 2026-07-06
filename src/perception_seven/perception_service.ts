/**
 * 七维感知层 — 统一感知快照接口（P1/P2/P3 扩展）
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
import { getEconomicSnapshot } from './economic_perception/economic_sense';
import { getSocialSnapshot } from './social_perception/social_sense';
import { getDietSnapshot } from './diet_perception/diet_sense';
import { getRitualSnapshot } from '../p2_experience/rituals_habits/rituals_habits';
import { getInfoSnapshot } from '../p2_experience/information_sense/information_sense';
import { getDreamSnapshot } from '../p2_experience/dream_sense/dream_sense';
import { getNarrativeSnapshot } from '../p3_narrative_world/narrative_engine/narrative_engine';
import { getTriBodySnapshot } from '../p3_narrative_world/tri_body_linkage/tri_body_linkage';
import { getWorldResponseSnapshot } from '../p3_narrative_world/world_passive_response/world_passive_response';

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
    economic: getEconomicSnapshot(),
    social: getSocialSnapshot(),
    diet: getDietSnapshot(),
    rituals_habits: getRitualSnapshot(),
    information: getInfoSnapshot(),
    dream: getDreamSnapshot(),
    narrative: getNarrativeSnapshot(),
    tri_body: getTriBodySnapshot(),
    world_passive: getWorldResponseSnapshot(),
  };
}

function saveSnapshot(snapshot: any): void {
  getDb().prepare(`
    INSERT INTO perception_snapshots (timestamp_ms, physical_perception_json, spatial_perception_json, temporal_perception_json, work_perception_json, life_perception_json, world_perception_json, intimacy_perception_json, economic_json, social_json, diet_json, rituals_json, info_json, dream_json, narrative_json, tri_body_json, world_passive_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.timestamp_ms,
    JSON.stringify(snapshot.physical),
    JSON.stringify(snapshot.spatial),
    JSON.stringify(snapshot.temporal),
    JSON.stringify(snapshot.work),
    JSON.stringify(snapshot.life),
    JSON.stringify(snapshot.world),
    JSON.stringify(snapshot.intimacy || {}),
    JSON.stringify(snapshot.economic || {}),
    JSON.stringify(snapshot.social || {}),
    JSON.stringify(snapshot.diet || {}),
    JSON.stringify(snapshot.rituals_habits || {}),
    JSON.stringify(snapshot.information || {}),
    JSON.stringify(snapshot.dream || {}),
    JSON.stringify(snapshot.narrative || {}),
    JSON.stringify(snapshot.tri_body || {}),
    JSON.stringify(snapshot.world_passive || {}),
  );
}

export function stopPerceptionService(): void {
  if (perceptionTimer) {
    clearInterval(perceptionTimer);
    perceptionTimer = null;
  }
}
