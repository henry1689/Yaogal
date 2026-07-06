/**
 * 时间服务 — PersonalWorld 核心时钟
 * 铁律：时间单向流动，不可回溯、不可快进、不可瞬移
 */
import { getDb } from '../../common/database';
import { log, clamp, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ===== 农历/节气（占位，后续集成 lunar-javascript） =====
const SOLAR_TERMS = [
  '小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨',
  '立夏','小满','芒种','夏至','小暑','大暑',
  '立秋','处暑','白露','秋分','寒露','霜降',
  '立冬','小雪','大雪','冬至'
];

const MOON_PHASES = ['新月','娥眉月','上弦月','盈凸月','满月','亏凸月','下弦月','残月'];

let tickInterval: NodeJS.Timeout | null = null;
let lastTickMs = 0;

export function startTimeService(): void {
  log('TIME', '时间服务启动，跟随系统时钟...');
  
  // 每秒 tick
  tickInterval = setInterval(tick, 1000);
}

function tick(): void {
  const now = new Date();
  const nowMsVal = nowMs();
  
  // 防止重复 tick
  if (nowMsVal - lastTickMs < 900) return;
  lastTickMs = nowMsVal;

  const season = getSeason(now.getMonth());
  const isDaytime = now.getHours() >= 6 && now.getHours() < 18;
  const solarTerm = getApproxSolarTerm(now.getMonth(), now.getDate());
  const moonPhase = getApproxMoonPhase(now);

  const db = getDb();
  db.prepare(`
    UPDATE world_time SET
      tick_count = tick_count + 1,
      sim_timestamp_ms = ?,
      real_timestamp_ms = ?,
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
    0, 0,
    moonPhase, isDaytime ? 1 : 0
  );

  // 发送事件
  worldBus.emit(WorldEvents.TIME_TICK, { timestamp: nowMsVal });

  if (now.getSeconds() === 0) {
    worldBus.emit(WorldEvents.TIME_HOUR, { hour: now.getHours() });
  }

  if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0) {
    worldBus.emit(WorldEvents.TIME_DAY, { date: now.toISOString().slice(0, 10) });
  }
}

function getSeason(month: number): string {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

function getApproxSolarTerm(month: number, day: number): string | null {
  // 简易近似：每两个节气约15天
  const termIndex = month * 2 + (day > 15 ? 1 : 0);
  return SOLAR_TERMS[Math.min(termIndex, 23)] || null;
}

function getApproxMoonPhase(date: Date): string {
  // 简易近似：29.5天周期，以新月为起点
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const daysSince = (date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
  const phaseIndex = Math.floor((daysSince % 29.5) / 29.5 * 8) % 8;
  return MOON_PHASES[phaseIndex];
}

export function stopTimeService(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  log('TIME', '时间服务已停止');
}

/** 获取当前世界时间 */
export function getWorldTime(): any {
  return getDb().prepare('SELECT * FROM world_time WHERE id = 1').get();
}

/** 计算时间差（小时） */
export function hoursSince(timestampMs: number): number {
  return (nowMs() - timestampMs) / (1000 * 60 * 60);
}
