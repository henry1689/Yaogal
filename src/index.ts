/**
 * 瑶光 Yaogal 主入口
 * 初始化所有模块，启动世界运转
 * 12:00-次日09:00 无人值守自治运行
 */
import { log, nowMs, clamp } from './common/utils';
import { startTimeService, getWorldTime } from './natural_env/time_calendar/time_service';
import { startWeatherService, getCurrentWeather } from './natural_env/weather_sensor/weather_service';
import { startPhysioService } from './creature_law/human_physio/physio_service';
import { startMonitorService } from './runtime_monitor/daily_inspect/monitor_service';
import { startPerceptionService } from './perception_seven/perception_service';
import { startWebSocketServer } from './external_api/world_event_api';
import { startHttpServer } from './external_api/action_handle';
import { initObjectService } from './perception_space/spatial_object/object_service';
import { initDatabase } from './common/database';
import { physicsTick } from './simple_physics/basic_gravity/gravity_service';
import { chemistryTick } from './simple_physics/simple_chem/chem_service';
import { runAllHooks } from './runtime_monitor/world_hooks/hook_service';
import { initSelfEntity, selfEntityTick, getSelfState } from './self_entity/self_entity_service';
import { initActionSystem, tickActionSystem, getActiveActions, getConsequenceQueueStats } from './creature_law/action_system/action_system';
import { initGapEngine, tickGapEngine } from './creature_law/gap_engine/gap_engine';
import { initEconomicSense, economicTick } from './perception_seven/economic_perception/economic_sense';
import { initSocialSense, socialTick } from './perception_seven/social_perception/social_sense';
import { initDietSense, dietTick } from './perception_seven/diet_perception/diet_sense';
import { initRituals, ritualTick } from './p2_experience/rituals_habits/rituals_habits';
import { initInformationSense, infoTick } from './p2_experience/information_sense/information_sense';
import { initDreamSense, dreamTick, dreamEmotionTick } from './p2_experience/dream_sense/dream_sense';
import { initNarrativeEngine, narrativeTick } from './p3_narrative_world/narrative_engine/narrative_engine';
import { initTriBodyLinkage, triBodyTick } from './p3_narrative_world/tri_body_linkage/tri_body_linkage';
import { initWorldPassiveResponse, worldResponseTick } from './p3_narrative_world/world_passive_response/world_passive_response';
import {
  initSexualOrganPhysiology,
  sexualOrganTick,
  getSexualOrganSnapshot,
} from './intimacy_extension/sexual_organ_physiology';

// 主循环配置
const TICK_INTERVAL_MS = 1000;  // 每秒一个tick
const HOOK_INTERVAL_MS = 5000;  // 每5秒一次全量Hook采样
const SNAPSHOT_INTERVAL_MS = 10000; // 每10秒一次感知快照

let lastTickMs = 0;
let lastHookMs = 0;
let tickCount = 0;
let running = true;

async function main() {
  log('BOOT', '========================================');
  log('BOOT', '  瑶光 Yaogal — 个人专属世界模型 v0.2.0');
  log('BOOT', '  启动时间: ' + new Date().toISOString());
  log('BOOT', '========================================');

  // === 初始化阶段 ===
  log('BOOT', '初始化数据库...');
  await initDatabase();

  log('BOOT', '初始化物件服务...');
  initObjectService();

  log('BOOT', '初始化自我实体...');
  initSelfEntity();

  log('BOOT', '初始化行为系统...');
  initActionSystem();

  log('BOOT', '初始化预期落差引擎...');
  initGapEngine();

  log('BOOT', '初始化 P1 感知（经济/社交/饮食）...');
  initEconomicSense();
  initSocialSense();
  initDietSense();

  log('BOOT', '初始化 P2 体验（仪式/信息/梦境）...');
  initRituals();
  initInformationSense();
  initDreamSense();

  log('BOOT', '初始化 P3 叙事世界（叙事/三体联动/世界回应）...');
  initNarrativeEngine();
  initTriBodyLinkage();
  initWorldPassiveResponse();

  log('BOOT', '初始化性器官生理模型...');
  initSexualOrganPhysiology();

  // === 启动阶段 ===
  log('BOOT', '启动时间服务...');
  startTimeService();

  log('BOOT', '启动天气服务...');
  startWeatherService();

  log('BOOT', '启动生理服务...');
  startPhysioService();

  log('BOOT', '启动七维感知服务...');
  startPerceptionService();

  log('BOOT', '启动监控服务...');
  startMonitorService();

  log('BOOT', '启动 WebSocket 服务器...');
  startWebSocketServer();

  log('BOOT', '启动 HTTP 行为接口...');
  startHttpServer();

  log('BOOT', '瑶光全部模块启动完成');
  log('BOOT', '世界开始运转...');

  // === 主循环 ===
  lastTickMs = nowMs();
  lastHookMs = nowMs();

  worldLoop();
}

/** 主循环：每秒推进世界 */
function worldLoop() {
  if (!running) return;

  const dtMs = nowMs() - lastTickMs;
  const dtSeconds = dtMs / 1000;

  // 1. 物理tick
  try {
    physicsTick(dtSeconds);
    chemistryTick(dtSeconds);
    selfEntityTick(dtSeconds);
    tickActionSystem(dtSeconds);
    tickGapEngine(dtSeconds);

    // P1: 经济/社交/饮食感知
    economicTick();
    socialTick();
    dietTick();

    // P2: 仪式/信息/梦境
    ritualTick();
    infoTick();
    dreamTick();
    dreamEmotionTick();

    // P3: 叙事/三体联动/世界回应
    narrativeTick();
    triBodyTick();
    worldResponseTick();

    // 性器官生理tick
    sexualOrganTick(dtSeconds);
  } catch (err) {
    log('ERROR', `模块tick异常: ${err}`);
  }

  // 2. Hook采样
  if (nowMs() - lastHookMs >= HOOK_INTERVAL_MS) {
    try {
      const weather = getCurrentWeather();
      const snaps = runAllHooks(
        weather?.text ?? '晴',
        parseFloat(weather?.temp ?? '25')
      );
      lastHookMs = nowMs();

      // 告警检测
      const criticals = snaps.filter(s => s.status === 'critical');
      if (criticals.length > 0) {
        log('HOOK', `⚠️ ${criticals.length} 个严重告警`);
      }
    } catch (err) {
      log('ERROR', `Hook采样异常: ${err}`);
    }
  }

  tickCount++;

  // 每秒进度日志（每60秒输出一次）
  if (tickCount % 60 === 0) {
    const wt = getWorldTime();
    log('CLOCK', `[tick ${tickCount}] 世界时间: ${wt?.display_date ?? 'N/A'} ${wt?.display_time ?? 'N/A'}`);
  }

  // 下一帧
  setTimeout(worldLoop, TICK_INTERVAL_MS);
}

/** 优雅退出 */
process.on('SIGINT', () => {
  log('BOOT', '收到SIGINT，瑶光世界停止运转');
  running = false;
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('BOOT', '收到SIGTERM，瑶光世界停止运转');
  running = false;
  process.exit(0);
});

main().catch(err => {
  console.error('启动失败:', err);
  log('FATAL', `启动失败: ${err}`);
  process.exit(1);
});
