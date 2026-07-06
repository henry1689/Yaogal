/**
 * 极简化学 — 水温冷却/食物变质/茶水稀释/燃烧消耗
 * 纯生活化可见规则，牛顿冷却定律、阿伦尼乌斯基础
 */
import { log, clamp, nowMs, decay } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 水温冷却 — 牛顿冷却定律
// ============================================================
interface WaterCooling {
  current_temp: number;    // 当前温度 °C
  env_temp: number;        // 环境温度 °C
  k: number;               // 冷却常数
  last_update_ms: number;
}

const coolingStates: Map<string, WaterCooling> = new Map();

/** 开始追踪水温冷却 */
export function startCooling(objectId: string, initialTemp: number, envTemp: number, k: number = 0.01): void {
  coolingStates.set(objectId, {
    current_temp: initialTemp,
    env_temp: envTemp,
    k,
    last_update_ms: nowMs(),
  });
  log('CHEM', `${objectId}: 开始自然冷却，初始 ${initialTemp}°C，环境 ${envTemp}°C`);
}

/** 每秒调用：更新所有冷却对象 */
export function tickCooling(dtSeconds: number): void {
  for (const [id, state] of coolingStates) {
    // T(t) = T_env + (T0 - T_env) * e^(-kt)
    const diff = state.current_temp - state.env_temp;
    const newTemp = state.env_temp + diff * Math.exp(-state.k * dtSeconds);
    state.current_temp = newTemp;
    state.last_update_ms = nowMs();

    if (Math.abs(newTemp - state.env_temp) < 0.1) {
      state.current_temp = state.env_temp;
      log('CHEM', `${id}: 冷却至室温 ${state.env_temp.toFixed(1)}°C`);
      coolingStates.delete(id);
      continue;
    }
  }
}

export function getCoolingTemp(objectId: string): number | null {
  return coolingStates.get(objectId)?.current_temp ?? null;
}

export function getAllCoolingStates(): Array<{ id: string; temp: number; env: number }> {
  return Array.from(coolingStates.entries()).map(([id, s]) => ({
    id, temp: Math.round(s.current_temp * 10) / 10, env: s.env_temp,
  }));
}

// ============================================================
// 食物变质 — 三级新鲜度
// ============================================================
export type FreshnessLevel = 'fresh' | 'slightly_spoiled' | 'spoiled';

interface FoodDecay {
  freshness: number;       // 0-100
  env_temp: number;        // 环境温度（高温加速）
  humidity: number;        // 环境湿度（高湿加速）
  decay_rate: number;      // 基础衰减速率
  last_update_ms: number;
}

const foodStates: Map<string, FoodDecay> = new Map();

export function registerFood(objectId: string, initialFreshness: number, envTemp: number, humidity: number): void {
  // 基础衰减率：室温(25°C)下每天衰减约 8%
  const baseRate = 8 / (24 * 3600); // 每秒衰减百分比
  foodStates.set(objectId, {
    freshness: initialFreshness,
    env_temp: envTemp,
    humidity,
    decay_rate: baseRate,
    last_update_ms: nowMs(),
  });
  log('CHEM', `${objectId}: 食物注册，新鲜度 ${initialFreshness}%`);
}

/** 每秒调用 */
export function tickFoodDecay(dtSeconds: number): void {
  for (const [id, state] of foodStates) {
    // 温度加速因子：每高于25°C 10度，速度翻倍
    const tempFactor = Math.pow(2, (state.env_temp - 25) / 10);
    // 湿度加速因子：每高于50% 10个百分点，加10%
    const humidityFactor = 1 + (state.humidity - 50) * 0.01;

    const decay = state.decay_rate * tempFactor * humidityFactor * dtSeconds * 100;
    const prevLevel = getFreshnessLevel(state.freshness);
    state.freshness = clamp(state.freshness - decay, 0, 100);

    const newLevel = getFreshnessLevel(state.freshness);
    if (prevLevel !== newLevel) {
      log('CHEM', `${id}: 新鲜度 ${prevLevel} → ${newLevel} (${state.freshness.toFixed(1)}%)`);
      if (newLevel === 'spoiled') {
        worldBus.emit(WorldEvents.FOOD_SPOILED, {
          object_id: id,
          freshness: state.freshness,
          timestamp_ms: nowMs(),
        });
      }
    }

    if (state.freshness <= 0) {
      foodStates.delete(id);
    }
  }
}

function getFreshnessLevel(freshness: number): FreshnessLevel {
  if (freshness > 60) return 'fresh';
  if (freshness > 20) return 'slightly_spoiled';
  return 'spoiled';
}

export function getFoodFreshness(objectId: string): { freshness: number; level: FreshnessLevel } | null {
  const state = foodStates.get(objectId);
  if (!state) return null;
  return { freshness: Math.round(state.freshness), level: getFreshnessLevel(state.freshness) };
}

// ============================================================
// 茶水浓度
// ============================================================
interface TeaState {
  volume_ml: number;       // 当前体积
  concentration: number;   // 0-100
  max_volume_ml: number;   // 杯容量
  temperature: number;
}

const teaStates: Map<string, TeaState> = new Map();

export function initTea(objectId: string, maxVolume: number = 300): void {
  teaStates.set(objectId, {
    volume_ml: 0,
    concentration: 0,
    max_volume_ml: maxVolume,
    temperature: 25,
  });
}

export function pourWater(objectId: string, volumeMl: number, temperature: number): { ok: boolean; message: string } {
  const tea = teaStates.get(objectId);
  if (!tea) return { ok: false, message: '茶杯不存在' };

  const space = tea.max_volume_ml - tea.volume_ml;
  if (space <= 0) return { ok: false, message: '杯子已满' };

  const actualPour = Math.min(volumeMl, space);
  // 混合温度
  tea.temperature = (tea.temperature * tea.volume_ml + temperature * actualPour) / (tea.volume_ml + actualPour);
  tea.volume_ml += actualPour;

  log('CHEM', `${objectId}: 注水 ${actualPour}ml，温度 ${tea.temperature.toFixed(1)}°C，总体积 ${tea.volume_ml}ml`);
  return { ok: true, message: `已注入 ${actualPour}ml` };
}

export function drinkTea(objectId: string, sips: number): { ok: boolean; message: string } {
  const tea = teaStates.get(objectId);
  if (!tea) return { ok: false, message: '茶杯不存在' };

  const drinkVolume = sips * 20; // 每口约20ml
  if (tea.volume_ml <= 0) return { ok: false, message: '杯子已空' };

  const actualDrink = Math.min(drinkVolume, tea.volume_ml);
  tea.volume_ml -= actualDrink;
  // 浓度不变（只减少了体积）
  tea.concentration = tea.volume_ml > 0 ? tea.concentration : 0;

  log('CHEM', `${objectId}: 喝掉 ${actualDrink}ml，剩余 ${tea.volume_ml}ml`);
  return { ok: true, message: `喝掉 ${actualDrink}ml` };
}

export function getTeaState(objectId: string): TeaState | null {
  return teaStates.get(objectId) ?? null;
}

// ============================================================
// 燃烧消耗
// ============================================================
interface BurnState {
  fuel_remaining: number;  // 0-100
  burn_rate: number;        // 每秒消耗百分比
  ventilation: number;      // 通风系数 0-1（开窗=0.8，关窗=0.3）
  lit: boolean;
  light_output: number;     // 光照输出 0-100
  heat_output: number;      // 热输出 0-100
}

const burnStates: Map<string, BurnState> = new Map();

export function lightCandle(objectId: string, fuelAmount: number, ventilation: number): { ok: boolean; message: string } {
  if (burnStates.has(objectId) && burnStates.get(objectId)!.lit) {
    return { ok: false, message: '已经点燃' };
  }

  burnStates.set(objectId, {
    fuel_remaining: fuelAmount,
    burn_rate: ventilation * 0.05, // 通风越好烧得越快
    ventilation,
    lit: true,
    light_output: 30 + ventilation * 40,
    heat_output: 10 + ventilation * 20,
  });

  log('CHEM', `${objectId}: 点燃，燃料 ${fuelAmount}%，通风 ${(ventilation * 100).toFixed(0)}%`);
  return { ok: true, message: '已点燃' };
}

export function extinguish(objectId: string): { ok: boolean; message: string } {
  const state = burnStates.get(objectId);
  if (!state || !state.lit) return { ok: false, message: '未点燃' };

  state.lit = false;
  log('CHEM', `${objectId}: 熄灭，剩余燃料 ${state.fuel_remaining.toFixed(1)}%`);
  return { ok: true, message: '已熄灭' };
}

/** 每秒调用 */
export function tickCombustion(dtSeconds: number): void {
  for (const [id, state] of burnStates) {
    if (!state.lit) continue;

    state.fuel_remaining -= state.burn_rate * dtSeconds;

    if (state.fuel_remaining <= 0) {
      state.fuel_remaining = 0;
      state.lit = false;
      state.light_output = 0;
      state.heat_output = 0;
      log('CHEM', `${id}: 燃料耗尽，熄灭`);
      burnStates.delete(id);
    }
  }
}

export function getBurnState(objectId: string): BurnState | null {
  return burnStates.get(objectId) ?? null;
}

// ============================================================
// 全局化学 tick
// ============================================================
export function chemistryTick(dtSeconds: number): void {
  tickCooling(dtSeconds);
  tickFoodDecay(dtSeconds);
  tickCombustion(dtSeconds);
}
