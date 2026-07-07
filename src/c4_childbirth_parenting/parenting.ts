/**
 * 第四圈：生育与抚养 — 孕期→分娩→产后→婴儿→儿童→青少年
 *
 * 六阶段完整时序：
 *   孕期（40周）、分娩（三产程）、产后恢复（6周）、
 *   婴儿期（0-1岁）、幼儿期（1-6岁）、儿童青少年期（6-18岁）
 */
import { getDb } from '../common/database';
import { log, nowMs, clamp } from '../common/utils';

let initialized = false;
let tickCount = 0;

// ============================================================
// 常量
// ============================================================

const PREGNANCY_DURATION_TICKS = 40 * 7 * 86400; // 40周(280天)
const TRIMESTER_1_END = 12 * 7 * 86400;          // 孕期第一阶段(12周)
const TRIMESTER_2_END = 27 * 7 * 86400;          // 孕期第二阶段(27周)
const TRIMESTER_3_END = PREGNANCY_DURATION_TICKS; // 孕期第三阶段(40周)

// 分娩阶段（ticks）
const LABOR_PHASE_EARLY = 6 * 3600;      // 潜伏期 6h
const LABOR_PHASE_ACTIVE = 6 * 3600;     // 活跃期 6h
const LABOR_PHASE_TRANSITION = 2 * 3600; // 过渡期 2h
const LABOR_PHASE_PUSHING = 2 * 3600;    // 娩出期 2h
const LABOR_PHASE_PLACENTA = 1 * 3600;   // 胎盘期 1h

// 产后恢复阶段
const POSTPARTUM_IMMEDIATE = 7 * 86400;   // 1周
const POSTPARTUM_EARLY = 42 * 86400;      // 6周
const POSTPARTUM_FULL = 365 * 86400;      // 1年

// 婴儿发育里程碑（月龄）
const INFANT_MILESTONES: [number, string, string][] = [
  [1, 'first_smile', '首次社会性微笑'],
  [2, 'lifts_head', '能抬头45度'],
  [3, 'tracks_objects', '视线追踪物体'],
  [4, 'rolls_over', '翻身'],
  [6, 'sits_alone', '独坐'],
  [7, 'babbles', '咿呀学语'],
  [8, 'crawls', '爬行'],
  [9, 'pulls_to_stand', '扶站'],
  [11, 'first_words', '说第一个词'],
  [12, 'first_steps', '独立行走'],
];

// ============================================================
// 状态类型
// ============================================================

interface ParentingState {
  // 孕期
  is_pregnant: boolean;
  pregnancy_start_tick: number;
  pregnancy_due_tick: number;
  trimester: number; // 1/2/3
  pregnancy_symptoms: PregnancySymptoms;
  fetus_health: number;
  fetus_weight_grams: number;
  fetus_length_cm: number;

  // 分娩
  is_in_labor: boolean;
  labor_start_tick: number;
  labor_phase: string; // early/active/transition/pushing/placenta
  contraction_frequency_sec: number;
  contraction_duration_sec: number;
  contraction_intensity: number; // 1-10
  cervical_dilation_cm: number;  // 0-10
  baby_delivered: boolean;
  placenta_delivered: boolean;

  // 产后
  is_postpartum: boolean;
  postpartum_start_tick: number;
  lochia_volume: number;        // 恶露量 0-100
  uterine_involution_pct: number; // 子宫复旧百分比
  pelvic_floor_recovery: number;  // 0-100
  breastfeeding: boolean;
  milk_supply_ml: number;
  maternal_fatigue: number;
  perineal_healing: number;     // 会阴愈合 0-100

  // 婴儿 (0-1岁)
  baby_exists: boolean;
  baby_birth_tick: number;
  baby_age_months: number;
  baby_weight_grams: number;
  baby_height_cm: number;
  baby_hunger: number;          // 0-100
  baby_tiredness: number;       // 0-100
  baby_comfort: number;         // 0-100
  baby_mood: string;            // happy/content/fussy/crying
  baby_sleeping: boolean;
  baby_health: number;
  diapers_changed_today: number;
  feeds_today: number;
  baby_milestones_hit: string[];
  immunizations_done: string[];

  // 儿童 (1-18岁)
  child_mode: string;           // infant/toddler/preschool/school/teen
  child_age_years: number;
  child_independence: number;   // 0-100
  child_school_performance: number;
  child_social_skills: number;
  child_emotional_regulation: number;
  child_rebellion_level: number;
  child_identity_exploration: number;
}

interface PregnancySymptoms {
  morning_sickness: number;     // 0-10
  fatigue: number;
  back_pain: number;
  breast_tenderness: number;
  frequent_urination: number;
  mood_swings: number;
  food_cravings: string;
  food_aversions: string;
}

let state: ParentingState = {
  is_pregnant: false,
  pregnancy_start_tick: 0,
  pregnancy_due_tick: 0,
  trimester: 0,
  pregnancy_symptoms: {
    morning_sickness: 0, fatigue: 0, back_pain: 0,
    breast_tenderness: 0, frequent_urination: 0,
    mood_swings: 0, food_cravings: '', food_aversions: '',
  },
  fetus_health: 100,
  fetus_weight_grams: 0,
  fetus_length_cm: 0,

  is_in_labor: false,
  labor_start_tick: 0,
  labor_phase: '',
  contraction_frequency_sec: 0,
  contraction_duration_sec: 0,
  contraction_intensity: 0,
  cervical_dilation_cm: 0,
  baby_delivered: false,
  placenta_delivered: false,

  is_postpartum: false,
  postpartum_start_tick: 0,
  lochia_volume: 0,
  uterine_involution_pct: 0,
  pelvic_floor_recovery: 0,
  breastfeeding: false,
  milk_supply_ml: 0,
  maternal_fatigue: 50,
  perineal_healing: 0,

  baby_exists: false,
  baby_birth_tick: 0,
  baby_age_months: 0,
  baby_weight_grams: 3200,
  baby_height_cm: 50,
  baby_hunger: 30,
  baby_tiredness: 20,
  baby_comfort: 80,
  baby_mood: 'content',
  baby_sleeping: true,
  baby_health: 100,
  diapers_changed_today: 0,
  feeds_today: 0,
  baby_milestones_hit: [],
  immunizations_done: [],

  child_mode: 'infant',
  child_age_years: 0,
  child_independence: 5,
  child_school_performance: 50,
  child_social_skills: 30,
  child_emotional_regulation: 20,
  child_rebellion_level: 0,
  child_identity_exploration: 10,
};

// ============================================================
// 初始化
// ============================================================

export function initParenting(): void {
  if (initialized) return;

  const db = getDb();

  // 孕期/分娩/抚养总状态表
  db.exec(`
    CREATE TABLE IF NOT EXISTS parenting_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_pregnant INTEGER DEFAULT 0,
      pregnancy_start_tick INTEGER DEFAULT 0,
      trimester INTEGER DEFAULT 0,
      fetus_health REAL DEFAULT 100,
      fetus_weight_grams REAL DEFAULT 0,
      is_in_labor INTEGER DEFAULT 0,
      labor_phase TEXT DEFAULT '',
      cervical_dilation_cm REAL DEFAULT 0,
      baby_delivered INTEGER DEFAULT 0,
      placenta_delivered INTEGER DEFAULT 0,
      is_postpartum INTEGER DEFAULT 0,
      uterine_involution_pct REAL DEFAULT 0,
      breastfeeding INTEGER DEFAULT 0,
      milk_supply_ml REAL DEFAULT 0,
      baby_exists INTEGER DEFAULT 0,
      baby_birth_tick INTEGER DEFAULT 0,
      baby_age_months REAL DEFAULT 0,
      baby_weight_grams REAL DEFAULT 3200,
      baby_height_cm REAL DEFAULT 50,
      baby_hunger REAL DEFAULT 30,
      baby_mood TEXT DEFAULT 'content',
      baby_sleeping INTEGER DEFAULT 1,
      baby_health REAL DEFAULT 100,
      child_age_years REAL DEFAULT 0,
      child_independence REAL DEFAULT 5,
      child_school_performance REAL DEFAULT 50,
      child_social_skills REAL DEFAULT 30,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`INSERT OR IGNORE INTO parenting_state (id) VALUES (1)`);

  // 婴儿事件日志（喂养/换尿布/里程碑）
  db.exec(`
    CREATE TABLE IF NOT EXISTS baby_event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 从DB恢复状态
  restoreState();

  initialized = true;
  log('C4', '生育与抚养模块初始化完成');
}

function restoreState(): void {
  const db = getDb();
  const row = db.prepare('SELECT * FROM parenting_state WHERE id = 1').get() as any;
  if (!row) return;

  state.is_pregnant = !!row.is_pregnant;
  state.pregnancy_start_tick = row.pregnancy_start_tick || 0;
  state.trimester = row.trimester || 0;
  state.fetus_health = row.fetus_health ?? 100;
  state.fetus_weight_grams = row.fetus_weight_grams ?? 0;
  state.is_in_labor = !!row.is_in_labor;
  state.labor_phase = row.labor_phase || '';
  state.cervical_dilation_cm = row.cervical_dilation_cm ?? 0;
  state.baby_delivered = !!row.baby_delivered;
  state.placenta_delivered = !!row.placenta_delivered;
  state.is_postpartum = !!row.is_postpartum;
  state.uterine_involution_pct = row.uterine_involution_pct ?? 0;
  state.breastfeeding = !!row.breastfeeding;
  state.milk_supply_ml = row.milk_supply_ml ?? 0;
  state.baby_exists = !!row.baby_exists;
  state.baby_birth_tick = row.baby_birth_tick || 0;
  state.baby_age_months = row.baby_age_months ?? 0;
  state.baby_weight_grams = row.baby_weight_grams ?? 3200;
  state.baby_height_cm = row.baby_height_cm ?? 50;
  state.baby_hunger = row.baby_hunger ?? 30;
  state.baby_mood = row.baby_mood || 'content';
  state.baby_sleeping = !!row.baby_sleeping;
  state.baby_health = row.baby_health ?? 100;
  state.child_age_years = row.child_age_years ?? 0;
  state.child_independence = row.child_independence ?? 5;
  state.child_school_performance = row.child_school_performance ?? 50;
  state.child_social_skills = row.child_social_skills ?? 30;

  // 恢复里程碑
  const milestones = db.prepare("SELECT detail FROM baby_event_log WHERE event_type='milestone'").all() as any[];
  state.baby_milestones_hit = milestones.map((m: any) => m.detail);
}

// ============================================================
// Tick
// ============================================================

export function parentingTick(dtSeconds: number): void {
  tickCount++;

  // 孕期推进
  if (state.is_pregnant) {
    tickPregnancy(dtSeconds);
  }

  // 分娩推进
  if (state.is_in_labor) {
    tickLabor(dtSeconds);
  }

  // 产后恢复
  if (state.is_postpartum) {
    tickPostpartum(dtSeconds);
  }

  // 婴儿tick
  if (state.baby_exists && state.baby_age_months < 12) {
    tickInfant(dtSeconds);
  }

  // 儿童tick
  if (state.baby_exists && state.baby_age_months >= 12) {
    tickChild(dtSeconds);
  }

  // 持久化
  if (tickCount % 60 === 0) {
    saveState();
  }
}

// ============================================================
// 孕期tick
// ============================================================

function tickPregnancy(dtSeconds: number): void {
  const elapsed = tickCount - state.pregnancy_start_tick;

  // 三阶段判定
  if (elapsed < TRIMESTER_1_END) {
    state.trimester = 1;
    state.pregnancy_symptoms.morning_sickness = clamp(7 - (elapsed / TRIMESTER_1_END) * 4, 0, 7);
    state.pregnancy_symptoms.fatigue = clamp(8 - (elapsed / TRIMESTER_1_END) * 2, 4, 8);
    state.pregnancy_symptoms.breast_tenderness = 6;
    // 胎儿发育：3mm→7cm
    state.fetus_length_cm = 0.3 + (elapsed / TRIMESTER_1_END) * 6.7;
    state.fetus_weight_grams = (elapsed / TRIMESTER_1_END) * 14;
  } else if (elapsed < TRIMESTER_2_END) {
    state.trimester = 2;
    state.pregnancy_symptoms.morning_sickness = clamp(3 - ((elapsed - TRIMESTER_1_END) / (TRIMESTER_2_END - TRIMESTER_1_END)) * 2, 0, 3);
    state.pregnancy_symptoms.fatigue = clamp(5, 3, 5);
    state.pregnancy_symptoms.back_pain = clamp(2 + ((elapsed - TRIMESTER_1_END) / (TRIMESTER_2_END - TRIMESTER_1_END)) * 3, 0, 5);
    // 7cm→35cm
    state.fetus_length_cm = 7 + ((elapsed - TRIMESTER_1_END) / (TRIMESTER_2_END - TRIMESTER_1_END)) * 28;
    state.fetus_weight_grams = 14 + ((elapsed - TRIMESTER_1_END) / (TRIMESTER_2_END - TRIMESTER_1_END)) * 986;
  } else {
    state.trimester = 3;
    state.pregnancy_symptoms.fatigue = clamp(5 + ((elapsed - TRIMESTER_2_END) / (TRIMESTER_3_END - TRIMESTER_2_END)) * 3, 5, 8);
    state.pregnancy_symptoms.back_pain = clamp(5 + ((elapsed - TRIMESTER_2_END) / (TRIMESTER_3_END - TRIMESTER_2_END)) * 3, 5, 8);
    state.pregnancy_symptoms.frequent_urination = clamp(5 + ((elapsed - TRIMESTER_2_END) / (TRIMESTER_3_END - TRIMESTER_2_END)) * 3, 5, 8);
    state.pregnancy_symptoms.mood_swings = clamp(4, 3, 7);
    // 35cm→50cm
    const progress3 = (elapsed - TRIMESTER_2_END) / (TRIMESTER_3_END - TRIMESTER_2_END);
    state.fetus_length_cm = 35 + progress3 * 15;
    state.fetus_weight_grams = 1000 + progress3 * 2500;
  }

  // 孕期结束→触发分娩
  if (elapsed >= PREGNANCY_DURATION_TICKS) {
    startLabor();
  }
}

// ============================================================
// 分娩tick
// ============================================================

function tickLabor(dtSeconds: number): void {
  const elapsed = tickCount - state.labor_start_tick;

  if (elapsed < LABOR_PHASE_EARLY) {
    state.labor_phase = 'early';
    const progress = elapsed / LABOR_PHASE_EARLY;
    state.cervical_dilation_cm = 0 + progress * 3;
    state.contraction_frequency_sec = 600 - progress * 300; // 10min→5min
    state.contraction_duration_sec = 30 + progress * 15;     // 30s→45s
    state.contraction_intensity = 1 + progress * 3;          // 1→4
  } else if (elapsed < LABOR_PHASE_EARLY + LABOR_PHASE_ACTIVE) {
    state.labor_phase = 'active';
    const progress = (elapsed - LABOR_PHASE_EARLY) / LABOR_PHASE_ACTIVE;
    state.cervical_dilation_cm = 3 + progress * 4;   // 3cm→7cm
    state.contraction_frequency_sec = 300 - progress * 180;  // 5min→2min
    state.contraction_duration_sec = 45 + progress * 15;     // 45s→60s
    state.contraction_intensity = 4 + progress * 3;          // 4→7
  } else if (elapsed < LABOR_PHASE_EARLY + LABOR_PHASE_ACTIVE + LABOR_PHASE_TRANSITION) {
    state.labor_phase = 'transition';
    const progress = (elapsed - LABOR_PHASE_EARLY - LABOR_PHASE_ACTIVE) / LABOR_PHASE_TRANSITION;
    state.cervical_dilation_cm = 7 + progress * 3;   // 7cm→10cm
    state.contraction_frequency_sec = 120 - progress * 60;   // 2min→1min
    state.contraction_duration_sec = 60 + progress * 30;     // 60s→90s
    state.contraction_intensity = 7 + progress * 3;          // 7→10
  } else if (elapsed < LABOR_PHASE_EARLY + LABOR_PHASE_ACTIVE + LABOR_PHASE_TRANSITION + LABOR_PHASE_PUSHING) {
    state.labor_phase = 'pushing';
    const pushed = elapsed - LABOR_PHASE_EARLY - LABOR_PHASE_ACTIVE - LABOR_PHASE_TRANSITION;
    if (pushed > LABOR_PHASE_PUSHING * 0.7 && !state.baby_delivered) {
      state.baby_delivered = true;
      state.baby_exists = true;
      state.baby_birth_tick = tickCount;
      state.baby_age_months = 0;
      log('C4', '🎉 宝宝出生！');
      logBabyEvent('birth', '宝宝诞生');
    }
  } else if (!state.placenta_delivered) {
    state.labor_phase = 'placenta';
    const placentaElapsed = elapsed - LABOR_PHASE_EARLY - LABOR_PHASE_ACTIVE - LABOR_PHASE_TRANSITION - LABOR_PHASE_PUSHING;
    if (placentaElapsed > LABOR_PHASE_PLACENTA * 0.5 && !state.placenta_delivered) {
      state.placenta_delivered = true;
      log('C4', '胎盘娩出 分娩完成');
    }
  }

  // 分娩完成→进入产后期
  if (state.baby_delivered && state.placenta_delivered) {
    state.is_in_labor = false;
    state.is_postpartum = true;
    state.postpartum_start_tick = tickCount;
    state.lochia_volume = 100;
    state.uterine_involution_pct = 60;
    state.perineal_healing = 20;
    state.maternal_fatigue = 90;
    state.is_pregnant = false;
    log('C4', '进入产后期');
  }
}

// ============================================================
// 产后tick
// ============================================================

function tickPostpartum(dtSeconds: number): void {
  const elapsed = tickCount - state.postpartum_start_tick;

  // 子宫复旧
  state.uterine_involution_pct = clamp(60 + (elapsed / POSTPARTUM_FULL) * 40, 0, 100);

  // 恶露衰减
  state.lochia_volume = clamp(100 * Math.exp(-elapsed / (POSTPARTUM_EARLY * 0.3)), 0, 100);

  // 会阴愈合
  state.perineal_healing = clamp(20 + (elapsed / POSTPARTUM_EARLY) * 80, 0, 100);

  // 盆底恢复
  state.pelvic_floor_recovery = clamp(30 + (elapsed / POSTPARTUM_FULL) * 70, 0, 100);

  // 哺乳
  if (state.breastfeeding) {
    // 乳汁供应随吸吮需求波动
    const babyAgeTicks = tickCount - state.baby_birth_tick;
    const demandFactor = Math.sin(babyAgeTicks / 10800 * Math.PI) * 0.3 + 0.7; // 3小时节律
    state.milk_supply_ml = clamp(state.milk_supply_ml + demandFactor * 0.5 * dtSeconds, 0, 1000);
  }

  // 母体疲劳恢复
  state.maternal_fatigue = clamp(state.maternal_fatigue - 0.01 * dtSeconds, 10, 100);

  // 产后6周基本恢复
  if (elapsed >= POSTPARTUM_EARLY && state.maternal_fatigue < 30) {
    state.is_postpartum = false;
    log('C4', '产后6周 身体基本恢复');
  }
}

// ============================================================
// 婴儿tick (0-12月)
// ============================================================

let lastBabyDayCheck = -1;

function tickInfant(dtSeconds: number): void {
  const ageTicks = tickCount - state.baby_birth_tick;
  state.baby_age_months = ageTicks / (30 * 86400);

  const dayCheck = Math.floor(ageTicks / 86400);
  if (dayCheck !== lastBabyDayCheck) {
    state.diapers_changed_today = 0;
    state.feeds_today = 0;
    lastBabyDayCheck = dayCheck;
  }

  // 饥饿增长（新生儿2-3小时饿）
  const hungerRate = state.baby_age_months < 1 ? 0.15 :
    state.baby_age_months < 4 ? 0.1 : 0.07;
  state.baby_hunger = clamp(state.baby_hunger + hungerRate * dtSeconds, 0, 100);

  // 疲倦增长
  state.baby_tiredness = clamp(state.baby_tiredness + 0.02 * dtSeconds, 0, 100);

  // 舒适度变化（湿尿布→下降）
  if (state.diapers_changed_today < state.feeds_today) {
    state.baby_comfort = clamp(state.baby_comfort - 0.03 * dtSeconds, 0, 100);
  }

  // 情绪判定
  if (state.baby_hunger > 70 || state.baby_tiredness > 80 || state.baby_comfort < 20) {
    state.baby_mood = 'crying';
  } else if (state.baby_hunger > 40 || state.baby_tiredness > 50) {
    state.baby_mood = 'fussy';
  } else {
    state.baby_mood = state.baby_sleeping ? 'content' : 'happy';
  }

  // 睡眠自然周期
  const cycleHour = (ageTicks / 3600) % 3;
  if (cycleHour < 0.5) {
    if (!state.baby_sleeping && state.baby_tiredness > 60) {
      state.baby_sleeping = true;
    }
  } else if (cycleHour > 2 && state.baby_sleeping) {
    state.baby_sleeping = false;
  }

  // 成长
  state.baby_weight_grams = 3200 + state.baby_age_months * 600;
  state.baby_height_cm = 50 + state.baby_age_months * 2.5;

  // 发育里程碑
  for (const [month, key, desc] of INFANT_MILESTONES) {
    if (state.baby_age_months >= month && !state.baby_milestones_hit.includes(key)) {
      state.baby_milestones_hit.push(key);
      logBabyEvent('milestone', desc);
      log('C4', `🍼 婴儿里程碑: ${desc}`);
    }
  }
}

// ============================================================
// 儿童tick (1-18岁)
// ============================================================

let lastChildYearCheck = -1;

function tickChild(dtSeconds: number): void {
  const ageTicks = tickCount - state.baby_birth_tick;
  state.child_age_years = Math.floor(ageTicks / (365 * 86400));
  state.baby_age_months = state.child_age_years * 12;

  // 阶段判定
  if (state.child_age_years < 2) state.child_mode = 'toddler';
  else if (state.child_age_years < 6) state.child_mode = 'preschool';
  else if (state.child_age_years < 13) state.child_mode = 'school';
  else state.child_mode = 'teen';

  // 独立性增长
  if (state.child_age_years > lastChildYearCheck) {
    state.child_independence = clamp(state.child_independence + 3, 0, 100);
    // 学业能力
    if (state.child_age_years >= 6) {
      state.child_school_performance = clamp(state.child_school_performance + (Math.random() * 10 - 3), 20, 100);
    }
    // 社交能力
    state.child_social_skills = clamp(state.child_social_skills + (Math.random() * 6 - 1), 10, 100);
    // 情绪调节
    state.child_emotional_regulation = clamp(state.child_emotional_regulation + (Math.random() * 5 - 0.5), 10, 100);
    // 青春期叛逆
    if (state.child_age_years >= 13) {
      state.child_rebellion_level = clamp(state.child_rebellion_level + 5, 0, 100);
      state.child_identity_exploration = clamp(state.child_identity_exploration + 8, 0, 100);
    }
    lastChildYearCheck = state.child_age_years;
  }

  // 婴儿参数不再更新（1岁以后）
  if (state.child_age_years >= 1) {
    state.baby_hunger = 0;
    state.baby_mood = 'independent';
    state.baby_sleeping = false;
  }
}

// ============================================================
// 行为接口
// ============================================================

/** 开始怀孕 */
export function startPregnancy(conceptionTick?: number): void {
  if (state.is_pregnant) return;
  state.is_pregnant = true;
  state.pregnancy_start_tick = conceptionTick ?? tickCount;
  state.pregnancy_due_tick = state.pregnancy_start_tick + PREGNANCY_DURATION_TICKS;
  state.trimester = 1;
  state.fetus_health = 100;
  log('C4', `怀孕开始 (预计${Math.floor(PREGNANCY_DURATION_TICKS / 86400)}天后分娩)`);
}

/** 开始分娩 */
function startLabor(): void {
  state.is_in_labor = true;
  state.labor_start_tick = tickCount;
  state.labor_phase = 'early';
  state.cervical_dilation_cm = 0;
  state.contraction_intensity = 1;
  log('C4', '分娩开始——潜伏期');
}

/** 人工触发分娩 */
export function triggerLabor(): void {
  if (!state.is_pregnant) return;
  state.is_pregnant = false;
  startLabor();
}

/** 开始哺乳 */
export function startBreastfeeding(): void {
  state.breastfeeding = true;
  state.milk_supply_ml = 30;
  log('C4', '开始哺乳');
}

/** 喂养婴儿 */
export function feedBaby(amountMl: number): void {
  if (!state.baby_exists) return;
  state.baby_hunger = clamp(state.baby_hunger - 30, 0, 100);
  state.feeds_today++;
  state.baby_comfort = clamp(state.baby_comfort + 10, 0, 100);
  if (state.baby_mood === 'crying') state.baby_mood = 'fussy';
  else if (state.baby_mood === 'fussy') state.baby_mood = 'content';
  logBabyEvent('feed', `${amountMl}ml`);
}

/** 换尿布 */
export function changeDiaper(): void {
  if (!state.baby_exists) return;
  state.diapers_changed_today++;
  state.baby_comfort = clamp(state.baby_comfort + 20, 0, 100);
  logBabyEvent('diaper', '换尿布');
}

/** 哄睡婴儿 */
export function sootheBabyToSleep(): void {
  if (!state.baby_exists) return;
  state.baby_sleeping = true;
  state.baby_tiredness = clamp(state.baby_tiredness - 30, 0, 100);
  state.baby_comfort = clamp(state.baby_comfort + 15, 0, 100);
  state.baby_mood = 'content';
  logBabyEvent('sleep', '哄睡成功');
}

function logBabyEvent(type: string, detail: string): void {
  getDb().prepare(`
    INSERT INTO baby_event_log (tick, event_type, detail)
    VALUES (?, ?, ?)
  `).run(tickCount, type, detail);
}

// ============================================================
// 持久化
// ============================================================

function saveState(): void {
  getDb().prepare(`
    UPDATE parenting_state SET
      is_pregnant = ?, pregnancy_start_tick = ?, trimester = ?,
      fetus_health = ?, fetus_weight_grams = ?,
      is_in_labor = ?, labor_phase = ?, cervical_dilation_cm = ?,
      baby_delivered = ?, placenta_delivered = ?,
      is_postpartum = ?, uterine_involution_pct = ?,
      breastfeeding = ?, milk_supply_ml = ?,
      baby_exists = ?, baby_birth_tick = ?, baby_age_months = ?,
      baby_weight_grams = ?, baby_height_cm = ?,
      baby_hunger = ?, baby_mood = ?, baby_sleeping = ?, baby_health = ?,
      child_age_years = ?, child_independence = ?,
      child_school_performance = ?, child_social_skills = ?,
      updated_at = datetime('now','localtime')
    WHERE id = 1
  `).run(
    state.is_pregnant ? 1 : 0, state.pregnancy_start_tick, state.trimester,
    state.fetus_health, state.fetus_weight_grams,
    state.is_in_labor ? 1 : 0, state.labor_phase, state.cervical_dilation_cm,
    state.baby_delivered ? 1 : 0, state.placenta_delivered ? 1 : 0,
    state.is_postpartum ? 1 : 0, state.uterine_involution_pct,
    state.breastfeeding ? 1 : 0, state.milk_supply_ml,
    state.baby_exists ? 1 : 0, state.baby_birth_tick, state.baby_age_months,
    state.baby_weight_grams, state.baby_height_cm,
    state.baby_hunger, state.baby_mood, state.baby_sleeping ? 1 : 0, state.baby_health,
    state.child_age_years, state.child_independence,
    state.child_school_performance, state.child_social_skills,
  );
}

// ============================================================
// 快照接口
// ============================================================

export function getParentingSnapshot(): object {
  return {
    pregnancy: state.is_pregnant ? {
      trimester: state.trimester,
      weeks_elapsed: Math.floor((tickCount - state.pregnancy_start_tick) / (7 * 86400)),
      weeks_remaining: Math.floor((state.pregnancy_due_tick - tickCount) / (7 * 86400)),
      symptoms: state.pregnancy_symptoms,
      fetus: {
        health: state.fetus_health,
        weight_grams: state.fetus_weight_grams.toFixed(0),
        length_cm: state.fetus_length_cm.toFixed(1),
      },
    } : null,
    labor: state.is_in_labor ? {
      phase: state.labor_phase,
      dilation_cm: state.cervical_dilation_cm.toFixed(1),
      contraction: {
        frequency_sec: state.contraction_frequency_sec.toFixed(0),
        duration_sec: state.contraction_duration_sec.toFixed(0),
        intensity: state.contraction_intensity.toFixed(1),
      },
      baby_delivered: state.baby_delivered,
    } : null,
    postpartum: state.is_postpartum ? {
      days_elapsed: Math.floor((tickCount - state.postpartum_start_tick) / 86400),
      uterine_involution: state.uterine_involution_pct.toFixed(0),
      perineal_healing: state.perineal_healing.toFixed(0),
      breastfeeding: state.breastfeeding,
      milk_supply_ml: state.milk_supply_ml.toFixed(0),
      maternal_fatigue: state.maternal_fatigue.toFixed(0),
    } : null,
    baby: state.baby_exists ? {
      age_months: state.baby_age_months.toFixed(1),
      age_years: state.child_age_years,
      weight_grams: state.baby_weight_grams.toFixed(0),
      height_cm: state.baby_height_cm.toFixed(0),
      hunger: state.baby_hunger.toFixed(0),
      mood: state.baby_mood,
      sleeping: state.baby_sleeping,
      health: state.baby_health.toFixed(0),
      feeds_today: state.feeds_today,
      diapers_today: state.diapers_changed_today,
      milestones: state.baby_milestones_hit,
      development: {
        independence: state.child_independence,
        school: state.child_school_performance,
        social: state.child_social_skills,
        emotional_regulation: state.child_emotional_regulation,
        rebellion: state.child_rebellion_level,
        identity: state.child_identity_exploration,
      },
    } : null,
  };
}
