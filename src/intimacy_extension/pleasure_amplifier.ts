/**
 * 双向愉悦感知闭环放大器
 * 
 * 核心理念：两人的愉悦不仅是独立的生理反应，
 * 还通过多模态反馈相互放大——视觉、听觉、触觉、嗅觉、情感。
 * 这构成一个正反馈闭环，驱动性唤起加速攀升。
 * 
 * 输入：她/他各自当前的生理状态
 * 输出：双向增益系数，叠加回各自的唤起/快感/高潮累积
 */
import { clamp } from '../common/utils';
import type { FemaleOrganState, MaleOrganState } from './sexual_organ_physiology';

// ============================================================
// 多模态反馈通道
// ============================================================

export interface MultimodalFeedback {
  /** 视觉反馈强度 0-1（她看到他的兴奋表情/身体反应） */
  visual_her: number;
  visual_him: number;
  /** 听觉反馈强度 0-1（呻吟/呼吸/低语） */
  auditory_her: number;
  auditory_him: number;
  /** 触觉反馈强度 0-1（她感到他的硬度/节奏；他感到她的紧致/湿润） */
  tactile_her: number;
  tactile_him: number;
  /** 嗅觉反馈强度 0-1（体味/性气味/信息素） */
  olfactory_her: number;
  olfactory_him: number;
  /** 情感共鸣强度 0-1（伴侣之间），来自oxytocin/cortisol混合 */
  emotional_resonance: number;
}

export interface AmplifierResult {
  /** 她对他的愉悦增益系数（她的快感因为他而被放大） */
  her_gain_from_him: number;
  /** 他对她的愉悦增益系数 */
  his_gain_from_her: number;
  /** 总闭环增益（双方互相放大的净效应） */
  total_loop_gain: number;
  /** 反馈通道分析 */
  channels: MultimodalFeedback;
  /** 当前共振态: cold/neutral/warm/hot/blazing */
  resonance_state: string;
}

// ============================================================
// 感知转换器：把她/他的生理状态转为对方感知到的多模态信号
// ============================================================

export function computeBidirectionalGain(
  female: FemaleOrganState,
  male: MaleOrganState,
  herArousal: number,
  hisArousal: number,
  herVocalIntensity: number,  // 她的呻吟音量 0-100
  hisVocalIntensity: number,  // 他的喘息/低语音量 0-100
  emotionalIntimacy: number,  // 情感亲密基础分 0-100
): AmplifierResult {
  // ===== 视觉通道 =====
  // 她看到他 → 关键信号：阴茎硬度、脸部兴奋表情、肌肉紧张度
  const visualHer = clamp(
    (male.penile.erection_firmness / 100) * 0.5 +    // 视觉硬度
    (hisArousal / 100) * 0.3 +                        // 面部表情
    (male.testicular.cremaster_contraction / 100) * 0.2, // 身体紧张
    0, 1
  );
  // 他看到她的 → 身体曲线、乳房晃动、面部潮红
  const visualHim = clamp(
    (herArousal / 100) * 0.5 +
    (female.vaginal.engorgement / 100) * 0.3 +
    (female.clitoral.glans_engorgement / 100) * 0.2,
    0, 1
  );

  // ===== 听觉通道 =====
  // 她的呻吟 → 增强他的兴奋
  const auditoryHim = clamp(
    (herVocalIntensity / 100) * 0.6 +                 // 直接音量
    (female.vaginal.contraction_rhythm > 0 ? 0.4 : 0), // 节律性
    0, 1
  );
  // 他的呼吸/低语 → 增强她的安全感与被需要感
  const auditoryHer = clamp(
    (hisVocalIntensity / 100) * 0.5 +
    (emotionalIntimacy / 100) * 0.5,
    0, 1
  );

  // ===== 触觉通道 =====
  // 他感受到她的触觉：紧致度 + 润滑度 + 温度
  const tightness = clamp(1 - female.vaginal.width_cm / 5, 0.2, 1);
  const tactileHim = clamp(
    tightness * 0.5 +
    (female.vaginal.lubrication / 100) * 0.3 +
    (female.vaginal.contraction_rhythm > 0.4 ? 0.2 : 0),
    0, 1
  );
  // 她感受到他的触觉：硬度 + 温度 + 龟头形状
  const tactileHer = clamp(
    (male.penile.erection_firmness / 100) * 0.5 +
    (male.penile.engorgement / 100) * 0.3 +
    ((37 - Math.abs(37 - male.testicular.temperature_c)) / 5) * 0.2,
    0, 1
  );

  // ===== 嗅觉通道 =====
  // 性气味浓度与双方唤起度正相关
  const olfactoryHim = clamp(
    (female.overall_lubrication / 100) * 0.5 +
    (herArousal / 100) * 0.3 +
    0.2, // 天然体味基线
    0, 1
  );
  const olfactoryHer = clamp(
    (male.testicular.testosterone_level / 100) * 0.4 +
    (hisArousal / 100) * 0.3 +
    0.2,
    0, 1
  );

  // ===== 情感共鸣 =====
  // 双方越同步，共鸣越强。受情感亲密基础值调制。
  const arousalGap = Math.abs(herArousal - hisArousal) / 100;
  const synchrony = clamp(1 - arousalGap, 0, 1);
  const emotionalResonance = clamp(
    synchrony * (emotionalIntimacy / 100) * 0.8 + 0.2,
    0, 1
  );

  // ===== 增益系数计算 =====
  // 各通道加权求和 → 对方的愉悦放大系数

  // 她从他获得的增益
  const herChannelSum =
    visualHer * 0.20 +
    auditoryHer * 0.25 +
    tactileHer * 0.25 +
    olfactoryHer * 0.10 +
    emotionalResonance * 0.20;

  // 他从她获得的增益
  const hisChannelSum =
    visualHim * 0.25 +
    auditoryHim * 0.20 +
    tactileHim * 0.25 +
    olfactoryHim * 0.10 +
    emotionalResonance * 0.20;

  // 增益映射：归一化 → 实际放大倍数（1.0=无放大，2.0=最大放大）
  // 使用sigmoid使增益在中间范围敏感
  const herGain = 1 + herChannelSum * 1.2;
  const hisGain = 1 + hisChannelSum * 1.2;

  // 总闭环增益（双方增益的乘积 → 体现正反馈迭代效应）
  const totalLoopGain = herGain * hisGain;

  // ===== 共振态判定 =====
  const resonance_state = totalLoopGain < 1.3 ? 'cold' :
    totalLoopGain < 1.8 ? 'neutral' :
    totalLoopGain < 2.5 ? 'warm' :
    totalLoopGain < 3.5 ? 'hot' : 'blazing';

  return {
    her_gain_from_him: Math.round(herGain * 100) / 100,
    his_gain_from_her: Math.round(hisGain * 100) / 100,
    total_loop_gain: Math.round(totalLoopGain * 100) / 100,
    channels: {
      visual_her: Math.round(visualHer * 100) / 100,
      visual_him: Math.round(visualHim * 100) / 100,
      auditory_her: Math.round(auditoryHer * 100) / 100,
      auditory_him: Math.round(auditoryHim * 100) / 100,
      tactile_her: Math.round(tactileHer * 100) / 100,
      tactile_him: Math.round(tactileHim * 100) / 100,
      olfactory_her: Math.round(olfactoryHer * 100) / 100,
      olfactory_him: Math.round(olfactoryHim * 100) / 100,
      emotional_resonance: Math.round(emotionalResonance * 100) / 100,
    },
    resonance_state,
  };
}

// ============================================================
// 增益应用：把放大器输出叠加到生理模块
// ============================================================

export interface GainApplication {
  /** 她的唤起度增量（乘以原始刺激） */
  her_arousal_multiplier: number;
  /** 他的唤起度增量 */
  his_arousal_multiplier: number;
  /** 她的高潮累积加速 */
  her_orgasm_acceleration: number;
  /** 他的高潮累积加速 */
  his_orgasm_acceleration: number;
}

/**
 * 将双向增益应用到双方的实时状态
 * 调用时机：每次 applyIntercourseStimulus 之后
 */
export function applyGainToPhysiology(
  ampResult: AmplifierResult,
  herOrgasmPhase: string,
  hisOrgasmPhase: string,
): GainApplication {
  // 增益因子转换为生理乘数
  const herMult = ampResult.her_gain_from_him;
  const hisMult = ampResult.his_gain_from_her;

  // 高潮累积加速：共振越强，接近高潮时加速越大
  const herOrgasmBoost = herOrgasmPhase === 'plateau' ? (herMult - 1) * 1.5 : (herMult - 1);
  const hisOrgasmBoost = hisOrgasmPhase === 'plateau' ? (hisMult - 1) * 1.5 : (hisMult - 1);

  return {
    her_arousal_multiplier: Math.round(herMult * 100) / 100,
    his_arousal_multiplier: Math.round(hisMult * 100) / 100,
    her_orgasm_acceleration: Math.round(herOrgasmBoost * 100) / 100,
    his_orgasm_acceleration: Math.round(hisOrgasmBoost * 100) / 100,
  };
}

// ============================================================
// 反馈闭环模拟器 — 完整的性交过程一步
// ============================================================

export interface ClosedLoopStep {
  /** 本次步骤序号 */
  step: number;
  /** 男性当前生理快照 */
  male_snapshot: any;
  /** 女性当前生理快照 */
  female_snapshot: any;
  /** 放大器输出 */
  amplifier: AmplifierResult;
  /** 增益应用 */
  gain_applied: GainApplication;
  /** 感知到的双方高潮距离 */
  orgasm_proximity: {
    her_pct: number;
    his_pct: number;
    who_closer: string;
  };
}

/**
 * 执行一步完整的闭环模拟：
 * 1. 取双方当前生理状态
 * 2. 计算双向增益
 * 3. 把增益叠加回下次刺激计算的乘数
 * 
 * @returns 闭环步骤结果和下次刺激应使用的乘数
 */
export function executeClosedLoopStep(
  female: FemaleOrganState,
  male: MaleOrganState,
  herArousal: number,
  hisArousal: number,
  herVocal: number,
  hisVocal: number,
  emotionalIntimacy: number,
  stepNumber: number,
): ClosedLoopStep {
  const amp = computeBidirectionalGain(
    female, male, herArousal, hisArousal,
    herVocal, hisVocal, emotionalIntimacy,
  );

  const gain = applyGainToPhysiology(amp, female.orgasm_phase, male.orgasm_phase);

  // 双方高潮距离
  const herProximity = clamp(
    Math.max(female.clitoral.orgasm_buildup, female.vaginal.nerve_excitation) / 100,
    0, 1
  );
  const hisProximity = clamp(male.penile.ejaculation_buildup / 100, 0, 1);

  return {
    step: stepNumber,
    male_snapshot: {
      erection: Math.round(male.penile.erection_firmness),
      nerve: Math.round(male.penile.nerve_excitation),
      buildup: Math.round(male.penile.ejaculation_buildup),
    },
    female_snapshot: {
      clitoral: Math.round(female.clitoral.nerve_excitation),
      vaginal: Math.round(female.vaginal.nerve_excitation),
      lubrication: Math.round(female.overall_lubrication),
      orgasm_buildup: Math.round(female.clitoral.orgasm_buildup),
    },
    amplifier: amp,
    gain_applied: gain,
    orgasm_proximity: {
      her_pct: Math.round(herProximity * 100),
      his_pct: Math.round(hisProximity * 100),
      who_closer: herProximity > hisProximity ? 'her' : hisProximity > herProximity ? 'him' : 'equal',
    },
  };
}
