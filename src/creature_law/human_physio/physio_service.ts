/**
 * 生理服务 — 人体仿生时序系统
 * 伤病愈合、作息疲劳、孕期完整时序
 */
import { getDb } from '../../common/database';
import { log, nowMs, decay, clamp } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';
import { getWorldTime, hoursSince } from '../../natural_env/time_calendar/time_service';

let physioTimer: NodeJS.Timeout | null = null;

export function startPhysioService(): void {
  log('PHYSIO', '生理服务启动...');
  physioTimer = setInterval(physioTick, 5000); // 每5秒更新
}

function physioTick(): void {
  const db = getDb();
  const state = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  const worldTime = getWorldTime();
  if (!state || !worldTime) return;

  const hour = worldTime.hour;
  const isDaytime = worldTime.is_daytime === 1;

  // ===== 作息疲劳 =====
  let newFatigue = state.fatigue_level;
  if (hour >= 22 || hour <= 5) {
    // 深夜：疲劳累积加快
    newFatigue = decay(newFatigue, 100, 0.0005, 5);
  } else if (isDaytime) {
    // 白天：根据小时消耗精力
    const baseDecay = hour >= 8 && hour <= 18 ? 0.0008 : 0.0003;
    newFatigue = decay(newFatigue, 80, baseDecay, 5);
  }
  // 假设睡眠时段（00-06）疲劳恢复
  if (hour >= 0 && hour <= 6) {
    newFatigue = decay(newFatigue, 5, 0.003, 5);
  }
  newFatigue = clamp(newFatigue, 0, 100);

  // ===== 精力值 =====
  const newEnergy = clamp(100 - newFatigue * 0.8, 0, 100);

  // ===== 伤病愈合 =====
  let newHealth = state.health_score;
  let injuryType = state.injury_type;
  let injurySeverity = state.injury_severity;
  let injuryStart = state.injury_start_ms;
  let injuryHealBy = state.injury_heal_by_ms;

  if (injurySeverity > 0 && injuryStart && injuryHealBy) {
    const elapsed = nowMs() - injuryStart;
    const healDuration = injuryHealBy - injuryStart;
    const progress = clamp(elapsed / healDuration, 0, 1);
    
    if (progress >= 1) {
      // 完全愈合
      newHealth = 100;
      injuryType = null;
      injurySeverity = 0;
      injuryStart = null;
      injuryHealBy = null;
      log('PHYSIO', '伤病已完全愈合');
    } else {
      // 渐进恢复
      const healCurve = Math.pow(progress, 0.7); // 前期快后期慢
      newHealth = clamp(50 + healCurve * 50, 50, 100);
    }
  }

  // ===== 孕期时序 =====
  let pregnancyStage = state.pregnancy_stage;
  if (state.pregnancy_stage && state.pregnancy_start_ms && state.pregnancy_due_ms) {
    const elapsed = hoursSince(state.pregnancy_start_ms);
    const totalHours = (state.pregnancy_due_ms - state.pregnancy_start_ms) / (1000 * 60 * 60);
    const progress = clamp(elapsed / totalHours, 0, 1);

    if (progress >= 1) {
      pregnancyStage = 'postpartum';
      worldBus.emit(WorldEvents.PREGNANCY_BIRTH, { timestamp: nowMs() });
      log('PHYSIO', '孕期结束，分娩');
    } else if (progress < 1/3) {
      pregnancyStage = 'early';
    } else if (progress < 2/3) {
      pregnancyStage = 'mid';
    } else {
      pregnancyStage = 'late';
    }
    worldBus.emit(WorldEvents.PREGNANCY_STAGE, { stage: pregnancyStage, progress });
  }

  // ===== 体温 =====
  const baseTemp = 36.5;
  const timeVariation = Math.sin((hour - 6) / 24 * Math.PI * 2) * 0.5; // 昼夜波动
  const newBodyTemp = baseTemp + timeVariation;

  // ===== 更新数据库 =====
  db.prepare(`
    UPDATE physio_state SET
      fatigue_level = ?, energy_level = ?,
      health_score = ?, injury_type = ?, injury_severity = ?, injury_start_ms = ?, injury_heal_by_ms = ?,
      pregnancy_stage = ?, body_temp = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    newFatigue, newEnergy,
    newHealth, injuryType, injurySeverity, injuryStart, injuryHealBy,
    pregnancyStage, newBodyTemp
  );

  worldBus.emit(WorldEvents.PHYSIO_TICK, {
    fatigue: newFatigue,
    energy: newEnergy,
    health: newHealth,
    bodyTemp: newBodyTemp,
  });
}

/** 触发伤病 */
export function applyInjury(type: string, severity: 1|2|3): void {
  const db = getDb();
  const healDays = severity === 1 ? 3 : severity === 2 ? 14 : 60;
  const healDurationMs = healDays * 24 * 60 * 60 * 1000;
  
  db.prepare(`
    UPDATE physio_state SET
      health_score = 50,
      injury_type = ?, injury_severity = ?,
      injury_start_ms = ?, injury_heal_by_ms = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(type, severity, nowMs(), nowMs() + healDurationMs);
  
  log('PHYSIO', `伤病触发: ${type} (严重度${severity}, 预计${healDays}天愈合)`);
  worldBus.emit(WorldEvents.HEALTH_STATE_CHANGED, { type, severity, healDays });
}

/** 触发受孕（启动孕期时序） */
export function startPregnancy(): void {
  const db = getDb();
  const dueMs = nowMs() + 280 * 24 * 60 * 60 * 1000; // 280天 ≈ 10个月
  
  db.prepare(`
    UPDATE physio_state SET
      pregnancy_stage = 'early',
      pregnancy_start_ms = ?, pregnancy_due_ms = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(nowMs(), dueMs);
  
  log('PHYSIO', '孕期启动: 预计分娩日期 ' + new Date(dueMs).toISOString().slice(0,10));
  worldBus.emit(WorldEvents.PREGNANCY_STAGE, { stage: 'early', progress: 0 });
}

export function stopPhysioService(): void {
  if (physioTimer) {
    clearInterval(physioTimer);
    physioTimer = null;
  }
}
