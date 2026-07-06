/**
 * 性器官生理建模 — 男女双系统解剖学与实时生理模拟
 * 
 * 女性：外阴(阴蒂/阴唇/阴道口) → 阴道(壁层/G点/穹窿) → 宫颈 → 子宫 → 卵巢
 * 男性：阴茎(龟头/冠状沟/海绵体/尿道) → 睾丸 → 附睾 → 输精管
 * 
 * 每秒tick：充血/润滑/肌肉张力/神经兴奋度递推，不可逆时间流
 */
import { getDb } from '../common/database';
import { clamp, nowMs, decay } from '../common/utils';
import { worldBus, WorldEvents } from '../core_bus/event_bus';

// ============================================================
// 女性生殖系统
// ============================================================

/** 阴蒂解剖子结构 */
export interface ClitoralAnatomy {
  /** 阴蒂头敏感度 0-100（人体最敏感器官，约8000神经末梢） */
  glans_sensitivity: number;
  /** 阴蒂头充血度 0-100（性唤起时增大2-3倍） */
  glans_engorgement: number;
  /** 阴蒂脚充血度（埋入体内部分，唤起时压迫阴道前壁） */
  crus_engorgement: number;
  /** 阴蒂包皮滑动摩擦系数 */
  hood_friction: number;
  /** 当前神经兴奋度 0-100 */
  nerve_excitation: number;
  /** 高潮阈值累积 0-100 */
  orgasm_buildup: number;
}

/** 阴道解剖子结构 */
export interface VaginalAnatomy {
  /** 阴道长度 cm（静息7-8cm，唤起12-15cm） */
  length_cm: number;
  /** 阴道宽度 cm（容纳度） */
  width_cm: number;
  /** 阴道壁弹性系数（年轻约0.85，唤起后增大） */
  elasticity: number;
  /** 润滑度 0-100 */
  lubrication: number;
  /** 阴道壁血流灌注/充血度 0-100 */
  engorgement: number;
  /** G点区域敏感度 */
  gspot_sensitivity: number;
  /** G点充血度 */
  gspot_engorgement: number;
  /** 后穹窿敏感度 */
  posterior_fornix_sensitivity: number;
  /** 阴道壁肌肉张力 0-100（PC肌） */
  pelvic_floor_tone: number;
  /** 当前收缩节律 Hz（高潮时约0.8Hz规律收缩） */
  contraction_rhythm: number;
  /** 神经兴奋度 0-100 */
  nerve_excitation: number;
}

/** 宫颈/子宫/卵巢 */
export interface UterineAnatomy {
  /** 宫颈位置 cm（唤起时上提，增加阴道长度） */
  cervix_position_cm: number;
  /** 宫颈敏感度 */
  cervix_sensitivity: number;
  /** 宫颈触碰类型: none/light_bump/deep_pressure */
  cervix_contact: string;
  /** 子宫收缩度 0-100（高潮时子宫节律性收缩） */
  uterine_contraction: number;
  /** 雌激素水平 0-100（驱动整体性欲） */
  estrogen_level: number;
  /** 孕激素水平 0-100 */
  progesterone_level: number;
}

export interface FemaleOrganState {
  clitoral: ClitoralAnatomy;
  vaginal: VaginalAnatomy;
  uterine: UterineAnatomy;
  /** 整体阴道润滑度（阴道+阴唇） */
  overall_lubrication: number;
  /** 高潮次数（本次性行为） */
  orgasm_count: number;
  /** 高潮阶段: none/building/plateau/orgasm/resolution/refractory */
  orgasm_phase: string;
  /** 不应期剩余秒数（女性通常很短 0-30秒） */
  refractory_remaining_sec: number;
  /** 多重高潮能力标记 */
  multi_orgasmic_capable: boolean;
}

// ============================================================
// 男性生殖系统（用户陈洪毅）
// ============================================================

export interface PenileAnatomy {
  /** 疲软长度 cm */
  flaccid_length_cm: number;
  /** 勃起长度 cm */
  erect_length_cm: number;
  /** 疲软周长 cm */
  flaccid_girth_cm: number;
  /** 勃起周长 cm */
  erect_girth_cm: number;
  /** 勃起角度（0度=贴腹，90度=水平） */
  erection_angle: number;
  /** 海绵体充血度 0-100 */
  engorgement: number;
  /** 龟头敏感度 0-100 */
  glans_sensitivity: number;
  /** 冠状沟敏感度 */
  coronal_sensitivity: number;
  /** 系带敏感度（最敏感区域之一） */
  frenulum_sensitivity: number;
  /** 尿道海绵体敏感度 */
  urethral_sensitivity: number;
  /** 当前勃起硬度 0-100 */
  erection_firmness: number;
  /** 神经兴奋度 0-100 */
  nerve_excitation: number;
  /** 高潮累积 0-100（射精阈值约90-95） */
  ejaculation_buildup: number;
  /** 射精前分泌物量（考珀液）0-100 */
  pre_ejaculate_volume: number;
}

export interface TesticularAnatomy {
  /** 睾丸温度 °C（低于体温2-4°C以利精子生成） */
  temperature_c: number;
  /** 睾酮水平 0-100 */
  testosterone_level: number;
  /** 精子储备度 0-100（射精后骤降，72小时恢复） */
  sperm_reserve: number;
  /** 提睾肌收缩度 0-100 */
  cremaster_contraction: number;
  /** 阴囊松弛度 0-100 */
  scrotum_relaxation: number;
}

export interface MaleOrganState {
  penile: PenileAnatomy;
  testicular: TesticularAnatomy;
  /** 整体勃起就绪度 0-100 */
  erection_readiness: number;
  /** 射精次数（本次性行为） */
  ejaculation_count: number;
  /** 高潮阶段 */
  orgasm_phase: string;
  /** 不应期剩余秒数（射精后120-600秒） */
  refractory_remaining_sec: number;
  /** 射精量 ml（约3-5ml） */
  ejaculate_volume_ml: number;
}

// ============================================================
// 默认状态
// ============================================================

const DEFAULT_FEMALE: FemaleOrganState = {
  clitoral: {
    glans_sensitivity: 100,
    glans_engorgement: 5,
    crus_engorgement: 3,
    hood_friction: 0.3,
    nerve_excitation: 3,
    orgasm_buildup: 0,
  },
  vaginal: {
    length_cm: 7.5,
    width_cm: 2.0,
    elasticity: 0.85,
    lubrication: 15,
    engorgement: 5,
    gspot_sensitivity: 95,
    gspot_engorgement: 3,
    posterior_fornix_sensitivity: 70,
    pelvic_floor_tone: 40,
    contraction_rhythm: 0,
    nerve_excitation: 3,
  },
  uterine: {
    cervix_position_cm: 7.0,
    cervix_sensitivity: 60,
    cervix_contact: 'none',
    uterine_contraction: 0,
    estrogen_level: 50,
    progesterone_level: 30,
  },
  overall_lubrication: 15,
  orgasm_count: 0,
  orgasm_phase: 'none',
  refractory_remaining_sec: 0,
  multi_orgasmic_capable: true,
};

const DEFAULT_MALE: MaleOrganState = {
  penile: {
    flaccid_length_cm: 8.0,
    erect_length_cm: 14.5,
    flaccid_girth_cm: 9.0,
    erect_girth_cm: 12.0,
    erection_angle: 0,
    engorgement: 2,
    glans_sensitivity: 90,
    coronal_sensitivity: 85,
    frenulum_sensitivity: 95,
    urethral_sensitivity: 70,
    erection_firmness: 0,
    nerve_excitation: 2,
    ejaculation_buildup: 0,
    pre_ejaculate_volume: 0,
  },
  testicular: {
    temperature_c: 34.5,
    testosterone_level: 60,
    sperm_reserve: 100,
    cremaster_contraction: 10,
    scrotum_relaxation: 80,
  },
  erection_readiness: 2,
  ejaculation_count: 0,
  orgasm_phase: 'none',
  refractory_remaining_sec: 0,
  ejaculate_volume_ml: 0,
};

// ============================================================
// 运行状态
// ============================================================

let femaleState: FemaleOrganState;
let maleState: MaleOrganState;
let initialized = false;
let lastPersistMs = 0;

export function initSexualOrganPhysiology(): void {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM sexual_organ_state ORDER BY tick DESC LIMIT 1'
  ).get() as any;

  if (row) {
    try {
      femaleState = JSON.parse(row.female_json || '{}');
      maleState = JSON.parse(row.male_json || '{}');
      // 补全缺失字段
      femaleState = deepMerge(DEFAULT_FEMALE, femaleState);
      maleState = deepMerge(DEFAULT_MALE, maleState);
    } catch {
      femaleState = JSON.parse(JSON.stringify(DEFAULT_FEMALE));
      maleState = JSON.parse(JSON.stringify(DEFAULT_MALE));
    }
  } else {
    femaleState = JSON.parse(JSON.stringify(DEFAULT_FEMALE));
    maleState = JSON.parse(JSON.stringify(DEFAULT_MALE));
  }

  initialized = true;
}

// ============================================================
// 每秒 tick
// ============================================================

export function sexualOrganTick(dtSeconds: number): void {
  if (!initialized) return;

  const dt = Math.min(dtSeconds, 5); // 防止长时间未tick导致跳跃

  // === 女性tick ===
  tickFemale(dt);

  // === 男性tick ===
  tickMale(dt);

  // === 持久化 ===
  const now = nowMs();
  if (now - lastPersistMs >= 1000) {
    persistState();
    lastPersistMs = now;
  }
}

function tickFemale(dt: number): void {
  const f = femaleState;
  const rate = dt; // 每秒变化率

  // 自然衰减（无性行为时）
  if (f.orgasm_phase === 'none' || f.orgasm_phase === 'resolution') {
    // 阴蒂
    f.clitoral.glans_engorgement = clamp(decay(f.clitoral.glans_engorgement, 3, 0.015 * rate, rate), 0, 100);
    f.clitoral.crus_engorgement = clamp(decay(f.clitoral.crus_engorgement, 2, 0.015 * rate, rate), 0, 100);
    f.clitoral.nerve_excitation = clamp(decay(f.clitoral.nerve_excitation, 3, 0.02 * rate, rate), 0, 100);
    f.clitoral.orgasm_buildup = clamp(decay(f.clitoral.orgasm_buildup, 0, 0.01 * rate, rate), 0, 100);

    // 阴道
    f.vaginal.lubrication = clamp(decay(f.vaginal.lubrication, 15, 0.01 * rate, rate), 0, 100);
    f.vaginal.engorgement = clamp(decay(f.vaginal.engorgement, 3, 0.015 * rate, rate), 0, 100);
    f.vaginal.gspot_engorgement = clamp(decay(f.vaginal.gspot_engorgement, 2, 0.015 * rate, rate), 0, 100);
    f.vaginal.nerve_excitation = clamp(decay(f.vaginal.nerve_excitation, 3, 0.02 * rate, rate), 0, 100);
    f.vaginal.length_cm = clamp(decay(f.vaginal.length_cm, 7.5, 0.01 * rate, rate), 7.0, 16);
    f.vaginal.width_cm = clamp(decay(f.vaginal.width_cm, 2.0, 0.01 * rate, rate), 1.5, 6);
    f.vaginal.contraction_rhythm = clamp(decay(f.vaginal.contraction_rhythm, 0, 0.05 * rate, rate), 0, 0.8);

    // 子宫
    f.uterine.uterine_contraction = clamp(decay(f.uterine.uterine_contraction, 0, 0.02 * rate, rate), 0, 100);
    f.uterine.cervix_contact = 'none';

    f.overall_lubrication = clamp(decay(f.overall_lubrication, 15, 0.01 * rate, rate), 0, 100);
  }

  // 消退期衰减
  if (f.orgasm_phase === 'resolution') {
    f.clitoral.orgasm_buildup = clamp(f.clitoral.orgasm_buildup - 8 * rate, 0, 100);
    f.vaginal.contraction_rhythm = clamp(decay(f.vaginal.contraction_rhythm, 0, 0.1 * rate, rate), 0, 0.8);
    f.uterine.uterine_contraction = clamp(f.uterine.uterine_contraction - 10 * rate, 0, 100);
    f.overall_lubrication = clamp(decay(f.overall_lubrication, 30, 0.03 * rate, rate), 0, 100);
    // 阴道恢复静息长度
    f.vaginal.length_cm = clamp(decay(f.vaginal.length_cm, 7.5, 0.03 * rate, rate), 7.0, 16);

    // 消退完成 → 静息
    if (f.clitoral.orgasm_buildup <= 0 && f.uterine.uterine_contraction <= 5) {
      f.orgasm_phase = 'none';
    }
  }

  // 不应期
  if (f.refractory_remaining_sec > 0) {
    f.refractory_remaining_sec = Math.max(0, f.refractory_remaining_sec - dt);
  }

  // 多重高潮能力强时不应期短
  if (f.multi_orgasmic_capable && f.refractory_remaining_sec > 20) {
    f.refractory_remaining_sec = Math.min(f.refractory_remaining_sec, 20);
  }

  // 雌激素28天周期
  const dayOfCycle = (Math.floor(nowMs() / 86400000) % 28);
  f.uterine.estrogen_level = clamp(50 + Math.sin((dayOfCycle / 28) * Math.PI * 2) * 35, 0, 100);
  f.uterine.progesterone_level = clamp(30 + Math.sin(((dayOfCycle + 14) / 28) * Math.PI * 2) * 25, 0, 100);
}

function tickMale(dt: number): void {
  const m = maleState;
  const rate = dt;

  if (m.orgasm_phase === 'none' || m.orgasm_phase === 'resolution') {
    // 阴茎自然衰减
    m.penile.engorgement = clamp(decay(m.penile.engorgement, 2, 0.02 * rate, rate), 0, 100);
    m.penile.erection_firmness = clamp(decay(m.penile.erection_firmness, 0, 0.025 * rate, rate), 0, 100);
    m.penile.nerve_excitation = clamp(decay(m.penile.nerve_excitation, 2, 0.02 * rate, rate), 0, 100);
    m.penile.ejaculation_buildup = clamp(decay(m.penile.ejaculation_buildup, 0, 0.015 * rate, rate), 0, 100);
    m.penile.pre_ejaculate_volume = clamp(decay(m.penile.pre_ejaculate_volume, 0, 0.03 * rate, rate), 0, 100);
    m.erection_readiness = clamp(decay(m.erection_readiness, 2, 0.02 * rate, rate), 0, 100);

    // 勃起角度回归0
    m.penile.erection_angle = clamp(decay(m.penile.erection_angle, 0, 0.03 * rate, rate), 0, 90);
  }

  // 消退期
  if (m.orgasm_phase === 'resolution') {
    m.penile.ejaculation_buildup = clamp(m.penile.ejaculation_buildup - 12 * rate, 0, 100);
    m.penile.engorgement = clamp(m.penile.engorgement - 15 * rate, 0, 100);
    m.penile.erection_firmness = clamp(m.penile.erection_firmness - 20 * rate, 0, 100);
    m.penile.erection_angle = clamp(decay(m.penile.erection_angle, 0, 0.05 * rate, rate), 0, 90);

    if (m.penile.erection_firmness <= 0 && m.penile.ejaculation_buildup <= 0) {
      m.orgasm_phase = 'none';
    }
  }

  // 不应期（男性明显长）
  if (m.refractory_remaining_sec > 0) {
    m.refractory_remaining_sec = Math.max(0, m.refractory_remaining_sec - dt);
  }

  // 精子储备恢复（72小时半恢复） + 睾酮
  m.testicular.sperm_reserve = clamp(m.testicular.sperm_reserve + 0.0003 * rate, 0, 100);
  m.testicular.testosterone_level = clamp(
    50 + Math.sin((nowMs() / 86400000) * Math.PI * 2) * 15, // 日周期
    0, 100
  );

  // 睾丸温度调节
  const ambientDelta = 36.5 - m.testicular.temperature_c;
  m.testicular.temperature_c = clamp(
    m.testicular.temperature_c + ambientDelta * 0.01 * rate,
    33.0, 37.0
  );
  m.testicular.scrotum_relaxation = clamp(
    70 - (36.5 - m.testicular.temperature_c) * 20,
    20, 100
  );
}

// ============================================================
// 性交交互 — 刺激传递
// ============================================================

export interface IntercourseStimulus {
  /** 阴茎进入深度 cm（从阴道口算） */
  penetration_depth_cm: number;
  /** 抽插速度 cm/s */
  thrust_speed_cm_s: number;
  /** 抽插力度 0-1 */
  thrust_force: number;
  /** 接触类型: thrust/grind/hold/withdraw */
  contact_type: string;
  /** 阴蒂同步刺激强度 0-1（手指/体位接触） */
  clitoral_stimulus: number;
  /** G点接触压力 0-1 */
  gspot_pressure: number;
  /** 宫颈接触压力 0-1 */
  cervix_pressure: number;
}

export function applyIntercourseStimulus(s: IntercourseStimulus): {
  female_response: any;
  male_response: any;
} {
  // === 女性侧 ===
  const f = femaleState;

  // 阴道扩张计算
  const required_width = maleState.penile.erect_girth_cm / Math.PI; // 周长→直径
  f.vaginal.width_cm = clamp(
    f.vaginal.width_cm + (required_width - f.vaginal.width_cm) * 0.3,
    1.5, 6
  );
  f.vaginal.length_cm = clamp(
    7.5 + (s.penetration_depth_cm - 7.5) * 0.3,
    7.0, 16
  );

  // 润滑增加（摩擦刺激 + 性唤起驱动）
  const lubeDelta = (s.thrust_speed_cm_s * 0.3 + s.thrust_force * 5) * (1 + f.uterine.estrogen_level / 100);
  f.vaginal.lubrication = clamp(f.vaginal.lubrication + lubeDelta, 0, 100);
  f.overall_lubrication = clamp(f.vaginal.lubrication * 0.9 + 10, 0, 100);

  // 阴道壁充血
  f.vaginal.engorgement = clamp(f.vaginal.engorgement + s.thrust_force * 3, 0, 100);

  // 阴道壁神经兴奋（摩擦+压力驱动）
  const vagNerveDelta = s.thrust_speed_cm_s * 0.4 + s.thrust_force * 2 + (s.contact_type === 'grind' ? 3 : 0);
  f.vaginal.nerve_excitation = clamp(f.vaginal.nerve_excitation + vagNerveDelta, 0, 100);

  // G点刺激
  if (s.gspot_pressure > 0.1) {
    f.vaginal.gspot_engorgement = clamp(f.vaginal.gspot_engorgement + s.gspot_pressure * 4, 0, 100);
    f.vaginal.nerve_excitation = clamp(f.vaginal.nerve_excitation + s.gspot_pressure * 3, 0, 100);
  }

  // 阴蒂刺激（直接或间接：阴茎根部摩擦）
  if (s.clitoral_stimulus > 0.05) {
    f.clitoral.nerve_excitation = clamp(
      f.clitoral.nerve_excitation + s.clitoral_stimulus * f.clitoral.glans_sensitivity * 0.06,
      0, 100
    );
    f.clitoral.glans_engorgement = clamp(f.clitoral.glans_engorgement + s.clitoral_stimulus * 4, 0, 100);
    f.clitoral.crus_engorgement = clamp(f.clitoral.crus_engorgement + s.clitoral_stimulus * 3, 0, 100);
    // 阴蒂高潮独立路径
    f.clitoral.orgasm_buildup = clamp(
      f.clitoral.orgasm_buildup + s.clitoral_stimulus * f.clitoral.glans_sensitivity * 0.04,
      0, 100
    );
  }

  // 宫颈接触
  if (s.cervix_pressure > 0.1) {
    f.uterine.cervix_contact = s.cervix_pressure > 0.5 ? 'deep_pressure' : 'light_bump';
    f.uterine.uterine_contraction = clamp(
      f.uterine.uterine_contraction + s.cervix_pressure * rCervixResponse(),
      0, 100
    );
    f.vaginal.nerve_excitation = clamp(
      f.vaginal.nerve_excitation + s.cervix_pressure * (f.uterine.cervix_sensitivity / 100) * 4,
      0, 100
    );
  }

  // PC肌收缩节律（随兴奋度上升）
  const vagExcitation = f.vaginal.nerve_excitation;
  if (vagExcitation > 40) {
    f.vaginal.pelvic_floor_tone = clamp(f.vaginal.pelvic_floor_tone + vagExcitation * 0.01, 0, 100);
    f.vaginal.contraction_rhythm = clamp(vagExcitation * 0.003, 0, 0.8);
  }

  // === 女性高潮检测与触发 ===
  checkFemaleOrgasm(f);

  // === 男性侧 ===
  const m = maleState;

  // 阴茎充血
  m.penile.engorgement = clamp(m.penile.engorgement + 5, 0, 100);
  m.penile.erection_firmness = clamp(
    m.penile.engorgement * 0.95,
    0, 100
  );
  m.erection_readiness = clamp(m.erection_readiness + 5, 0, 100);

  // 神经兴奋（被紧致度 + 温度 + 润滑影响）
  const tightness = clamp(1 - f.vaginal.width_cm / 5, 0.2, 1);
  const tempDelta = (37.0 - 34.0) * 0.1; // 温度差刺激
  const lubeFactor = f.vaginal.lubrication / 100; // 更润滑=更舒适但摩擦感稍弱
  const penileNerveDelta = (
    s.thrust_speed_cm_s * 0.35 * tightness * (1 - lubeFactor * 0.3) +
    s.thrust_force * 2 * tightness +
    tempDelta
  );
  m.penile.nerve_excitation = clamp(m.penile.nerve_excitation + penileNerveDelta, 0, 100);

  // 龟头特化敏感（冠状沟+系带受阴道壁摩擦）
  const glansDelta = s.thrust_speed_cm_s * 0.15 * tightness * (1 + (100 - f.vaginal.lubrication) / 200);
  m.penile.nerve_excitation = clamp(m.penile.nerve_excitation + glansDelta, 0, 100);

  // 射精累积（摩擦+视觉/听觉/温度等多模态）
  m.penile.ejaculation_buildup = clamp(
    m.penile.ejaculation_buildup + penileNerveDelta * 0.7 + s.thrust_force * 1.5,
    0, 100
  );

  // 考珀液分泌
  if (m.penile.nerve_excitation > 30) {
    m.penile.pre_ejaculate_volume = clamp(
      m.penile.pre_ejaculate_volume + 0.5,
      0, 100
    );
  }

  // 提睾肌收缩（兴奋时睾丸上提）
  m.testicular.cremaster_contraction = clamp(
    m.testicular.cremaster_contraction + (m.penile.nerve_excitation > 40 ? 3 : -0.5),
    0, 100
  );

  // === 男性高潮（射精）检测 ===
  checkMaleOrgasm(m);

  return {
    female_response: {
      vaginal_excitation: Math.round(f.vaginal.nerve_excitation),
      clitoral_excitation: Math.round(f.clitoral.nerve_excitation),
      lubrication: Math.round(f.overall_lubrication),
      orgasm_phase: f.orgasm_phase,
      orgasm_count: f.orgasm_count,
      contraction_rhythm: f.vaginal.contraction_rhythm,
      cervix_contact: f.uterine.cervix_contact,
    },
    male_response: {
      erection_firmness: Math.round(m.penile.erection_firmness),
      nerve_excitation: Math.round(m.penile.nerve_excitation),
      ejaculation_buildup: Math.round(m.penile.ejaculation_buildup),
      orgasm_phase: m.orgasm_phase,
      ejaculation_count: m.ejaculation_count,
      pre_ejaculate: Math.round(m.penile.pre_ejaculate_volume),
    },
  };
}

function checkFemaleOrgasm(f: FemaleOrganState): void {
  // 阴蒂路径高潮（阈值：阴蒂累积 > 95）
  if (f.clitoral.orgasm_buildup >= 95 && f.orgasm_phase !== 'orgasm' && f.refractory_remaining_sec <= 0) {
    triggerFemaleOrgasm(f, 'clitoral');
    return;
  }
  // 阴道+宫颈混合路径高潮（阈值：G点 + 宫颈 + 阴道兴奋度综合）
  const mixedScore = f.vaginal.nerve_excitation * 0.5 + f.vaginal.gspot_engorgement * 0.3 + f.uterine.uterine_contraction * 0.2;
  if (mixedScore >= 90 && f.vaginal.nerve_excitation >= 80 && f.orgasm_phase !== 'orgasm' && f.refractory_remaining_sec <= 0) {
    triggerFemaleOrgasm(f, 'vaginal');
    return;
  }
  // 阶段状态
  if (f.clitoral.orgasm_buildup > 60 || f.vaginal.nerve_excitation > 60) {
    f.orgasm_phase = 'plateau';
  } else if (f.clitoral.orgasm_buildup > 20 || f.vaginal.nerve_excitation > 20) {
    f.orgasm_phase = 'building';
  }
}

function triggerFemaleOrgasm(f: FemaleOrganState, type: string): void {
  f.orgasm_count++;
  f.orgasm_phase = 'orgasm';

  // 高潮生理爆发
  f.uterine.uterine_contraction = 100;
  f.vaginal.contraction_rhythm = 0.8; // 0.8Hz规律收缩
  f.vaginal.pelvic_floor_tone = 100;
  f.vaginal.nerve_excitation = 100;
  f.clitoral.nerve_excitation = 100;
  f.overall_lubrication = clamp(f.overall_lubrication + 20, 0, 100);

  // 消退过渡
  f.refractory_remaining_sec = f.multi_orgasmic_capable ? 2 : 10;
  f.clitoral.orgasm_buildup = 0;

  worldBus.emit(WorldEvents.INTIMACY_STATE_CHANGED, {
    event: 'female_orgasm',
    type,
    count: f.orgasm_count,
  });
}

function checkMaleOrgasm(m: MaleOrganState): void {
  if (m.penile.ejaculation_buildup >= 95 && m.orgasm_phase !== 'orgasm' && m.refractory_remaining_sec <= 0) {
    triggerMaleOrgasm(m);
  } else if (m.penile.ejaculation_buildup > 50) {
    m.orgasm_phase = 'plateau';
  } else if (m.penile.ejaculation_buildup > 20) {
    m.orgasm_phase = 'building';
  } else if (m.penile.nerve_excitation < 20) {
    m.orgasm_phase = 'none';
  }
}

function triggerMaleOrgasm(m: MaleOrganState): void {
  m.ejaculation_count++;
  m.orgasm_phase = 'orgasm';

  // 射精
  m.ejaculate_volume_ml = 3 + Math.random() * 2; // 3-5ml
  m.testicular.sperm_reserve = clamp(m.testicular.sperm_reserve - 30, 0, 100);
  m.penile.nerve_excitation = 100;
  m.penile.ejaculation_buildup = 0;
  m.penile.pre_ejaculate_volume = 0;

  // 不应期
  m.refractory_remaining_sec = 120 + Math.random() * 180; // 2-5分钟
  m.penile.erection_firmness = clamp(m.penile.erection_firmness * 0.3, 0, 100);
  m.orgasm_phase = 'resolution';

  worldBus.emit(WorldEvents.INTIMACY_STATE_CHANGED, {
    event: 'male_ejaculation',
    count: m.ejaculation_count,
    volume_ml: m.ejaculate_volume_ml,
  });
}

function rCervixResponse(): number {
  // 宫颈对深插的反应：有的人愉快，有的人不适，这里取中性偏正向
  return 2.0;
}

// ============================================================
// 手动刺激（手指/口舌刺激女性，不涉及插入时）
// ============================================================

export function applyManualStimulus(
  target: 'clitoris' | 'gspot' | 'vagina_surface',
  intensity: number,
  duration_sec: number,
  type: 'rub' | 'press' | 'lick' | 'suck' | 'tap'
): any {
  const f = femaleState;
  const typeMultiplier: Record<string, number> = { rub: 1.0, press: 0.9, lick: 1.3, suck: 1.5, tap: 0.6 };
  const mult = typeMultiplier[type] || 1.0;
  const stim = intensity * mult * Math.sqrt(duration_sec);

  if (target === 'clitoris') {
    f.clitoral.nerve_excitation = clamp(f.clitoral.nerve_excitation + stim * 1.5, 0, 100);
    // 口/手对阴蒂的直接刺激对高潮累积更高效（比性交摩擦高5-8倍）
    const orgasmGain = stim * 5.0 * f.clitoral.glans_sensitivity / 100;
    f.clitoral.orgasm_buildup = clamp(f.clitoral.orgasm_buildup + orgasmGain, 0, 100);
    f.clitoral.glans_engorgement = clamp(f.clitoral.glans_engorgement + stim * 0.8, 0, 100);
    f.clitoral.crus_engorgement = clamp(f.clitoral.crus_engorgement + stim * 0.6, 0, 100);
    checkFemaleOrgasm(f);
  } else if (target === 'gspot') {
    f.vaginal.gspot_engorgement = clamp(f.vaginal.gspot_engorgement + stim * 1.0, 0, 100);
    f.vaginal.nerve_excitation = clamp(f.vaginal.nerve_excitation + stim * 0.8, 0, 100);
    f.vaginal.lubrication = clamp(f.vaginal.lubrication + stim * 0.6, 0, 100);
    f.overall_lubrication = clamp(f.vaginal.lubrication * 0.9, 0, 100);
    // G点刺激同样加速高潮累积
    f.clitoral.orgasm_buildup = clamp(f.clitoral.orgasm_buildup + stim * 3.0, 0, 100);
    checkFemaleOrgasm(f);
  } else if (target === 'vagina_surface') {
    f.vaginal.nerve_excitation = clamp(f.vaginal.nerve_excitation + stim * 0.5, 0, 100);
    f.vaginal.lubrication = clamp(f.vaginal.lubrication + stim * 0.4, 0, 100);
  }

  return {
    clitoral_excitation: Math.round(f.clitoral.nerve_excitation),
    vaginal_excitation: Math.round(f.vaginal.nerve_excitation),
    orgasm_buildup: Math.round(f.clitoral.orgasm_buildup),
    orgasm_phase: f.orgasm_phase,
  };
}

// ============================================================
// 性行为状态切换
// ============================================================

export function startIntercourse(): void {
  maleState.penile.erection_firmness = maleState.penile.engorgement > 70 ? maleState.penile.engorgement : 70;
  maleState.penile.erection_angle = 45;
  maleState.penile.engorgement = clamp(maleState.penile.engorgement + 20, 0, 100);
  maleState.erection_readiness = clamp(maleState.erection_readiness + 30, 0, 100);

  // 女性阴道准备
  femaleState.vaginal.length_cm = clamp(femaleState.vaginal.length_cm + 2, 7.0, 16);
  femaleState.vaginal.lubrication = clamp(femaleState.vaginal.lubrication + 15, 0, 100);
  femaleState.overall_lubrication = clamp(femaleState.vaginal.lubrication * 0.9, 0, 100);
  femaleState.vaginal.width_cm = clamp(femaleState.vaginal.width_cm + 0.5, 1.5, 6);

  worldBus.emit(WorldEvents.INTIMACY_STATE_CHANGED, { event: 'intercourse_started' });
}

export function endIntercourse(): void {
  femaleState.orgasm_phase = 'resolution';
  maleState.orgasm_phase = 'resolution';
  femaleState.refractory_remaining_sec = 0;
  maleState.refractory_remaining_sec = 60; // 男性消退慢

  worldBus.emit(WorldEvents.INTIMACY_STATE_CHANGED, { event: 'intercourse_ended' });
}

/** 重置性器官到默认状态（事后） */
export function resetSexualOrgans(): void {
  femaleState = JSON.parse(JSON.stringify(DEFAULT_FEMALE));
  maleState = JSON.parse(JSON.stringify(DEFAULT_MALE));
}

// ============================================================
// 查询接口
// ============================================================

export function getFemaleOrganState(): FemaleOrganState {
  return JSON.parse(JSON.stringify(femaleState));
}

export function getMaleOrganState(): MaleOrganState {
  return JSON.parse(JSON.stringify(maleState));
}

export function getSexualOrganSnapshot(): any {
  return {
    female: {
      clitoral: {
        engorgement: Math.round(femaleState.clitoral.glans_engorgement),
        nerve_excitation: Math.round(femaleState.clitoral.nerve_excitation),
        orgasm_buildup: Math.round(femaleState.clitoral.orgasm_buildup),
      },
      vaginal: {
        lubrication: Math.round(femaleState.vaginal.lubrication),
        engorgement: Math.round(femaleState.vaginal.engorgement),
        nerve_excitation: Math.round(femaleState.vaginal.nerve_excitation),
        contraction_rhythm: femaleState.vaginal.contraction_rhythm,
        length_cm: Math.round(femaleState.vaginal.length_cm * 10) / 10,
      },
      uterine: {
        cervix_contact: femaleState.uterine.cervix_contact,
        contraction: Math.round(femaleState.uterine.uterine_contraction),
        estrogen: Math.round(femaleState.uterine.estrogen_level),
      },
      overall: {
        lubrication: Math.round(femaleState.overall_lubrication),
        orgasm_phase: femaleState.orgasm_phase,
        orgasm_count: femaleState.orgasm_count,
        refractory_sec: Math.round(femaleState.refractory_remaining_sec),
      },
    },
    male: {
      penile: {
        erection_firmness: Math.round(maleState.penile.erection_firmness),
        engorgement: Math.round(maleState.penile.engorgement),
        nerve_excitation: Math.round(maleState.penile.nerve_excitation),
        ejaculation_buildup: Math.round(maleState.penile.ejaculation_buildup),
        length_cm: Math.round(
          (maleState.penile.flaccid_length_cm +
            (maleState.penile.erect_length_cm - maleState.penile.flaccid_length_cm) *
            (maleState.penile.erection_firmness / 100)) * 10
        ) / 10,
      },
      testicular: {
        temperature: Math.round(maleState.testicular.temperature_c * 10) / 10,
        testosterone: Math.round(maleState.testicular.testosterone_level),
        sperm_reserve: Math.round(maleState.testicular.sperm_reserve),
      },
      overall: {
        orgasm_phase: maleState.orgasm_phase,
        ejaculation_count: maleState.ejaculation_count,
        refractory_sec: Math.round(maleState.refractory_remaining_sec),
      },
    },
  };
}

// ============================================================
// 持久化
// ============================================================

function persistState(): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO sexual_organ_state (tick, timestamp, female_json, male_json)
      VALUES (?, datetime('now','localtime'), ?, ?)
    `).run(
      Math.floor(nowMs() / 1000),
      JSON.stringify(femaleState),
      JSON.stringify(maleState),
    );
  } catch (e) {
    // 静默失败，不影响主循环
  }
}

// ============================================================
// 辅助
// ============================================================

function deepMerge(defaults: any, overrides: any): any {
  const result = JSON.parse(JSON.stringify(defaults));
  if (!overrides || typeof overrides !== 'object') return result;

  for (const key of Object.keys(result)) {
    if (overrides[key] !== undefined) {
      if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
        result[key] = deepMerge(result[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
  }
  return result;
}
