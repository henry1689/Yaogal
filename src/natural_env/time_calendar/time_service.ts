/**
 * 时间服务 — 瑶光 Yaogal 核心时钟
 * 铁律：时间单向流动，不可回溯、不可快进、不可瞬移
 * V2：集成真实农历/节气/月相算法
 */
import { getDb } from '../../common/database';
import { log, clamp, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';
import {
  SOLAR_TERMS, calculateSolarTerms, calculateMoonPhase,
  solarToLunar as realSolarToLunar, type LunarDate
} from './lunar_data';

let tickInterval: NodeJS.Timeout | null = null;
let lastTickMs = 0;
let cachedTerms: Map<string, Date> | null = null;
let cachedYear = 0;

export function startTimeService(): void {
  log('TIME', '时间服务启动（真实农历/节气/月相），跟随系统时钟...');
  tickInterval = setInterval(tick, 1000);
}

function tick(): void {
  const now = new Date();
  const nowMsVal = nowMs();

  if (nowMsVal - lastTickMs < 900) return;
  lastTickMs = nowMsVal;

  // 缓存节气（每年只算一次）
  if (now.getFullYear() !== cachedYear) {
    cachedTerms = calculateSolarTerms(now.getFullYear());
    cachedYear = now.getFullYear();
  }

  const season = getSeason(now.getMonth());
  const isDaytime = now.getHours() >= 6 && now.getHours() < 18;
  const solarTerm = getCurrentSolarTerm(now, cachedTerms!);
  const [moonPhase, moonAngle, moonAge] = calculateMoonPhase(now);
  const lunarDate = realSolarToLunar(now);

  const db = getDb();
  db.prepare(`
    UPDATE world_time SET
      tick_count = tick_count + 1,
      sim_timestamp_ms = ?, real_timestamp_ms = ?,
      year = ?, month = ?, day = ?, hour = ?, minute = ?, second = ?,
      weekday = ?, season = ?, solar_term = ?,
      lunar_month = ?, lunar_day = ?,
      moon_phase = ?, is_daytime = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    nowMsVal, nowMsVal,
    now.getFullYear(), now.getMonth() + 1, now.getDate(),
    now.getHours(), now.getMinutes(), now.getSeconds(),
    now.getDay(), season, solarTerm,
    lunarDate?.month || 0, lunarDate?.day || 0,
    moonPhase, isDaytime ? 1 : 0
  );

  worldBus.emit(WorldEvents.TIME_TICK, {
    timestamp: nowMsVal,
    lunarDate,
    solarTerm,
    moonPhase,
    moonAge
  });

  if (now.getSeconds() === 0) {
    worldBus.emit(WorldEvents.TIME_HOUR, { hour: now.getHours() });
  }

  if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0) {
    worldBus.emit(WorldEvents.TIME_DAY, { date: now.toISOString().slice(0, 10), lunarDate });
  }
}

/** 获取当前节气 */
function getCurrentSolarTerm(date: Date, terms: Map<string, Date>): string | null {
  let currentTerm: string | null = null;
  for (const [name, termDate] of terms) {
    if (termDate <= date) {
      currentTerm = name;
    } else {
      break;
    }
  }
  return currentTerm;
}

function getSeason(month: number): string {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export function stopTimeService(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  log('TIME', '时间服务已停止');
}

export function getWorldTime(): any {
  return getDb().prepare('SELECT * FROM world_time WHERE id = 1').get();
}

export function hoursSince(timestampMs: number): number {
  return (nowMs() - timestampMs) / (1000 * 60 * 60);
}

/** 获取农历日期 */
export function getLunarDate(): LunarDate | null {
  return realSolarToLunar(new Date());
}

/** 获取Solar terms */
export { calculateSolarTerms, calculateMoonPhase, realSolarToLunar };
