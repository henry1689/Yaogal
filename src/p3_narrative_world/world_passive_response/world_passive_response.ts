/**
 * 世界被动回应 (World Passive Response)
 * P3-3: 环境用物理/化学变化"回应"用户行为
 * 不用数据推送，而是世界自己变化
 */
import { getDb } from '../../common/database';
import { log, clamp } from '../../common/utils';

interface ResponseRule {
  id: string;
  trigger_behavior: string;     // 触发的行为模式
  trigger_threshold: number;    // 触发阈值(天数/次数)
  affected_env: string;         // 受影响的环境变量
  change_rate: number;           // 变化率
  min_value: number;
  max_value: number;
  description: string;
}

interface EnvironmentState {
  air_quality: number;         // 0-100 (100最好)
  natural_light: number;       // 0-100 自然光照度
  room_tidiness: number;       // 0-100 整洁度
  indoor_humidity: number;     // 0-100 室内湿度
  dust_level: number;          // 0-100 灰尘累积
  clutter_level: number;       // 0-100 杂乱度
  plant_health: number;        // 0-100 植物健康
}

let responseRules: ResponseRule[] = [];
let envState: EnvironmentState = {
  air_quality: 85,
  natural_light: 80,
  room_tidiness: 75,
  indoor_humidity: 55,
  dust_level: 15,
  clutter_level: 20,
  plant_health: 90,
};

// 行为状态追踪
let consecutiveIndoorDays = 0;
let lastOutdoorTime = Date.now();
let lastCleanTime = Date.now();
let lastOpenWindowTime = Date.now();
let lastWaterPlantsTime = Date.now();

export function initWorldPassiveResponse(): void {
  responseRules = [
    // 不出门套餐
    {
      id: 'indoor_air_degrade', trigger_behavior: 'stay_indoor', trigger_threshold: 1,
      affected_env: 'air_quality', change_rate: -0.005, min_value: 50, max_value: 100,
      description: '连续待在室内，空气质量缓慢下降',
    },
    {
      id: 'indoor_light_degrade', trigger_behavior: 'stay_indoor', trigger_threshold: 2,
      affected_env: 'natural_light', change_rate: -0.008, min_value: 30, max_value: 100,
      description: '窗帘一直拉着，自然光线减弱',
    },
    {
      id: 'clutter_accumulate', trigger_behavior: 'stay_indoor', trigger_threshold: 2,
      affected_env: 'clutter_level', change_rate: 0.006, min_value: 0, max_value: 85,
      description: '外卖盒和杂物堆积',
    },
    // 不打扫
    {
      id: 'dust_buildup', trigger_behavior: 'no_clean', trigger_threshold: 0.5,
      affected_env: 'dust_level', change_rate: 0.003, min_value: 0, max_value: 90,
      description: '灰尘累积',
    },
    {
      id: 'tidiness_decay', trigger_behavior: 'no_clean', trigger_threshold: 0.5,
      affected_env: 'room_tidiness', change_rate: -0.004, min_value: 20, max_value: 100,
      description: '房间逐渐变得不整洁',
    },
    // 不开窗
    {
      id: 'indoor_humidity_rise', trigger_behavior: 'no_open_window', trigger_threshold: 0.5,
      affected_env: 'indoor_humidity', change_rate: 0.004, min_value: 30, max_value: 80,
      description: '室内湿气累积',
    },
    // 不浇水
    {
      id: 'plant_wither', trigger_behavior: 'no_water_plants', trigger_threshold: 1,
      affected_env: 'plant_health', change_rate: -0.01, min_value: 10, max_value: 100,
      description: '植物缺水枯萎',
    },
    // 正向回应
    {
      id: 'clean_recovery', trigger_behavior: 'cleaned', trigger_threshold: 0,
      affected_env: 'room_tidiness', change_rate: 0.3, min_value: 0, max_value: 100,
      description: '打扫后房间恢复整洁',
    },
    {
      id: 'dust_cleared', trigger_behavior: 'cleaned', trigger_threshold: 0,
      affected_env: 'dust_level', change_rate: -0.4, min_value: 0, max_value: 100,
      description: '打扫后灰尘清除',
    },
    {
      id: 'window_air_refresh', trigger_behavior: 'opened_window', trigger_threshold: 0,
      affected_env: 'air_quality', change_rate: 0.2, min_value: 0, max_value: 100,
      description: '开窗通风空气质量恢复',
    },
    {
      id: 'plant_recovery', trigger_behavior: 'watered_plants', trigger_threshold: 0,
      affected_env: 'plant_health', change_rate: 0.3, min_value: 0, max_value: 100,
      description: '浇水后植物恢复生机',
    },
    {
      id: 'go_out_reset', trigger_behavior: 'went_outdoor', trigger_threshold: 0,
      affected_env: 'natural_light', change_rate: 0.15, min_value: 0, max_value: 100,
      description: '出门后阳光感恢复',
    },
  ];
  
  log('WORLD_RESPONSE', `世界被动回应初始化: ${responseRules.length}条规则`);
}

export function worldResponseTick(): void {
  const now = Date.now();
  
  // 更新行为状态追踪
  const daysSinceOutdoor = (now - lastOutdoorTime) / 86400000;
  consecutiveIndoorDays = Math.floor(daysSinceOutdoor);
  
  // 逐条评估规则
  for (const rule of responseRules) {
    if (!isRuleActive(rule)) continue;
    
    const oldValue = (envState as any)[rule.affected_env];
    const newValue = clamp(oldValue + rule.change_rate, rule.min_value, rule.max_value);
    (envState as any)[rule.affected_env] = newValue;
    
    // 显著变化时记录
    if (Math.abs(newValue - oldValue) > 0.1) {
      log('WORLD_RESPONSE', `${rule.description}: ${rule.affected_env} ${oldValue.toFixed(1)}→${newValue.toFixed(1)}`);
    }
  }
  
  // 每小时持久化
  if (new Date(now).getMinutes() === 0 && new Date(now).getSeconds() < 5) {
    persistEnvState();
  }
}

function isRuleActive(rule: ResponseRule): boolean {
  switch (rule.trigger_behavior) {
    case 'stay_indoor':
      return consecutiveIndoorDays >= rule.trigger_threshold;
    case 'no_clean':
      return (Date.now() - lastCleanTime) / 86400000 > rule.trigger_threshold;
    case 'no_open_window':
      return (Date.now() - lastOpenWindowTime) / 86400000 > rule.trigger_threshold;
    case 'no_water_plants':
      return (Date.now() - lastWaterPlantsTime) / 86400000 > rule.trigger_threshold;
    case 'cleaned':
    case 'opened_window':
    case 'watered_plants':
    case 'went_outdoor':
      return true; // 一次性触发，每次 tick 都会应用（恢复性规则）
    default:
      return false;
  }
}

// 行为触发接口
export function recordBehavior(behavior: string): void {
  const now = Date.now();
  switch (behavior) {
    case 'went_outdoor':
      lastOutdoorTime = now;
      consecutiveIndoorDays = 0;
      // 一次性恢复效果
      envState.natural_light = clamp(envState.natural_light + 15, 0, 100);
      envState.air_quality = clamp(envState.air_quality + 10, 0, 100);
      log('WORLD_RESPONSE', '出门: 光线+15, 空气+10');
      break;
    case 'cleaned':
      lastCleanTime = now;
      envState.room_tidiness = clamp(envState.room_tidiness + 30, 0, 100);
      envState.dust_level = clamp(envState.dust_level - 40, 0, 100);
      envState.clutter_level = clamp(envState.clutter_level - 25, 0, 100);
      log('WORLD_RESPONSE', '打扫: 整洁+30, 灰尘-40, 杂乱-25');
      break;
    case 'opened_window':
      lastOpenWindowTime = now;
      envState.air_quality = clamp(envState.air_quality + 20, 0, 100);
      envState.indoor_humidity = clamp(envState.indoor_humidity - 10, 0, 100);
      log('WORLD_RESPONSE', '开窗: 空气+20, 湿度-10');
      break;
    case 'watered_plants':
      lastWaterPlantsTime = now;
      envState.plant_health = clamp(envState.plant_health + 30, 0, 100);
      log('WORLD_RESPONSE', '浇花: 植物健康+30');
      break;
  }
}

function persistEnvState(): void {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO env_state (air_quality, natural_light, room_tidiness, indoor_humidity, dust_level, clutter_level, plant_health, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    Math.round(envState.air_quality), Math.round(envState.natural_light),
    Math.round(envState.room_tidiness), Math.round(envState.indoor_humidity),
    Math.round(envState.dust_level), Math.round(envState.clutter_level),
    Math.round(envState.plant_health), Date.now()
  );
}

export function getWorldResponseSnapshot(): WorldResponsePerception {
  return {
    timestamp: Date.now(),
    environment_state: {
      air_quality: Math.round(envState.air_quality),
      natural_light: Math.round(envState.natural_light),
      room_tidiness: Math.round(envState.room_tidiness),
      indoor_humidity: Math.round(envState.indoor_humidity),
      dust_level: Math.round(envState.dust_level),
      clutter_level: Math.round(envState.clutter_level),
      plant_health: Math.round(envState.plant_health),
    },
    consecutive_indoor_days: consecutiveIndoorDays,
    days_since_clean: Math.round(((Date.now() - lastCleanTime) / 86400000) * 10) / 10,
    active_responses: responseRules.filter(r => isRuleActive(r)).map(r => r.description),
  };
}

export interface WorldResponsePerception {
  timestamp: number;
  environment_state: EnvironmentState;
  consecutive_indoor_days: number;
  days_since_clean: number;
  active_responses: string[];
}
