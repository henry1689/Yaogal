/**
 * 第三圈：日常相伴 — 深化同居生活质感
 * 
 * 六模块：共餐/共寝/闲聊/默契/争吵与和解/周年记忆
 * 每秒tick推进，数据持久化至daily_together_state
 */
import { getDb } from '../common/database';
import { log, nowMs, clamp } from '../common/utils';
import { worldBus, WorldEvents } from '../core_bus/event_bus';
import { getSelfState } from '../self_entity/self_entity_service';

let initialized = false;

// ============================================================
// 状态类型
// ============================================================

interface TogetherState {
  // 共餐
  shared_meals_today: number;
  last_shared_meal_minute: number; // 世界分钟
  meal_sync_score: number;          // 0-100 饮食同步度
  meal_satisfaction: number;

  // 共寝
  in_bed_together: boolean;
  sleep_sync_score: number;         // 0-100 作息同步度
  last_wake_up_together: number;
  cuddle_this_night: boolean;

  // 闲聊
  chat_minutes_today: number;
  chat_mood: string;                // warm/neutral/distant
  last_chat_minute: number;
  chat_quality: number;             // 0-100

  // 默契
  tacit_score: number;              // 0-100 整体默契度
  predicts_correctly_today: number;
  predicts_wrong_today: number;
  silence_comfort: number;          // 安静共处的舒适度

  // 争吵与和解
  argument_active: boolean;
  argument_topic: string;
  argument_severity: number;        // 1-10
  argument_start_tick: number;
  reconciliation_attempted: boolean;
  reconciliation_accepted: boolean;
  grudge_level: number;             // 0-100 残余怨气

  // 周年记忆
  relationship_start_tick: number;  // 关系开始的tick
  anniversary_today: boolean;
  memory_milestones: Milestone[];
}

interface Milestone {
  tick: number;
  date_label: string;
  event: string;
  significance: number; // 1-10
}

let state: TogetherState = {
  shared_meals_today: 0,
  last_shared_meal_minute: 0,
  meal_sync_score: 50,
  meal_satisfaction: 70,

  in_bed_together: false,
  sleep_sync_score: 60,
  last_wake_up_together: 0,
  cuddle_this_night: false,

  chat_minutes_today: 0,
  chat_mood: 'neutral',
  last_chat_minute: 0,
  chat_quality: 50,

  tacit_score: 40,
  predicts_correctly_today: 0,
  predicts_wrong_today: 0,
  silence_comfort: 50,

  argument_active: false,
  argument_topic: '',
  argument_severity: 0,
  argument_start_tick: 0,
  reconciliation_attempted: false,
  reconciliation_accepted: false,
  grudge_level: 0,

  relationship_start_tick: -1,
  anniversary_today: false,
  memory_milestones: [],
};

// ============================================================
// 初始化
// ============================================================

export function initDailyTogether(): void {
  if (initialized) return;

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_together_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shared_meals_today INTEGER DEFAULT 0,
      meal_sync_score REAL DEFAULT 50,
      sleep_sync_score REAL DEFAULT 60,
      in_bed_together INTEGER DEFAULT 0,
      chat_minutes_today INTEGER DEFAULT 0,
      chat_quality REAL DEFAULT 50,
      chat_mood TEXT DEFAULT 'neutral',
      tacit_score REAL DEFAULT 40,
      silence_comfort REAL DEFAULT 50,
      argument_active INTEGER DEFAULT 0,
      argument_topic TEXT DEFAULT '',
      argument_severity REAL DEFAULT 0,
      grudge_level REAL DEFAULT 0,
      relationship_start_tick INTEGER DEFAULT 0,
      anniversary_today INTEGER DEFAULT 0,
      cuddle_this_night INTEGER DEFAULT 0,
      meal_satisfaction REAL DEFAULT 70,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`INSERT OR IGNORE INTO daily_together_state (id) VALUES (1)`);

  // 周年里程碑表
  db.exec(`
    CREATE TABLE IF NOT EXISTS together_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      date_label TEXT NOT NULL,
      event TEXT NOT NULL,
      significance INTEGER DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 争吵日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS argument_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      topic TEXT NOT NULL,
      severity INTEGER NOT NULL,
      resolution TEXT,
      duration_ticks INTEGER,
      learned TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 从DB恢复状态
  const row = db.prepare('SELECT * FROM daily_together_state WHERE id = 1').get() as any;
  if (row) {
    state.shared_meals_today = row.shared_meals_today || 0;
    state.meal_sync_score = row.meal_sync_score || 50;
    state.sleep_sync_score = row.sleep_sync_score || 60;
    state.in_bed_together = !!row.in_bed_together;
    state.chat_minutes_today = row.chat_minutes_today || 0;
    state.chat_quality = row.chat_quality || 50;
    state.chat_mood = row.chat_mood || 'neutral';
    state.tacit_score = row.tacit_score || 40;
    state.silence_comfort = row.silence_comfort || 50;
    state.argument_active = !!row.argument_active;
    state.argument_topic = row.argument_topic || '';
    state.argument_severity = row.argument_severity || 0;
    state.grudge_level = row.grudge_level || 0;
    state.relationship_start_tick = row.relationship_start_tick || 0;
    state.anniversary_today = !!row.anniversary_today;
    state.cuddle_this_night = !!row.cuddle_this_night;
    state.meal_satisfaction = row.meal_satisfaction || 70;
  }

  // 加载里程碑
  const milestones = db.prepare('SELECT * FROM together_milestones ORDER BY tick DESC').all() as any[];
  state.memory_milestones = milestones.map((m: any) => ({
    tick: m.tick,
    date_label: m.date_label,
    event: m.event,
    significance: m.significance,
  }));

  initialized = true;
  log('C3', '日常相伴模块初始化完成');
}

// ============================================================
// 每日重置
// ============================================================

let lastDayCheck = -1;

function checkDayReset(worldHour: number, worldMinute: number): void {
  const minuteOfDay = worldHour * 60 + worldMinute;
  if (minuteOfDay < lastDayCheck) {
    // 跨天了
    state.shared_meals_today = 0;
    state.chat_minutes_today = 0;
    state.predicts_correctly_today = 0;
    state.predicts_wrong_today = 0;
    state.anniversary_today = false;
  }
  lastDayCheck = minuteOfDay;
}

// ============================================================
// Tick
// ============================================================

let tickCount = 0;

export function dailyTogetherTick(dtSeconds: number): void {
  tickCount++;
  const self = getSelfState();
  // 用tick推算小时
  const simHour = (Math.floor(tickCount / 3600) % 24);
  const simMinute = Math.floor((tickCount % 3600) / 60);

  checkDayReset(simHour, simMinute);

  // 1. 默契自然衰减（长期不分交流会退化）
  if (tickCount % 600 === 0) { // 每10分钟
    state.tacit_score = clamp(state.tacit_score - 0.02, 0, 100);
  }

  // 2. 安静共处：在同一个场景且无活动时自然舒适
  if (self.action === 'idle' || self.action === 'sleep') {
    state.silence_comfort = clamp(state.silence_comfort + 0.01 * dtSeconds, 0, 100);
  }

  // 3. 共寝检测：夜晚+卧室+躺姿
  if (simHour >= 22 || simHour <= 6) {
    if (self.posture === 'lie' && self.current_scene === 'home') {
      if (!state.in_bed_together) {
        state.in_bed_together = true;
        state.cuddle_this_night = Math.random() < 0.6; // 60%概率今晚相拥
        log('C3', '两人进入共寝状态');
      }
    }
  } else if (state.in_bed_together && simHour > 7) {
    state.in_bed_together = false;
    state.last_wake_up_together = tickCount;
    log('C3', '两人醒来，共寝结束');
  }

  // 4. 争执持续时的怨气变化
  if (state.argument_active) {
    // 未和解时怨气随时间缓慢上升
    const ticksInArgument = tickCount - state.argument_start_tick;
    state.grudge_level = clamp(state.grudge_level + 0.002 * ticksInArgument * dtSeconds, 0, 100);

    // 如果持续时间极长(>2小时模拟)，自然降温
    if (ticksInArgument > 7200) {
      state.argument_severity = clamp(state.argument_severity - 0.01 * dtSeconds, 1, 10);
      if (state.argument_severity <= 2 && !state.reconciliation_attempted) {
        state.grudge_level = clamp(state.grudge_level - 0.5, 0, 100);
      }
    }
  } else if (state.grudge_level > 0 && state.reconciliation_accepted) {
    // 和解后怨气缓慢消散
    state.grudge_level = clamp(state.grudge_level - 0.02 * dtSeconds, 0, 100);
  }

  // 5. 周年检测（基于关系开始tick）
  if (state.relationship_start_tick > 0) {
    const relTicks = tickCount - state.relationship_start_tick;
    const relDays = relTicks / 86400;
    // 每100天检查周年
    if (relDays > 0 && relDays % 100 < 0.001 && !state.anniversary_today) {
      state.anniversary_today = true;
      addMilestone(tickCount, `第${Math.floor(relDays)}天`, '关系里程碑', 7);
    }
  }

  // 持久化（每30秒）
  if (tickCount % 30 === 0) {
    saveState();
  }
}

// ============================================================
// 行为接口
// ============================================================

/** 共享一顿饭 */
export function shareMeal(mealType: string): void {
  state.shared_meals_today++;
  state.meal_sync_score = clamp(state.meal_sync_score + 2, 0, 100);
  state.meal_satisfaction = clamp(state.meal_satisfaction + 1, 50, 100);

  // 共餐提升默契
  if (state.tacit_score < 80) {
    state.tacit_score = clamp(state.tacit_score + 0.5, 0, 100);
  }

  log('C3', `共享${mealType}: 今日第${state.shared_meals_today}餐, 同步度${state.meal_sync_score.toFixed(0)}`);

  // 超过3次共餐→里程碑
  if (state.shared_meals_today >= 3) {
    addMilestone(tickCount, `今日`, '一日三餐都在一起', 4);
  }
}

/** 一次闲聊 */
export function casualChat(durationMinutes: number, quality: number): void {
  state.chat_minutes_today += durationMinutes;
  state.chat_quality = clamp((state.chat_quality * 0.7 + quality * 0.3), 0, 100);

  // 高质量闲聊提升默契和餐桌满意度
  if (quality > 70) {
    state.tacit_score = clamp(state.tacit_score + 0.3, 0, 100);
    state.chat_mood = 'warm';
    if (state.grudge_level > 0 && !state.argument_active) {
      state.grudge_level = clamp(state.grudge_level - 1, 0, 100);
    }
  } else if (quality < 30) {
    state.chat_mood = 'distant';
  } else {
    state.chat_mood = 'neutral';
  }

  log('C3', `闲聊${durationMinutes}分钟, 质量${quality}, 今日累计${state.chat_minutes_today}分钟`);
}

/** 一次默契预测成功 */
export function tacitPrediction(correct: boolean): void {
  if (correct) {
    state.predicts_correctly_today++;
    state.tacit_score = clamp(state.tacit_score + 0.2, 0, 100);
  } else {
    state.predicts_wrong_today++;
    state.tacit_score = clamp(state.tacit_score - 0.1, 0, 100);
  }
}

/** 发起争吵 */
export function startArgument(topic: string, severity: number): void {
  if (state.argument_active) return;

  state.argument_active = true;
  state.argument_topic = topic;
  state.argument_severity = clamp(severity, 1, 10);
  state.argument_start_tick = tickCount;
  state.reconciliation_attempted = false;
  state.reconciliation_accepted = false;
  state.grudge_level = severity * 5;

  // 争吵降低默契和安静舒适度
  state.tacit_score = clamp(state.tacit_score - severity * 2, 0, 100);
  state.silence_comfort = clamp(state.silence_comfort - severity * 3, 0, 100);
  state.chat_mood = 'distant';

  log('C3', `争吵开始: "${topic}" (严重度${severity})`);
}

/** 尝试和解 */
export function attemptReconciliation(): string {
  if (!state.argument_active) return '当前无进行中的争吵';

  state.reconciliation_attempted = true;

  // 和解成功率 = 基础50% + 默契加成 - 严重度惩罚 - 怨气惩罚
  const baseRate = 50;
  const tacitBonus = state.tacit_score * 0.2;
  const severityPenalty = state.argument_severity * 3;
  const grudgePenalty = state.grudge_level * 0.3;
  const successRate = clamp(baseRate + tacitBonus - severityPenalty - grudgePenalty, 5, 95);

  const success = Math.random() * 100 < successRate;

  if (success) {
    state.reconciliation_accepted = true;
    state.argument_active = false;
    state.argument_severity = 0;
    state.chat_mood = 'warm';

    // 和解后默契可能恢复甚至增强
    state.tacit_score = clamp(state.tacit_score + 1, 0, 100);

    // 记录到日志
    getDb().prepare(`
      INSERT INTO argument_log (tick, topic, severity, resolution, duration_ticks, learned)
      VALUES (?, ?, ?, 'reconciled', ?, 'and_reconnected')
    `).run(tickCount, state.argument_topic, state.argument_severity, tickCount - state.argument_start_tick);

    log('C3', `和解成功! 成功率${successRate.toFixed(0)}%`);
    return 'reconciled';
  } else {
    // 失败的道歉反而增加怨气
    state.grudge_level = clamp(state.grudge_level + 5, 0, 100);
    log('C3', `和解失败... 成功率${successRate.toFixed(0)}%, 怨气${state.grudge_level.toFixed(0)}`);
    return 'rejected';
  }
}

/** 强制结束争吵（冷战结束） */
export function endArgumentColdly(): void {
  if (!state.argument_active) return;

  getDb().prepare(`
    INSERT INTO argument_log (tick, topic, severity, resolution, duration_ticks, learned)
    VALUES (?, ?, ?, 'cold_end', ?, 'unresolved')
  `).run(tickCount, state.argument_topic, state.argument_severity, tickCount - state.argument_start_tick);

  state.argument_active = false;
  state.reconciliation_accepted = false;
  state.argument_severity = 0;
  // 冷战结束后默契大幅下降
  state.tacit_score = clamp(state.tacit_score - 5, 0, 100);
  state.silence_comfort = clamp(state.silence_comfort - 10, 0, 100);

  log('C3', '争吵以冷战方式结束，默契度下降');
}

/** 相拥而眠 */
export function cuddleToSleep(): void {
  state.cuddle_this_night = true;
  state.sleep_sync_score = clamp(state.sleep_sync_score + 3, 0, 100);
  state.tacit_score = clamp(state.tacit_score + 0.5, 0, 100);

  // 相拥大幅消除怨气
  if (state.grudge_level > 0 && !state.argument_active) {
    state.grudge_level = clamp(state.grudge_level - 15, 0, 100);
  }

  addMilestone(tickCount, '今晚', '相拥而眠', 5);
  log('C3', '相拥而眠——同步度+3，默契+0.5');
}

/** 添加里程碑 */
function addMilestone(tick: number, dateLabel: string, event: string, significance: number): void {
  state.memory_milestones.unshift({ tick, date_label: dateLabel, event, significance });
  // 只保留最近100条
  if (state.memory_milestones.length > 100) {
    state.memory_milestones = state.memory_milestones.slice(0, 100);
  }

  getDb().prepare(`
    INSERT INTO together_milestones (tick, date_label, event, significance)
    VALUES (?, ?, ?, ?)
  `).run(tick, dateLabel, event, significance);
}

/** 设置关系开始时间 */
export function setRelationshipStart(tick: number): void {
  state.relationship_start_tick = tick;
  log('C3', `关系起点设定: tick ${tick}`);
}

// ============================================================
// 持久化
// ============================================================

function saveState(): void {
  getDb().prepare(`
    UPDATE daily_together_state SET
      shared_meals_today = ?, meal_sync_score = ?, sleep_sync_score = ?,
      in_bed_together = ?, chat_minutes_today = ?, chat_quality = ?,
      chat_mood = ?, tacit_score = ?, silence_comfort = ?,
      argument_active = ?, argument_topic = ?, argument_severity = ?,
      grudge_level = ?, relationship_start_tick = ?, anniversary_today = ?,
      cuddle_this_night = ?, meal_satisfaction = ?,
      updated_at = datetime('now','localtime')
    WHERE id = 1
  `).run(
    state.shared_meals_today, state.meal_sync_score, state.sleep_sync_score,
    state.in_bed_together ? 1 : 0, state.chat_minutes_today, state.chat_quality,
    state.chat_mood, state.tacit_score, state.silence_comfort,
    state.argument_active ? 1 : 0, state.argument_topic, state.argument_severity,
    state.grudge_level, state.relationship_start_tick, state.anniversary_today ? 1 : 0,
    state.cuddle_this_night ? 1 : 0, state.meal_satisfaction,
  );
}

// ============================================================
// 快照接口
// ============================================================

export function getTogetherSnapshot(): object {
  return {
    shared_meals_today: state.shared_meals_today,
    meal_sync_score: state.meal_sync_score,
    meal_satisfaction: state.meal_satisfaction,
    in_bed_together: state.in_bed_together,
    sleep_sync_score: state.sleep_sync_score,
    cuddle_this_night: state.cuddle_this_night,
    chat_minutes_today: state.chat_minutes_today,
    chat_mood: state.chat_mood,
    chat_quality: state.chat_quality,
    tacit_score: state.tacit_score,
    silence_comfort: state.silence_comfort,
    argument: {
      active: state.argument_active,
      topic: state.argument_topic,
      severity: state.argument_severity,
      grudge_level: state.grudge_level,
      duration_ticks: state.argument_active ? tickCount - state.argument_start_tick : 0,
      reconciled: state.reconciliation_accepted,
    },
    anniversary_today: state.anniversary_today,
    relationship_days: state.relationship_start_tick > 0 ? Math.floor((tickCount - state.relationship_start_tick) / 86400) : 0,
    recent_milestones: state.memory_milestones.slice(0, 5),
    silent_prediction: {
      correct_today: state.predicts_correctly_today,
      wrong_today: state.predicts_wrong_today,
    },
  };
}
