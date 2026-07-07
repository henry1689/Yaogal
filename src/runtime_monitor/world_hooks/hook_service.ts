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
import { getSelfState } from '../../self_entity/self_entity_service';

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

/** Hook 7: 自我实体状态检查 */
function hookSelfStatus(): HookSnapshot[] {
  const self = getSelfState();
  const snapshots: HookSnapshot[] = [];

  // 整体状态摘要
  snapshots.push({
    hook_id: 'self_summary',
    module: 'self_entity',
    metric: 'energy',
    value: self.energy,
    threshold: 20,
    status: self.energy < 20 ? 'warning' : 'ok',
    message: `精力${self.energy.toFixed(0)} 疲劳${self.fatigue.toFixed(0)} 饥饿${self.hunger.toFixed(0)} 情绪${self.mood_baseline.toFixed(0)}`,
    timestamp_ms: nowMs(),
  });

  // 疲劳告警
  if (self.fatigue > 70) {
    snapshots.push({
      hook_id: 'self_fatigue',
      module: 'self_entity',
      metric: 'fatigue',
      value: self.fatigue,
      threshold: 70,
      status: 'warning',
      message: `重度疲劳: ${self.fatigue.toFixed(0)}，建议休息`,
      timestamp_ms: nowMs(),
    });
  }

  // 饥饿告警
  if (self.hunger > 60) {
    snapshots.push({
      hook_id: 'self_hunger',
      module: 'self_entity',
      metric: 'hunger',
      value: self.hunger,
      threshold: 60,
      status: self.hunger > 80 ? 'critical' : 'warning',
      message: `饥饿度 ${self.hunger.toFixed(0)}，需要进食`,
      timestamp_ms: nowMs(),
    });
  }

  // 肢体疲劳
  const lf = self.limb_fatigue;
  const lfParts = Object.entries(lf) as [string, number][];
  for (const [part, value] of lfParts) {
    if (value > 60) {
      snapshots.push({
        hook_id: `self_limb_${part}`,
        module: 'self_entity',
        metric: `limb_fatigue_${part}`,
        value,
        threshold: 60,
        status: 'warning',
        message: `${part} 疲劳度 ${value.toFixed(0)}%`,
        timestamp_ms: nowMs(),
      });
    }
  }

  return snapshots;
}

/** Hook 8: P1 经济感知探针 */
function hookEconomic(): HookSnapshot[] {
  const { getEconomicSnapshot } = require('../../perception_seven/economic_perception/economic_sense');
  const snap: any = getEconomicSnapshot();
  const snapshots: HookSnapshot[] = [];

  if (snap.financial_security < 30) {
    snapshots.push({
      hook_id: 'eco_insecure',
      module: 'p1_economic',
      metric: 'financial_security',
      value: snap.financial_security,
      threshold: 30,
      status: 'critical',
      message: `财务安全感极低: ${snap.financial_security}`,
      timestamp_ms: nowMs(),
    });
  }

  if (snap.desire_tension > 70) {
    snapshots.push({
      hook_id: 'eco_desire_high',
      module: 'p1_economic',
      metric: 'desire_tension',
      value: snap.desire_tension,
      threshold: 70,
      status: 'warning',
      message: `物欲张力偏高: ${snap.desire_tension}`,
      timestamp_ms: nowMs(),
    });
  }

  snapshots.push({
    hook_id: 'eco_summary',
    module: 'p1_economic',
    metric: 'net_worth',
    value: snap.net_worth,
    threshold: 10000,
    status: 'ok',
    message: `资产${snap.net_worth} 今日消费${snap.daily_spend}`,
    timestamp_ms: nowMs(),
  });

  return snapshots;
}

/** Hook 9: P1 社交感知探针 */
function hookSocial(): HookSnapshot[] {
  const { getSocialSnapshot } = require('../../perception_seven/social_perception/social_sense');
  const snap: any = getSocialSnapshot();
  const snapshots: HookSnapshot[] = [];

  snapshots.push({
    hook_id: 'social_network',
    module: 'p1_social',
    metric: 'temperature',
    value: snap.average_temperature,
    threshold: 30,
    status: snap.average_temperature < 30 ? 'warning' : 'ok',
    message: `社交网络均温${snap.average_temperature?.toFixed(0)} 能量${snap.average_energy?.toFixed(0)}`,
    timestamp_ms: nowMs(),
  });

  for (const node of snap.lonely_nodes || []) {
    snapshots.push({
      hook_id: `social_lonely_${node.node_id}`,
      module: 'p1_social',
      metric: 'loneliness',
      value: node.days_since_contact,
      threshold: 7,
      status: node.days_since_contact > 14 ? 'critical' : 'warning',
      message: `${node.name}: ${node.days_since_contact}天未联系`,
      timestamp_ms: nowMs(),
    });
  }

  return snapshots;
}

/** Hook 10: P1 饮食感知探针 */
function hookDiet(): HookSnapshot[] {
  const { getDietSnapshot } = require('../../perception_seven/diet_perception/diet_sense');
  const snap: any = getDietSnapshot();
  const snapshots: HookSnapshot[] = [];

  if (snap.hunger > 80) {
    snapshots.push({
      hook_id: 'diet_hunger',
      module: 'p1_diet',
      metric: 'hunger',
      value: snap.hunger,
      threshold: 80,
      status: 'critical',
      message: `极度饥饿: ${snap.hunger.toFixed(0)}`,
      timestamp_ms: nowMs(),
    });
  } else if (snap.hunger > 50) {
    snapshots.push({
      hook_id: 'diet_hungry',
      module: 'p1_diet',
      metric: 'hunger',
      value: snap.hunger,
      threshold: 50,
      status: 'warning',
      message: `感到饥饿: ${snap.hunger.toFixed(0)}`,
      timestamp_ms: nowMs(),
    });
  }

  return snapshots;
}

/** Hook 11: P2 仪式习惯探针 */
function hookRituals(): HookSnapshot[] {
  const { getRitualSnapshot } = require('../../p2_experience/rituals_habits/rituals_habits');
  const snap: any = getRitualSnapshot();
  const snapshots: HookSnapshot[] = [];

  snapshots.push({
    hook_id: 'ritual_summary',
    module: 'p2_rituals',
    metric: 'daily_rituals_done',
    value: snap.daily_count ?? 0,
    threshold: 3,
    status: (snap.daily_count ?? 0) >= 3 ? 'ok' : 'warning',
    message: `今日完成${snap.daily_count}项仪式 习惯连续${snap.active_habits}条`,
    timestamp_ms: nowMs(),
  });

  for (const h of snap.broken_habits || []) {
    snapshots.push({
      hook_id: `habit_broken_${h.habit_id}`,
      module: 'p2_rituals',
      metric: 'habit_streak',
      value: h.streak,
      threshold: 1,
      status: 'warning',
      message: `${h.name}: 习惯中断 (之前连续${h.streak}天)`,
      timestamp_ms: nowMs(),
    });
  }

  return snapshots;
}

/** Hook 12: P2 信息过载探针 */
function hookInformation(): HookSnapshot[] {
  const { getInfoSnapshot } = require('../../p2_experience/information_sense/information_sense');
  const snap: any = getInfoSnapshot();
  const snapshots: HookSnapshot[] = [];

  if (snap.anxiety > 70) {
    snapshots.push({
      hook_id: 'info_anxiety',
      module: 'p2_information',
      metric: 'anxiety',
      value: snap.anxiety,
      threshold: 70,
      status: 'critical',
      message: `信息焦虑: ${snap.anxiety.toFixed(0)}`,
      timestamp_ms: nowMs(),
    });
  }

  snapshots.push({
    hook_id: 'info_summary',
    module: 'p2_information',
    metric: 'attention',
    value: snap.attention ?? 50,
    threshold: 30,
    status: (snap.attention ?? 50) < 30 ? 'warning' : 'ok',
    message: `注意力${(snap.attention ?? 50).toFixed(0)} 队列${snap.queue_length ?? 0}`,
    timestamp_ms: nowMs(),
  });

  return snapshots;
}

/** Hook 13: P2 梦境质量探针 */
function hookDream(): HookSnapshot[] {
  const { getDreamSnapshot } = require('../../p2_experience/dream_sense/dream_sense');
  const snap: any = getDreamSnapshot();
  const snapshots: HookSnapshot[] = [];

  if (snap.nightmare_intensity > 50) {
    snapshots.push({
      hook_id: 'dream_nightmare',
      module: 'p2_dream',
      metric: 'nightmare_intensity',
      value: snap.nightmare_intensity,
      threshold: 50,
      status: 'warning',
      message: `噩梦强度: ${snap.nightmare_intensity.toFixed(0)}`,
      timestamp_ms: nowMs(),
    });
  }

  snapshots.push({
    hook_id: 'dream_state',
    module: 'p2_dream',
    metric: 'sleep_stage',
    value: (snap.deep_sleep + snap.rem_sleep) / 2,
    threshold: 30,
    status: snap.sleep_stage === 'awake' ? 'ok' : 'ok',
    message: `睡眠阶段: ${snap.sleep_stage ?? '清醒'} 梦数${snap.tonight_count ?? 0}`,
    timestamp_ms: nowMs(),
  });

  return snapshots;
}

/** Hook 14: P3 叙事引擎探针 */
function hookNarrative(): HookSnapshot[] {
  const { getNarrativeSnapshot } = require('../../p3_narrative_world/narrative_engine/narrative_engine');
  const snap: any = getNarrativeSnapshot();
  const snapshots: HookSnapshot[] = [];

  snapshots.push({
    hook_id: 'narrative_summary',
    module: 'p3_narrative',
    metric: 'event_count',
    value: snap.event_count ?? 0,
    threshold: 5,
    status: 'ok',
    message: `今日${snap.event_count ?? 0}事件 主题: ${snap.theme ?? '日常'}`,
    timestamp_ms: nowMs(),
  });

  return snapshots;
}

/** Hook 15: P3 三体联动探针 */
function hookTriBodyLinkage(): HookSnapshot[] {
  const { getTriBodySnapshot } = require('../../p3_narrative_world/tri_body_linkage/tri_body_linkage');
  const snap: any = getTriBodySnapshot();
  const snapshots: HookSnapshot[] = [];

  if (snap.imbalance > 60) {
    snapshots.push({
      hook_id: 'tri_imbalance',
      module: 'p3_tri_body',
      metric: 'imbalance',
      value: snap.imbalance,
      threshold: 60,
      status: 'warning',
      message: `三体失衡: ${snap.imbalance.toFixed(0)}`,
      timestamp_ms: nowMs(),
    });
  }

  snapshots.push({
    hook_id: 'tri_emotion_gap',
    module: 'p3_tri_body',
    metric: 'emotion_gap',
    value: snap.emotion_gap ?? 0,
    threshold: 20,
    status: (snap.emotion_gap ?? 0) > 20 ? 'warning' : 'ok',
    message: `情绪偏差${(snap.emotion_gap ?? 0).toFixed(0)} 世界修正${(snap.world_fix ?? 0).toFixed(0)}`,
    timestamp_ms: nowMs(),
  });

  return snapshots;
}

/** Hook 16: P3 世界被动回应探针 */
function hookWorldResponse(): HookSnapshot[] {
  const { getWorldResponseSnapshot } = require('../../p3_narrative_world/world_passive_response/world_passive_response');
  const snap: any = getWorldResponseSnapshot();
  const snapshots: HookSnapshot[] = [];

  snapshots.push({
    hook_id: 'world_env',
    module: 'p3_world',
    metric: 'tidiness',
    value: snap.tidiness ?? 75,
    threshold: 50,
    status: (snap.tidiness ?? 75) < 50 ? 'warning' : 'ok',
    message: `环境: 整洁${(snap.tidiness ?? 75).toFixed(0)} 灰尘${(snap.dust ?? 15).toFixed(0)}`,
    timestamp_ms: nowMs(),
  });

  if (snap.active_responses?.length > 0) {
    for (const r of snap.active_responses) {
      snapshots.push({
        hook_id: `world_resp_${r.type}`,
        module: 'p3_world',
        metric: r.type,
        value: r.intensity,
        threshold: 5,
        status: r.intensity > 7 ? 'warning' : 'ok',
        message: r.description,
        timestamp_ms: nowMs(),
      });
    }
  }

  return snapshots;
}

/** Hook 17: C3 日常相伴探针 */
function hookDailyTogether(): HookSnapshot[] {
  const { getTogetherSnapshot } = require('../../c3_daily_together/daily_together');
  const snap: any = getTogetherSnapshot();
  const snapshots: HookSnapshot[] = [];
  snapshots.push({
    hook_id: 'daily_summary',
    module: 'c3_daily_together',
    metric: 'quality',
    value: snap.together_quality ?? 50,
    threshold: 40,
    status: (snap.together_quality ?? 50) < 40 ? 'warning' : 'ok',
    message: `日常质量${(snap.together_quality ?? 50).toFixed(0)} 默契${(snap.unspoken_understanding ?? 50).toFixed(0)}`,
    timestamp_ms: nowMs(),
  });
  if (snap.argue_tension > 50) {
    snapshots.push({
      hook_id: 'daily_argue',
      module: 'c3_daily_together',
      metric: 'argue_tension',
      value: snap.argue_tension,
      threshold: 50,
      status: 'warning',
      message: `争吵张力: ${snap.argue_tension.toFixed(0)}`,
      timestamp_ms: nowMs(),
    });
  }
  return snapshots;
}

/** Hook 18: C4 生育与抚养探针 */
function hookChildbirth(): HookSnapshot[] {
  const { getParentingSnapshot } = require('../../c4_childbirth_parenting/parenting');
  const snap: any = getParentingSnapshot();
  const snapshots: HookSnapshot[] = [];
  if (snap.pregnancy_stage === 'active') {
    snapshots.push({
      hook_id: 'birth_pregnancy',
      module: 'c4_childbirth',
      metric: 'trimester',
      value: snap.day_of_pregnancy ?? 0,
      threshold: 270,
      status: 'ok',
      message: `孕期第${snap.day_of_pregnancy ?? 0}天 预产期${snap.due_date ?? '?'}`,
      timestamp_ms: nowMs(),
    });
  }
  snapshots.push({
    hook_id: 'birth_children',
    module: 'c4_childbirth',
    metric: 'child_count',
    value: snap.children?.length ?? 0,
    threshold: 0,
    status: 'ok',
    message: `子女: ${snap.children?.length ?? 0}人`,
    timestamp_ms: nowMs(),
  });
  return snapshots;
}

/** Hook 19: C5 家庭探针 */
function hookFamily(): HookSnapshot[] {
  const { getFamilySnapshot } = require('../../c5_family/family');
  const snap: any = getFamilySnapshot();
  const snapshots: HookSnapshot[] = [];
  if (parseFloat(snap.domestic_violence_risk) > 30) {
    snapshots.push({
      hook_id: 'family_dv_risk',
      module: 'c5_family',
      metric: 'domestic_violence_risk',
      value: parseFloat(snap.domestic_violence_risk),
      threshold: 30,
      status: parseFloat(snap.domestic_violence_risk) > 50 ? 'critical' : 'warning',
      message: `家暴风险: ${snap.domestic_violence_risk}`,
      timestamp_ms: nowMs(),
    });
  }
  snapshots.push({
    hook_id: 'family_summary',
    module: 'c5_family',
    metric: 'health',
    value: parseFloat(snap.family_health ?? '75'),
    threshold: 50,
    status: (parseFloat(snap.family_health ?? '75') < 50) ? 'warning' : 'ok',
    message: `家庭健康${snap.family_health} 压力${snap.family_stress}`,
    timestamp_ms: nowMs(),
  });
  return snapshots;
}

/** Hook 20: C6 个人伸展探针 */
function hookPersonalExtension(): HookSnapshot[] {
  const { getExtensionSnapshot } = require('../../c6_personal_extension/personal_extension');
  const snap: any = getExtensionSnapshot();
  const snapshots: HookSnapshot[] = [];
  if (parseFloat(snap.work?.burnout ?? '0') > 60) {
    snapshots.push({
      hook_id: 'ext_burnout',
      module: 'c6_extension',
      metric: 'burnout',
      value: parseFloat(snap.work.burnout),
      threshold: 60,
      status: 'critical',
      message: `工作倦怠: ${snap.work.burnout}`,
      timestamp_ms: nowMs(),
    });
  }
  snapshots.push({
    hook_id: 'ext_learning',
    module: 'c6_extension',
    metric: 'curiosity',
    value: parseFloat(snap.learning?.curiosity ?? '50'),
    threshold: 30,
    status: 'ok',
    message: `专注:${snap.learning?.current_focus ?? '-'} 进度${snap.work?.progress ?? 0}%`,
    timestamp_ms: nowMs(),
  });
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

  // 自我实体
  allSnapshots.push(...hookSelfStatus());

  // P1: 经济/社交/饮食
  allSnapshots.push(...hookEconomic());
  allSnapshots.push(...hookSocial());
  allSnapshots.push(...hookDiet());

  // P2: 仪式/信息/梦境
  allSnapshots.push(...hookRituals());
  allSnapshots.push(...hookInformation());
  allSnapshots.push(...hookDream());

  // P3: 叙事/三体联动/世界回应
  allSnapshots.push(...hookNarrative());
  allSnapshots.push(...hookTriBodyLinkage());
  allSnapshots.push(...hookWorldResponse());

  // C3-C6: 六圈
  allSnapshots.push(...hookDailyTogether());
  allSnapshots.push(...hookChildbirth());
  allSnapshots.push(...hookFamily());
  allSnapshots.push(...hookPersonalExtension());

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
