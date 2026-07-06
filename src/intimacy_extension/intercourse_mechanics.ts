/**
 * 性交力学模拟 — 两体物理交互引擎
 * 
 * 将男女两套性器官状态作为输入，计算以下物理量：
 * - 穿透深度（厘米级）
 * - 阴道壁接触压力（随深度/直径/弹性变化）
 * - 摩擦热/剪切力
 * - 抽插周期相位与速度曲线
 * - 体位几何：深度可及性、G点对齐角、阴蒂可触达性
 */
import { clamp } from '../common/utils';
import type {
  FemaleOrganState,
  MaleOrganState,
  IntercourseStimulus,
} from './sexual_organ_physiology';

// ============================================================
// 体位定义
// ============================================================

export type PositionId =
  | 'missionary'     // 传教士：面对面，男上女下
  | 'cowgirl'        // 女上位：女上男下
  | 'doggy'          // 后入式
  | 'spoon'          // 侧入式
  | 'standing'       // 站立式
  | 'lotus';         // 莲花式：面对面坐式

export interface PositionGeometry {
  /** 最大可及深度 cm */
  max_depth_cm: number;
  /** 最小深度 cm */
  min_depth_cm: number;
  /** G点对齐角度（0=完美对齐，90=完全错位） */
  gspot_align_deg: number;
  /** 阴蒂可触达性（体位是否便于手/体位刺激阴蒂）0-1 */
  clitoral_accessibility: number;
  /** 宫颈接触概率（深度插入时）0-1 */
  cervix_reach_prob: number;
  /** 女性盆底倾斜角 */
  pelvic_tilt_deg: number;
  /** 阴茎进入角度（0=垂直阴道，30=斜入） */
  entry_angle_deg: number;
}

const POSITION_GEOMETRIES: Record<PositionId, PositionGeometry> = {
  missionary: {
    max_depth_cm: 14, min_depth_cm: 5, gspot_align_deg: 25,
    clitoral_accessibility: 0.6, cervix_reach_prob: 0.7,
    pelvic_tilt_deg: 10, entry_angle_deg: 0,
  },
  cowgirl: {
    max_depth_cm: 13, min_depth_cm: 6, gspot_align_deg: 10,
    clitoral_accessibility: 0.9, cervix_reach_prob: 0.6,
    pelvic_tilt_deg: 5, entry_angle_deg: 5,
  },
  doggy: {
    max_depth_cm: 15, min_depth_cm: 6, gspot_align_deg: 35,
    clitoral_accessibility: 0.5, cervix_reach_prob: 0.85,
    pelvic_tilt_deg: -15, entry_angle_deg: 15,
  },
  spoon: {
    max_depth_cm: 10, min_depth_cm: 4, gspot_align_deg: 45,
    clitoral_accessibility: 0.7, cervix_reach_prob: 0.3,
    pelvic_tilt_deg: 20, entry_angle_deg: 25,
  },
  standing: {
    max_depth_cm: 12, min_depth_cm: 5, gspot_align_deg: 30,
    clitoral_accessibility: 0.4, cervix_reach_prob: 0.55,
    pelvic_tilt_deg: 0, entry_angle_deg: 10,
  },
  lotus: {
    max_depth_cm: 11, min_depth_cm: 3, gspot_align_deg: 5,
    clitoral_accessibility: 0.85, cervix_reach_prob: 0.45,
    pelvic_tilt_deg: 15, entry_angle_deg: 5,
  },
};

// ============================================================
// 抽插周期相位模型
// ============================================================

export interface ThrustCycle {
  /** 当前相位 0-1 (0=完全退出，0.5=最深，1=完全退出) */
  phase: number;
  /** 频率 Hz */
  frequency_hz: number;
  /** 行程 cm */
  stroke_length_cm: number;
  /** 当前深度 cm */
  current_depth_cm: number;
  /** 当前速度 cm/s */
  current_speed_cm_s: number;
  /** 是否在加速阶段 */
  accelerating: boolean;
}

/**
 * 推进抽插周期一个时间步
 */
export function advanceThrustCycle(
  cycle: ThrustCycle,
  dtSeconds: number,
  frequency_hz?: number,
  stroke_length_cm?: number,
): ThrustCycle {
  const freq = frequency_hz ?? cycle.frequency_hz;
  const stroke = stroke_length_cm ?? cycle.stroke_length_cm;
  const effectiveFreq = clamp(freq, 0.3, 4);
  const effectiveStroke = clamp(stroke, 1, 15);

  // 正弦波相位推进
  const phaseDelta = dtSeconds * effectiveFreq;
  const newPhase = (cycle.phase + phaseDelta) % 1;

  // 深度 = min + 振幅 * sin²(π·phase)  (模拟更真实的停顿感)
  const sinVal = Math.sin(Math.PI * newPhase);
  const depthRatio = sinVal * sinVal; // sin²: 0→1→0，在两端停顿更自然
  const depthMin = 2; // 不完全退出
  const depth = depthMin + effectiveStroke * depthRatio;

  // 速度 = 深度对时间的导数 = effectiveStroke * 2 * sin(π·phase) * cos(π·phase) * π * effectiveFreq
  const speed = effectiveStroke * Math.abs(Math.sin(2 * Math.PI * newPhase)) * Math.PI * effectiveFreq;

  // 加速阶段：速度在上升就是加速
  const prevSpeed = cycle.current_speed_cm_s;
  const accelerating = speed > prevSpeed;

  return {
    phase: newPhase,
    frequency_hz: effectiveFreq,
    stroke_length_cm: effectiveStroke,
    current_depth_cm: Math.round(depth * 10) / 10,
    current_speed_cm_s: Math.round(speed * 10) / 10,
    accelerating,
  };
}

// ============================================================
// 力学计算
// ============================================================

export interface MechanicsResult {
  /** 穿透深度（约束后） */
  penetration_depth_cm: number;
  /** 阴道壁法向压力 kPa */
  wall_pressure_kpa: number;
  /** 摩擦热 W/m² */
  friction_heat_wm2: number;
  /** 剪切力 N */
  shear_force_n: number;
  /** G点接触压力 0-1 */
  gspot_pressure: number;
  /** 宫颈接触压力 0-1 */
  cervix_pressure: number;
  /** 阴蒂刺激度 0-1（体位×动作同步刺激） */
  clitoral_stimulus: number;
  /** 阴道扩张度 %（实际/静息） */
  vaginal_distension_pct: number;
  /** 接触总面积 cm² */
  contact_area_cm2: number;
  /** 刺激向量（可直接传给性器官模块） */
  stimulus: IntercourseStimulus;
}

/**
 * 计算单帧力学
 */
export function computeMechanics(
  position: PositionId,
  cycle: ThrustCycle,
  female: FemaleOrganState,
  male: MaleOrganState,
): MechanicsResult {
  const geo = POSITION_GEOMETRIES[position];

  // 1. 穿透深度约束
  // 男性有效长度 = 疲软 + (勃起 - 疲软) * 硬度
  const maleEffectiveLength = male.penile.flaccid_length_cm +
    (male.penile.erect_length_cm - male.penile.flaccid_length_cm) *
    (male.penile.erection_firmness / 100);

  // 女性可容深度 = 当前阴道长度（已含唤起延展）
  const femaleCapacity = female.vaginal.length_cm;

  // 体位深度 = min(体位max, 男性有效, 女性可容) × 相位
  const rawDepth = Math.min(geo.max_depth_cm, maleEffectiveLength, femaleCapacity);
  const penetrationDepth = clamp(cycle.current_depth_cm * (rawDepth / (geo.min_depth_cm + cycle.stroke_length_cm)), 1, rawDepth);

  // 2. 阴道壁压力 (接触压力 ∝ 阴茎直径 × 阴道弹性 × 当前宽度)
  const maleDiameter = male.penile.erect_girth_cm / Math.PI;
  const vaginalDiameter = clamp(female.vaginal.width_cm, 1.5, 6);
  const stretchRatio = maleDiameter / vaginalDiameter;
  // 压力 = 弹性系数 × (拉伸比 - 1) × 基准压力 50kPa
  const basePressure = clamp((stretchRatio - 1) * 50 * female.vaginal.elasticity, 0, 200);
  // 随深度衰减：越深越紧（漏斗形）
  const depthRatio = Math.min(penetrationDepth / 10, 1);
  const wallPressure = basePressure * (0.7 + depthRatio * 0.3);

  // 3. 摩擦热 (与速度、压力、摩擦系数成正比)
  const frictionCoeff = 0.04 - female.vaginal.lubrication * 0.00035; // 润滑→摩擦↓
  const frictionHeat = cycle.current_speed_cm_s * wallPressure * frictionCoeff * 0.01;

  // 4. 剪切力 (与压力×接触面积×摩擦系数成正比)
  const contactArea = Math.PI * maleDiameter * penetrationDepth * 0.3; // 有效接触面积
  const shearForce = frictionHeat * contactArea * 0.01;

  // 5. G点压力 (前壁刺激 = 阴茎对阴道前壁的压力 × 体位对齐)
  const gspotAlignment = Math.cos((geo.gspot_align_deg * Math.PI) / 180);
  const gspotDepthHit = penetrationDepth > 3 && penetrationDepth < 8; // G点距口3-5cm
  const gspotPressure = clamp(
    gspotDepthHit
      ? thrustForce(cycle) * gspotAlignment * female.vaginal.gspot_sensitivity / 100
      : 0,
    0, 1
  );

  // 6. 宫颈压力 (深插时)
  const cervixDepthHit = penetrationDepth > female.uterine.cervix_position_cm - 1;
  const cervixPressure = clamp(
    cervixDepthHit && geo.cervix_reach_prob > 0.4
      ? thrustForce(cycle) * geo.cervix_reach_prob * 0.8
      : 0,
    0, 1
  );

  // 7. 阴蒂刺激 (体位可达性 × 动作幅度间接刺激)
  const clitoralStimulus = clamp(
    geo.clitoral_accessibility * thrustForce(cycle) * 0.4,
    0, 1
  );

  // 8. 构建刺激向量
  const stimulus: IntercourseStimulus = {
    penetration_depth_cm: Math.round(penetrationDepth * 10) / 10,
    thrust_speed_cm_s: cycle.current_speed_cm_s,
    thrust_force: thrustForce(cycle),
    contact_type: depthRatio > 0.8 ? 'grind' : 'thrust',
    clitoral_stimulus: Math.round(clitoralStimulus * 100) / 100,
    gspot_pressure: Math.round(gspotPressure * 100) / 100,
    cervix_pressure: Math.round(cervixPressure * 100) / 100,
  };

  return {
    penetration_depth_cm: Math.round(penetrationDepth * 10) / 10,
    wall_pressure_kpa: Math.round(wallPressure * 10) / 10,
    friction_heat_wm2: Math.round(frictionHeat * 100) / 100,
    shear_force_n: Math.round(shearForce * 100) / 100,
    gspot_pressure: Math.round(gspotPressure * 100) / 100,
    cervix_pressure: Math.round(cervixPressure * 100) / 100,
    clitoral_stimulus: Math.round(clitoralStimulus * 100) / 100,
    vaginal_distension_pct: Math.round(stretchRatio * 100),
    contact_area_cm2: Math.round(contactArea * 10) / 10,
    stimulus,
  };
}

// ============================================================
// 抽插力度计算
// ============================================================

export function thrustForce(cycle: ThrustCycle): number {
  // 力度 = 速度归一化 × 行程占比 × 加速加成
  const speedNorm = clamp(cycle.current_speed_cm_s / 30, 0.1, 1);
  const strokeRatio = cycle.stroke_length_cm / 10;
  const accelBonus = cycle.accelerating ? 1.2 : 0.8;
  return clamp(speedNorm * strokeRatio * accelBonus, 0.05, 1);
}

// ============================================================
// 高潮同步度
// ============================================================

export interface OrgasmSynchrony {
  /** 同步度 0-1（1=同时高潮） */
  synchrony: number;
  /** 谁更快: her/him/together */
  who_first: string;
  /** 时间差（秒） */
  time_diff_sec: number;
  /** 相互强化系数 */
  mutual_amplification: number;
}

export function computeOrgasmSynchrony(
  herBuildup: number,
  hisBuildup: number,
): OrgasmSynchrony {
  const herPct = herBuildup / 100;
  const hisPct = hisBuildup / 100;
  const gap = Math.abs(herPct - hisPct);

  // 差距越小同步度越高
  const synchrony = clamp(1 - gap, 0, 1);

  // 接近同步时相互强化
  const mutualAmplification = synchrony > 0.7 ? 1 + (synchrony - 0.7) * 2 : 1;

  return {
    synchrony: Math.round(synchrony * 100) / 100,
    who_first: herPct > hisPct ? 'her' : hisPct > herPct ? 'him' : 'together',
    time_diff_sec: Math.round(gap * 60), // 粗略估算秒数
    mutual_amplification: Math.round(mutualAmplification * 100) / 100,
  };
}

// ============================================================
// 体位推荐
// ============================================================

export interface PositionRecommendation {
  position: PositionId;
  score: number;
  reason: string;
}

export function recommendPosition(
  female: FemaleOrganState,
  male: MaleOrganState,
  preferences?: { preferDepth?: boolean; preferClitoral?: boolean; preferGspot?: boolean },
): PositionRecommendation[] {
  const pref = preferences ?? {};

  return (Object.entries(POSITION_GEOMETRIES) as [PositionId, PositionGeometry][])
    .map(([pos, geo]) => {
      let score = 0;
      const reasons: string[] = [];

      // 深度偏好
      if (pref.preferDepth) {
        score += geo.max_depth_cm / 15 * 30;
        reasons.push('深插');
      }
      // 阴蒂刺激偏好
      if (pref.preferClitoral) {
        score += geo.clitoral_accessibility * 30;
        reasons.push('阴蒂可触');
      }
      // G点偏好
      if (pref.preferGspot) {
        score += (1 - geo.gspot_align_deg / 90) * 30;
        reasons.push('G点对齐');
      }
      // 默认综合评分
      if (!pref.preferDepth && !pref.preferClitoral && !pref.preferGspot) {
        score += (15 - Math.abs(geo.max_depth_cm - 12)) * 2;
        score += geo.clitoral_accessibility * 20;
        score += (1 - geo.gspot_align_deg / 90) * 20;
      }

      return { position: pos, score: Math.round(score), reason: reasons.join('+') || '综合' };
    })
    .sort((a, b) => b.score - a.score);
}
