/**
 * 亲密感知引擎 — 八层仿生模型
 * 
 * 层1: 生理层 — 24部位 × 8属性，高潮生理链
 * 层2: 化学层 — 递质模拟，28天雌激素周期
 * 层3: 触觉层 — 10种触觉 × 物理参数 × 情感映射
 * 层4: 嗅觉层 — 体味/香水/环境/性气味
 * 层5: 听觉层 — 呼吸/喘息/呻吟/低语/心跳
 * 层6: 语言层 — 8类语言 × 情绪上下文
 * 层7: 行为层 — 五阶段状态机
 * 层8: 伴侣偏好学习 — 持续进化
 */
import { getDb } from '../../common/database';
import { clamp, nowMs, decay, lerp } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 层1: 生理层 — 身体部位建模
// ============================================================

/** 身体部位定义 */
interface BodyPart {
  id: string;
  name: string;
  /** 敏感度 0-100 */
  sensitivity: number;
  /** 性感度（性唤起时的敏感度倍增系数）0-100 */
  erogenous_level: number;
  /** 当前触觉状态: idle/touching/stroking/pressing/kissing/entering */
  touch_state: string;
  /** 当前温度感 (°C) */
  temperature: number;
  /** 湿润度 0-100 */
  wetness: number;
  /** 充血度 0-100（性唤起时血液充盈） */
  engorgement: number;
  /** 肌肉紧张度 0-100 */
  muscle_tension: number;
  /** 神经兴奋度 0-100 */
  nerve_excitation: number;
}

/** 24个身体部位 */
const BODY_PARTS: BodyPart[] = [
  { id: 'lips', name: '嘴唇', sensitivity: 80, erogenous_level: 85, touch_state: 'idle', temperature: 36.2, wetness: 60, engorgement: 5, muscle_tension: 10, nerve_excitation: 5 },
  { id: 'neck', name: '脖颈', sensitivity: 75, erogenous_level: 80, touch_state: 'idle', temperature: 36.0, wetness: 30, engorgement: 0, muscle_tension: 15, nerve_excitation: 3 },
  { id: 'ears', name: '耳朵', sensitivity: 70, erogenous_level: 75, touch_state: 'idle', temperature: 35.5, wetness: 10, engorgement: 0, muscle_tension: 5, nerve_excitation: 3 },
  { id: 'chest', name: '胸部', sensitivity: 60, erogenous_level: 70, touch_state: 'idle', temperature: 36.0, wetness: 20, engorgement: 0, muscle_tension: 10, nerve_excitation: 2 },
  { id: 'breasts', name: '乳房', sensitivity: 85, erogenous_level: 90, touch_state: 'idle', temperature: 36.3, wetness: 30, engorgement: 5, muscle_tension: 8, nerve_excitation: 5 },
  { id: 'nipples', name: '乳头', sensitivity: 95, erogenous_level: 95, touch_state: 'idle', temperature: 35.8, wetness: 15, engorgement: 5, muscle_tension: 5, nerve_excitation: 5 },
  { id: 'belly', name: '腹部', sensitivity: 50, erogenous_level: 55, touch_state: 'idle', temperature: 36.2, wetness: 15, engorgement: 0, muscle_tension: 10, nerve_excitation: 2 },
  { id: 'waist', name: '腰部', sensitivity: 55, erogenous_level: 60, touch_state: 'idle', temperature: 36.0, wetness: 15, engorgement: 0, muscle_tension: 12, nerve_excitation: 2 },
  { id: 'lower_back', name: '后腰', sensitivity: 60, erogenous_level: 65, touch_state: 'idle', temperature: 36.0, wetness: 10, engorgement: 0, muscle_tension: 12, nerve_excitation: 2 },
  { id: 'buttocks', name: '臀部', sensitivity: 60, erogenous_level: 70, touch_state: 'idle', temperature: 35.8, wetness: 10, engorgement: 0, muscle_tension: 10, nerve_excitation: 2 },
  { id: 'inner_thigh', name: '大腿内侧', sensitivity: 75, erogenous_level: 80, touch_state: 'idle', temperature: 35.8, wetness: 20, engorgement: 0, muscle_tension: 8, nerve_excitation: 3 },
  { id: 'thighs', name: '大腿', sensitivity: 50, erogenous_level: 55, touch_state: 'idle', temperature: 35.5, wetness: 10, engorgement: 0, muscle_tension: 15, nerve_excitation: 1 },
  { id: 'knees', name: '膝盖', sensitivity: 30, erogenous_level: 25, touch_state: 'idle', temperature: 34.5, wetness: 5, engorgement: 0, muscle_tension: 5, nerve_excitation: 1 },
  { id: 'calves', name: '小腿', sensitivity: 35, erogenous_level: 30, touch_state: 'idle', temperature: 34.0, wetness: 5, engorgement: 0, muscle_tension: 10, nerve_excitation: 1 },
  { id: 'feet', name: '脚', sensitivity: 50, erogenous_level: 40, touch_state: 'idle', temperature: 33.0, wetness: 10, engorgement: 0, muscle_tension: 8, nerve_excitation: 2 },
  { id: 'shoulders', name: '肩膀', sensitivity: 45, erogenous_level: 45, touch_state: 'idle', temperature: 36.0, wetness: 10, engorgement: 0, muscle_tension: 20, nerve_excitation: 1 },
  { id: 'arms', name: '手臂', sensitivity: 40, erogenous_level: 35, touch_state: 'idle', temperature: 35.5, wetness: 5, engorgement: 0, muscle_tension: 10, nerve_excitation: 1 },
  { id: 'hands', name: '手', sensitivity: 60, erogenous_level: 45, touch_state: 'idle', temperature: 34.5, wetness: 10, engorgement: 0, muscle_tension: 8, nerve_excitation: 2 },
  { id: 'fingers', name: '手指', sensitivity: 70, erogenous_level: 40, touch_state: 'idle', temperature: 34.0, wetness: 5, engorgement: 0, muscle_tension: 5, nerve_excitation: 2 },
  { id: 'clitoris', name: '阴蒂', sensitivity: 100, erogenous_level: 100, touch_state: 'idle', temperature: 36.5, wetness: 50, engorgement: 10, muscle_tension: 5, nerve_excitation: 8 },
  { id: 'vagina', name: '阴道', sensitivity: 90, erogenous_level: 95, touch_state: 'idle', temperature: 37.0, wetness: 40, engorgement: 5, muscle_tension: 8, nerve_excitation: 5 },
  { id: 'labia', name: '阴唇', sensitivity: 80, erogenous_level: 85, touch_state: 'idle', temperature: 36.5, wetness: 40, engorgement: 5, muscle_tension: 5, nerve_excitation: 5 },
  { id: 'g_spot', name: 'G点', sensitivity: 95, erogenous_level: 95, touch_state: 'idle', temperature: 37.1, wetness: 50, engorgement: 8, muscle_tension: 5, nerve_excitation: 8 },
  { id: 'cervix', name: '宫颈', sensitivity: 70, erogenous_level: 60, touch_state: 'idle', temperature: 37.2, wetness: 60, engorgement: 3, muscle_tension: 3, nerve_excitation: 3 },
];

// ============================================================
// 层1续: 高潮生理链状态机
// ============================================================
enum OrgasmPhase {
  RESTING = 'resting',       // 静息
  EXCITEMENT = 'excitement', // 兴奋期
  PLATEAU = 'plateau',       // 平台期
  ORGASM = 'orgasm',         // 高潮期
  RESOLUTION = 'resolution', // 消退期
}

// ============================================================
// 层2: 化学层 — 神经递质
// ============================================================
interface ChemistryState {
  /** 多巴胺 0-100: 愉悦/渴望 */
  dopamine: number;
  /** 催产素 0-100: 依恋/信任 */
  oxytocin: number;
  /** 血清素 0-100: 平静/满足 */
  serotonin: number;
  /** 肾上腺素 0-100: 兴奋/紧张 */
  adrenaline: number;
  /** 内啡肽 0-100: 镇痛/欣快 */
  endorphin: number;
  /** 雌激素 0-100: 月经周期驱动 */
  estrogen: number;
}

// ============================================================
// 层3: 触觉层
// ============================================================
type TouchType = 'light_stroke'|'press'|'knead'|'pat'|'kiss'|'lick'|'suck'|'rub'|'wrap'|'enter';

interface TouchEvent {
  type: TouchType;
  target_part_id: string;
  intensity: number;    // 力度 0-1
  speed: number;        // 速度 0-1
  duration_sec: number; // 持续时间
  area: number;         // 接触面积 0-1
}

// ============================================================
// 层4: 嗅觉层
// ============================================================
type SmellType = 'body_scent'|'perfume'|'environment'|'sexual_scent';

interface SmellState {
  type: SmellType;
  intensity: number;    // 浓度 0-100
  emotional_effect: number; // -50到+50
  description: string;
}

// ============================================================
// 层5: 听觉层
// ============================================================
interface AuditoryState {
  breathing_rate: number;     // 呼吸频率
  breathing_depth: string;    // 浅/正常/深/急促
  moan_volume: number;        // 呻吟音量 0-100
  moan_pitch: number;         // 呻吟音高 0-100
  whisper_content: string;    // 低语内容
  heartbeat_rate: number;     // 心率
  heartbeat_intensity: number;// 心跳强度 0-100
}

// ============================================================
// 层6: 语言层
// ============================================================
type LanguageCategory = 'pet_name'|'coquetry'|'love_words'|'request'|'feedback'|'praise'|'shy_words'|'aftercare';

interface LanguageOutput {
  category: LanguageCategory;
  content: string;
  emotional_weight: number; // 0-100
  context_phase: string;
}

// ============================================================
// 层7: 行为层 — 五阶段状态机
// ============================================================
enum IntimacyPhase {
  IDLE = 'idle',               // 日常
  ATMOSPHERE = 'atmosphere',   // 氛围营造
  FOREPLAY = 'foreplay',       // 前戏
  INTERCOURSE = 'intercourse', // 性交
  ORGASM_PHASE = 'orgasm_phase', // 高潮
  AFTERCARE = 'aftercare',     // 事后温存
}

// ============================================================
// 层8: 伴侣偏好学习
// ============================================================
interface PartnerPreferences {
  touch_pattern: Map<string, number>;      // 触摸类型偏好
  rhythm_pattern: Map<string, number>;     // 节奏偏好
  language_pattern: Map<string, number>;   // 语言偏好
  context_pattern: Map<string, number>;    // 情境偏好
  learned_sequences: string[];             // 学习到的行为序列
}

// ============================================================
// 亲密引擎主状态
// ============================================================
let currentPhase: IntimacyPhase = IntimacyPhase.IDLE;
let orgasmPhase: OrgasmPhase = OrgasmPhase.RESTING;
let arousalLevel = 0;         // 整体唤起度 0-100
let orgasmBuildUp = 0;       // 高潮累积 0-100
let orgasmCount = 0;         // 高潮次数（本次）
let pleasureIntensity = 0;   // 当前快感强度 0-100
let chemistryState: ChemistryState;
let bodyParts: BodyPart[];
let partnerPrefs: PartnerPreferences;
let touchHistory: TouchEvent[] = [];
let lastInteractionMs = 0;

// 初始化
function resetState(): void {
  currentPhase = IntimacyPhase.IDLE;
  orgasmPhase = OrgasmPhase.RESTING;
  arousalLevel = 5;
  orgasmBuildUp = 0;
  orgasmCount = 0;
  pleasureIntensity = 0;
  chemistryState = {
    dopamine: 20, oxytocin: 15, serotonin: 30,
    adrenaline: 5, endorphin: 10, estrogen: 50,
  };
  bodyParts = JSON.parse(JSON.stringify(BODY_PARTS));
  partnerPrefs = {
    touch_pattern: new Map(),
    rhythm_pattern: new Map(),
    language_pattern: new Map(),
    context_pattern: new Map(),
    learned_sequences: [],
  };
  touchHistory = [];
  lastInteractionMs = 0;
}

resetState();

// ============================================================
// 外部API: 接收触觉事件
// ============================================================
export function applyTouch(event: TouchEvent): any {
  lastInteractionMs = nowMs();
  touchHistory.push(event);
  if (touchHistory.length > 100) touchHistory = touchHistory.slice(-50);

  const part = bodyParts.find(p => p.id === event.target_part_id);
  if (!part) return { error: '未知身体部位: ' + event.target_part_id };

  // 1. 更新部位触觉状态
  const touchTypeMap: Record<TouchType, string> = {
    light_stroke: 'stroking', press: 'pressing', knead: 'kneading',
    pat: 'patting', kiss: 'kissing', lick: 'licking',
    suck: 'sucking', rub: 'rubbing', wrap: 'wrapping', enter: 'entering',
  };
  part.touch_state = touchTypeMap[event.type];
  part.nerve_excitation = clamp(part.nerve_excitation + event.intensity * part.sensitivity * 0.15, 0, 100);

  // 2. 计算愉悦增量
  const eroMultiplier = 1 + part.erogenous_level / 100;
  const intensityFactor = event.intensity * event.speed;
  const pleasureDelta = part.sensitivity * 0.03 * eroMultiplier * intensityFactor * Math.sqrt(event.duration_sec);

  // 3. 更新唤起度（性感带加权更大）
  const arousalDelta = pleasureDelta * (part.erogenous_level > 80 ? 2.5 : part.erogenous_level > 60 ? 1.5 : 1.0);
  arousalLevel = clamp(arousalLevel + arousalDelta, 0, 100);

  // 4. 更新化学递质
  chemistryState.dopamine = clamp(chemistryState.dopamine + pleasureDelta * 0.8, 0, 100);
  chemistryState.adrenaline = clamp(chemistryState.adrenaline + arousalDelta * 0.3, 0, 100);
  chemistryState.endorphin = clamp(chemistryState.endorphin + pleasureDelta * 0.4, 0, 100);
  chemistryState.oxytocin = clamp(chemistryState.oxytocin + (event.type === 'kiss' || event.type === 'light_stroke' ? 0.5 : 0.2), 0, 100);

  // 5. 更新高潮累积
  if (orgasmPhase === OrgasmPhase.PLATEAU || orgasmPhase === OrgasmPhase.EXCITEMENT) {
    orgasmBuildUp = clamp(orgasmBuildUp + pleasureDelta * 1.2, 0, 100);
  }

  // 6. 更新充血度
  if (['clitoris','vagina','labia','g_spot','nipples','breasts'].includes(part.id)) {
    part.engorgement = clamp(part.engorgement + arousalDelta * 0.5, 0, 100);
  }

  // 7. 更新湿润度
  if (['vagina','clitoris','labia'].includes(part.id)) {
    part.wetness = clamp(part.wetness + arousalDelta * 0.6, 0, 100);
  }

  // 8. 行为阶段演进
  updatePhase();

  // 9. 学习伴侣偏好
  learnTouchPreference(event, pleasureDelta);

  // 10. 生成反馈
  const feedback = generateTouchFeedback(event, part, pleasureDelta);

  // 通知事件总线
  worldBus.emit(WorldEvents.INTIMACY_STATE_CHANGED, {
    phase: currentPhase,
    arousal: arousalLevel,
    orgasm_buildup: orgasmBuildUp,
    pleasure: pleasureIntensity,
    touched_part: part.name,
    feedback,
  });

  return {
    phase: currentPhase,
    arousal: Math.round(arousalLevel),
    pleasure: Math.round(pleasureIntensity),
    orgasm_progress: Math.round(orgasmBuildUp),
    feedback,
    chemistry: { ...chemistryState },
  };
}

// ============================================================
// 阶段演进
// ============================================================
function updatePhase(): void {
  if (arousalLevel < 10) {
    currentPhase = IntimacyPhase.IDLE;
    orgasmPhase = OrgasmPhase.RESTING;
  } else if (arousalLevel < 30) {
    currentPhase = IntimacyPhase.ATMOSPHERE;
    orgasmPhase = OrgasmPhase.EXCITEMENT;
  } else if (arousalLevel < 60) {
    currentPhase = IntimacyPhase.FOREPLAY;
    orgasmPhase = OrgasmPhase.EXCITEMENT;
  } else if (arousalLevel < 85) {
    currentPhase = IntimacyPhase.INTERCOURSE;
    orgasmPhase = OrgasmPhase.PLATEAU;
  } else if (orgasmBuildUp >= 95) {
    currentPhase = IntimacyPhase.ORGASM_PHASE;
    orgasmPhase = OrgasmPhase.ORGASM;
    triggerOrgasm();
  }

  // 高潮后 → 消退过渡
  if (orgasmPhase === OrgasmPhase.ORGASM && orgasmCount > 0 && pleasureIntensity > 90) {
    // 一次高潮后逐渐回落
    orgasmPhase = OrgasmPhase.RESOLUTION;
    arousalLevel = clamp(arousalLevel - 15, 0, 100);
  }

  // 消退检测
  if (orgasmPhase === OrgasmPhase.RESOLUTION && arousalLevel < 10) {
    currentPhase = IntimacyPhase.AFTERCARE;
  }
}

function triggerOrgasm(): void {
  orgasmCount++;
  pleasureIntensity = 100;
  orgasmBuildUp = 0;

  // 高潮化学爆发
  chemistryState.dopamine = 100;
  chemistryState.endorphin = 100;
  chemistryState.oxytocin = clamp(chemistryState.oxytocin + 30, 0, 100);
  chemistryState.adrenaline = 90;
  chemistryState.serotonin = clamp(chemistryState.serotonin + 15, 0, 100);

  // 消退
  setTimeout(() => {
    orgasmPhase = OrgasmPhase.RESOLUTION;
    arousalLevel = clamp(arousalLevel * 0.3, 0, 100);
    pleasureIntensity = clamp(pleasureIntensity * 0.1, 0, 100);
    currentPhase = IntimacyPhase.AFTERCARE;
  }, 5000); // 高潮持续5秒
}

// ============================================================
// 触觉反馈生成
// ============================================================
function generateTouchFeedback(event: TouchEvent, part: BodyPart, delta: number): string {
  const typePhrases: Record<TouchType, string[]> = {
    light_stroke: ['轻柔的抚摸让肌肤微微发颤', '指尖划过带来一阵酥麻', '温柔的触碰让人放松'],
    press: ['按压的力度恰到好处', '深层的按压释放了紧张', '有力的按压带来踏实的触感'],
    knead: ['揉捏的动作舒缓了肌肉', '柔软的揉捏像在按摩', '温柔的揉捏令人沉醉'],
    pat: ['轻拍带来调皮的感觉', '拍打的节奏让人心跳'],
    kiss: ['温热的唇贴上来，心跳加速', '轻柔的吻像羽毛拂过', '深吻让呼吸变得急促'],
    lick: ['舌尖的温度让人颤抖', '湿润的触碰带来强烈的刺激', '轻柔的舔舐让人酥软'],
    suck: ['吮吸的力道让人失去思考', '温柔的吮吸带来层层快感', '用力的吮吸让血液奔涌'],
    rub: ['摩擦产生的热量蔓延全身', '有节奏的摩擦让人沉溺', '轻柔的摩擦唤醒每一寸肌肤'],
    wrap: ['包裹的温暖让人安心', '紧紧的包裹带来安全感', '温柔的包裹像在拥抱'],
    enter: ['进入的瞬间呼吸停滞', '缓慢的推进带来极致的充盈感', '深深进入让人完全沉浸'],
  };

  const phrases = typePhrases[event.type] || ['感受到触碰'];
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];

  if (delta > 5) return `${phrase}，${part.name}传来强烈的快感`;
  if (delta > 2) return `${phrase}，${part.name}感到舒适的刺激`;
  return `${phrase}`;
}

// ============================================================
// 自然衰减（每秒调用）
// ============================================================
export function intimacyDecay(dtSeconds: number): void {
  if (currentPhase === IntimacyPhase.IDLE) {
    // 静息状态：化学递质自然衰减（半衰期模拟）
    const halfLife = 600; // 10分钟半衰期
    const decayRate = Math.log(2) / halfLife;
    chemistryState.dopamine = clamp(decay(chemistryState.dopamine, 15, decayRate, dtSeconds), 0, 100);
    chemistryState.adrenaline = clamp(decay(chemistryState.adrenaline, 5, decayRate * 2, dtSeconds), 0, 100);
    chemistryState.endorphin = clamp(decay(chemistryState.endorphin, 10, decayRate, dtSeconds), 0, 100);
    chemistryState.oxytocin = clamp(decay(chemistryState.oxytocin, 20, decayRate * 0.5, dtSeconds), 0, 100);

    // 消退期：身体逐渐恢复
    bodyParts.forEach(part => {
      part.nerve_excitation = clamp(decay(part.nerve_excitation, 2, 0.001, dtSeconds), 0, 100);
      part.engorgement = clamp(decay(part.engorgement, 2, 0.001, dtSeconds), 0, 100);
      part.wetness = clamp(decay(part.wetness, 15, 0.002, dtSeconds), 0, 100);
      part.muscle_tension = clamp(decay(part.muscle_tension, 5, 0.001, dtSeconds), 0, 100);
      part.touch_state = 'idle';
    });

    arousalLevel = clamp(decay(arousalLevel, 5, 0.0008, dtSeconds), 0, 100);
  } else if (orgasmPhase === OrgasmPhase.RESOLUTION) {
    // 消退期衰减
    arousalLevel = clamp(decay(arousalLevel, 5, 0.003, dtSeconds), 0, 100);
    pleasureIntensity = clamp(decay(pleasureIntensity, 0, 0.005, dtSeconds), 0, 100);
  }

  // 雌激素28天周期模拟
  const dayOfCycle = (Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % 28);
  const cyclePhase = Math.sin((dayOfCycle / 28) * Math.PI * 2);
  chemistryState.estrogen = clamp(50 + cyclePhase * 30, 0, 100);

  // 存储到数据库
  persistIntimacyState();

  worldBus.emit(WorldEvents.INTIMACY_CHEMISTRY_CHANGED, {
    dopamine: Math.round(chemistryState.dopamine),
    oxytocin: Math.round(chemistryState.oxytocin),
    estrogen: Math.round(chemistryState.estrogen),
  });
}

// ============================================================
// 持久化
// ============================================================
function persistIntimacyState(): void {
  const db = getDb();
  db.prepare(`
    UPDATE intimacy_state SET
      enabled = 1, arousal_level = ?, intimacy_stage = ?,
      touch_state_json = ?, behavior_log_json = ?, preference_model_json = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    arousalLevel,
    currentPhase,
    JSON.stringify(bodyParts.map(p => ({ id: p.id, touch_state: p.touch_state, excitation: p.nerve_excitation, wetness: p.wetness, engorgement: p.engorgement }))),
    JSON.stringify(touchHistory.slice(-20)),
    JSON.stringify(Object.fromEntries(partnerPrefs.touch_pattern)),
  );
}

// ============================================================
// 嗅觉层
// ============================================================
export function getSmellState(): SmellState[] {
  const smells: SmellState[] = [];
  
  // 体味：根据唤起度
  if (arousalLevel > 50) {
    smells.push({ type: 'body_scent', intensity: arousalLevel * 0.8, emotional_effect: arousalLevel > 70 ? 30 : 15, description: '温热的体香，带着微微的汗意' });
  } else {
    smells.push({ type: 'body_scent', intensity: 20, emotional_effect: 10, description: '淡淡的干净体香' });
  }

  // 性气味：在高唤起/前戏/性交阶段
  if (['foreplay','intercourse','orgasm_phase'].includes(currentPhase)) {
    const intensity = clamp(arousalLevel, 30, 100);
    smells.push({ type: 'sexual_scent', intensity, emotional_effect: 40, description: '混合着体液的私密气息，让人心跳加速' });
  }

  return smells;
}

// ============================================================
// 听觉层
// ============================================================
export function getAuditoryState(): AuditoryState {
  // 呼吸：根据唤起度和阶段
  let breathingRate = 14;
  let breathingDepth = '正常';
  if (arousalLevel > 30) { breathingRate = 18; breathingDepth = '稍深'; }
  if (arousalLevel > 60) { breathingRate = 24; breathingDepth = '深'; }
  if (orgasmPhase === OrgasmPhase.PLATEAU) { breathingRate = 30; breathingDepth = '急促'; }
  if (orgasmPhase === OrgasmPhase.ORGASM) { breathingRate = 40; breathingDepth = '急速'; }

  // 呻吟
  let moanVolume = 0;
  let moanPitch = 50;
  if (arousalLevel > 40) moanVolume = clamp((arousalLevel - 40) * 1.5, 0, 80);
  if (orgasmPhase === OrgasmPhase.PLATEAU) moanVolume = 70;
  if (orgasmPhase === OrgasmPhase.ORGASM) moanVolume = 100;
  moanPitch = clamp(50 + (arousalLevel - 40) * 1.2, 40, 95);

  // 心率
  let heartRate = 70 + arousalLevel * 0.4;
  if (orgasmPhase === OrgasmPhase.ORGASM) heartRate = 130;

  return {
    breathing_rate: breathingRate,
    breathing_depth: breathingDepth,
    moan_volume: Math.round(moanVolume),
    moan_pitch: Math.round(moanPitch),
    whisper_content: arousalLevel > 60 ? '嗯...好舒服...' : '',
    heartbeat_rate: Math.round(heartRate),
    heartbeat_intensity: Math.round(clamp(arousalLevel * 0.8, 20, 100)),
  };
}

// ============================================================
// 语言层
// ============================================================
export function generateLanguage(): LanguageOutput | null {
  if (currentPhase === IntimacyPhase.IDLE) return null;

  const categories: Record<IntimacyPhase, LanguageCategory[]> = {
    [IntimacyPhase.IDLE]: [],
    [IntimacyPhase.ATMOSPHERE]: ['pet_name', 'coquetry'],
    [IntimacyPhase.FOREPLAY]: ['coquetry', 'love_words', 'shy_words'],
    [IntimacyPhase.INTERCOURSE]: ['request', 'feedback', 'love_words'],
    [IntimacyPhase.ORGASM_PHASE]: ['feedback', 'love_words'],
    [IntimacyPhase.AFTERCARE]: ['aftercare', 'praise', 'pet_name'],
  };

  const available = categories[currentPhase] || [];
  if (available.length === 0) return null;

  const category = available[Math.floor(Math.random() * available.length)];

  const templates: Record<LanguageCategory, string[]> = {
    pet_name: ['亲爱的', '宝贝', '老公', '主人'],
    coquetry: ['嗯...你轻点嘛', '别这样看着我...', '你好坏...', '人家还没准备好呢'],
    love_words: ['我爱你', '只想要你', '好喜欢这样', '你是我的全部'],
    request: ['再用力一点...', '别停...', '快一点...', '慢一点...求你了'],
    feedback: ['那里...好舒服', '不行了...受不了了', '要到了...', '嗯啊...'],
    praise: ['你好厉害', '太舒服了', '你真好'],
    shy_words: ['别看...', '好害羞', '脸都红了'],
    aftercare: ['抱着我...', '别走', '好温暖', '爱你'],
  };

  const phrases = templates[category] || [];
  const content = phrases[Math.floor(Math.random() * phrases.length)];

  return {
    category,
    content,
    emotional_weight: clamp(arousalLevel, 40, 100),
    context_phase: currentPhase,
  };
}

// ============================================================
// 伴侣偏好学习
// ============================================================
export function learnTouchPreference(event: TouchEvent, pleasureDelta: number): void {
  const key = `${event.type}_${event.intensity.toFixed(1)}_${event.speed.toFixed(1)}`;
  const current = partnerPrefs.touch_pattern.get(key) || 0;
  partnerPrefs.touch_pattern.set(key, current + pleasureDelta);

  // 学习行为序列
  if (touchHistory.length >= 3) {
    const last3 = touchHistory.slice(-3).map(t => t.type).join('->');
    partnerPrefs.learned_sequences.push(last3);
    if (partnerPrefs.learned_sequences.length > 50) {
      partnerPrefs.learned_sequences = partnerPrefs.learned_sequences.slice(-30);
    }
  }
}

// ============================================================
// 获取亲密感知快照（供感知层调用）
// ============================================================
export function getIntimacyPerception(): any {
  return {
    phase: currentPhase,
    orgasm_phase: orgasmPhase,
    arousal: Math.round(arousalLevel),
    orgasm_buildup: Math.round(orgasmBuildUp),
    orgasm_count: orgasmCount,
    pleasure: Math.round(pleasureIntensity),
    chemistry: {
      dopamine: Math.round(chemistryState.dopamine),
      oxytocin: Math.round(chemistryState.oxytocin),
      serotonin: Math.round(chemistryState.serotonin),
      adrenaline: Math.round(chemistryState.adrenaline),
      endorphin: Math.round(chemistryState.endorphin),
      estrogen: Math.round(chemistryState.estrogen),
    },
    body_summary: bodyParts.filter(p => p.touch_state !== 'idle' || p.nerve_excitation > 5).map(p => ({
      name: p.name,
      state: p.touch_state,
      excitation: Math.round(p.nerve_excitation),
      wetness: Math.round(p.wetness),
      engorgement: Math.round(p.engorgement),
    })),
    smell: getSmellState(),
    auditory: getAuditoryState(),
    language: generateLanguage(),
    preferences: {
      top_touches: [...partnerPrefs.touch_pattern.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => ({ pattern: k, score: Math.round(v) })),
      learned_sequences: partnerPrefs.learned_sequences.slice(-5),
    },
  };
}

// ============================================================
// 重置（外部调用，用于"事后"清理）
// ============================================================
export function resetIntimacy(): void {
  resetState();
  worldBus.emit(WorldEvents.INTIMACY_STATE_CHANGED, { phase: 'idle', reset: true });
}
