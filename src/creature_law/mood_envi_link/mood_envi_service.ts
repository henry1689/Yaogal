/**
 * 情绪环境联动 — 环境因素对情绪基底的动态影响
 * 光/温/声/味 → mood_modifier（-50到+50）
 */
import { log, clamp } from '../../common/utils';

// ============================================================
// 环境输入
// ============================================================
export interface EnviInput {
  /** 光照强度 0-100 */
  light_level: number;
  /** 温度 °C */
  temperature: number;
  /** 噪声等级 0-100 */
  noise_level: number;
  /** 空气质量 0-100（高=好） */
  air_quality: number;
  /** 气味类型 */
  smell_type: 'neutral' | 'fresh' | 'musty' | 'fragrant' | 'chemical' | 'smoky';
  /** 空间开阔度 0-100（户外=高） */
  spaciousness: number;
  /** 是否在室内 */
  indoor: boolean;
}

export interface MoodModifier {
  /** 综合情绪修正 -50到+50 */
  modifier: number;
  /** 各维度贡献 */
  breakdown: {
    light: number;
    temperature: number;
    noise: number;
    air: number;
    smell: number;
    space: number;
  };
  /** 描述 */
  description: string;
}

// ============================================================
// 光照 → 情绪
// ============================================================
function lightToMood(lightLevel: number): { score: number; desc: string } {
  if (lightLevel > 80) return { score: 10, desc: '明亮' };
  if (lightLevel > 50) return { score: 5, desc: '适中' };
  if (lightLevel > 20) return { score: -2, desc: '偏暗' };
  return { score: -8, desc: '黑暗' };
}

// ============================================================
// 温度 → 情绪
// ============================================================
function tempToMood(temp: number): { score: number; desc: string } {
  if (temp > 35) return { score: -12, desc: '酷热' };
  if (temp > 30) return { score: -6, desc: '炎热' };
  if (temp > 25) return { score: -2, desc: '偏热' };
  if (temp >= 20 && temp <= 25) return { score: 10, desc: '舒适' };
  if (temp >= 15) return { score: 2, desc: '微凉' };
  if (temp >= 5) return { score: -5, desc: '寒冷' };
  return { score: -10, desc: '严寒' };
}

// ============================================================
// 噪声 → 情绪
// ============================================================
function noiseToMood(noiseLevel: number): { score: number; desc: string } {
  if (noiseLevel > 80) return { score: -15, desc: '嘈杂' };
  if (noiseLevel > 60) return { score: -8, desc: '偏吵' };
  if (noiseLevel > 30) return { score: 5, desc: '适中' };
  return { score: 10, desc: '安静' };
}

// ============================================================
// 气味 → 情绪
// ============================================================
function smellToMood(smell: string): { score: number; desc: string } {
  switch (smell) {
    case 'fresh': return { score: 12, desc: '清新' };
    case 'fragrant': return { score: 10, desc: '芳香' };
    case 'neutral': return { score: 0, desc: '无异味' };
    case 'musty': return { score: -8, desc: '霉味' };
    case 'chemical': return { score: -10, desc: '化学味' };
    case 'smoky': return { score: -12, desc: '烟味' };
    default: return { score: 0, desc: '未知' };
  }
}

// ============================================================
// 空间 → 情绪
// ============================================================
function spaceToMood(spaciousness: number, indoor: boolean): { score: number; desc: string } {
  if (!indoor && spaciousness > 80) return { score: 15, desc: '开阔' };
  if (!indoor) return { score: 8, desc: '户外' };
  if (spaciousness > 70) return { score: 6, desc: '宽敞' };
  if (spaciousness > 40) return { score: 0, desc: '适中' };
  if (spaciousness > 20) return { score: -4, desc: '偏小' };
  return { score: -8, desc: '狭小' };
}

// ============================================================
// 公共API
// ============================================================
/** 计算综合情绪修正 */
export function calculateMoodModifier(input: EnviInput): MoodModifier {
  const light = lightToMood(input.light_level);
  const temp = tempToMood(input.temperature);
  const noise = noiseToMood(input.noise_level);
  const airScore = input.air_quality > 50 ? 5 : -5;
  const airDesc = input.air_quality > 50 ? '好' : '差';
  const smell = smellToMood(input.smell_type);
  const space = spaceToMood(input.spaciousness, input.indoor);

  // 加权合成
  const modifier = clamp(
    light.score * 0.2 + temp.score * 0.2 + noise.score * 0.2 +
    airScore * 0.1 + smell.score * 0.15 + space.score * 0.15,
    -50, 50
  );

  const descParts: string[] = [];
  if (Math.abs(light.score) >= 5) descParts.push(`光线${light.desc}`);
  if (Math.abs(temp.score) >= 5) descParts.push(`温度${temp.desc}`);
  if (Math.abs(noise.score) >= 5) descParts.push(`${noise.desc}`);
  if (Math.abs(smell.score) >= 5) descParts.push(smell.desc);
  if (Math.abs(space.score) >= 5) descParts.push(space.desc);

  return {
    modifier: Math.round(modifier),
    breakdown: {
      light: light.score,
      temperature: temp.score,
      noise: noise.score,
      air: airScore,
      smell: smell.score,
      space: space.score,
    },
    description: descParts.join('、') || '环境平稳',
  };
}

/** 从天气和场景生成环境输入 */
export function buildEnviInput(
  weather: string,
  temperature: number,
  isDaytime: boolean,
  isIndoor: boolean,
  airQuality: number
): EnviInput {
  // 光照
  let lightLevel = 50;
  if (!isIndoor) {
    if (isDaytime) {
      if (weather.includes('晴')) lightLevel = 90;
      else if (weather.includes('多云')) lightLevel = 70;
      else lightLevel = 40;
    } else {
      lightLevel = 5;
    }
  } else {
    lightLevel = isDaytime ? 60 : 20;
  }

  // 噪声（室内安静，室外受天气影响）
  let noiseLevel = 25;
  if (!isIndoor) {
    if (weather.includes('暴') || weather.includes('雷')) noiseLevel = 70;
    else if (weather.includes('雨')) noiseLevel = 50;
    else if (weather.includes('风')) noiseLevel = 45;
    else noiseLevel = 35;
  }

  // 气味
  let smellType: EnviInput['smell_type'] = 'neutral';
  if (!isIndoor) {
    if (weather.includes('雨')) smellType = 'fresh';
    else smellType = 'neutral';
  }

  return {
    light_level: lightLevel,
    temperature,
    noise_level: noiseLevel,
    air_quality: airQuality,
    smell_type: smellType,
    spaciousness: isIndoor ? 50 : 90,
    indoor: isIndoor,
  };
}
