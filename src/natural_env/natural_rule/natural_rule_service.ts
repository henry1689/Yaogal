/**
 * 物候规则 — 季节/昼夜/物候现象
 * 根据时间和天气驱动环境描述和情绪影响
 */
import { log } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 季节枚举
// ============================================================
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonInfo {
  season: Season;
  name: string;
  /** 基础体感温度偏移 */
  temp_offset: number;
  /** 典型天气概率权重 */
  weather_weights: Record<string, number>;
  /** 季节描述 */
  description: string;
}

const SEASONS: Record<Season, SeasonInfo> = {
  spring: {
    season: 'spring', name: '春',
    temp_offset: 0,
    weather_weights: { '晴': 30, '多云': 30, '阴': 20, '小雨': 15, '雷阵雨': 5 },
    description: '春风拂面，万物复苏，枝头抽出嫩绿的新芽，空气中弥漫着泥土和花香',
  },
  summer: {
    season: 'summer', name: '夏',
    temp_offset: 12,
    weather_weights: { '晴': 40, '多云': 25, '阴': 10, '雷阵雨': 15, '暴雨': 5, '晴热': 5 },
    description: '烈日炎炎，蝉鸣阵阵，树叶浓密翠绿，空气中是阳光和青草的味道',
  },
  autumn: {
    season: 'autumn', name: '秋',
    temp_offset: 3,
    weather_weights: { '晴': 35, '多云': 30, '阴': 20, '小雨': 10, '雾': 5 },
    description: '天高云淡，秋风送爽，落叶纷飞如同金色的蝴蝶，果实成熟的甜香飘散',
  },
  winter: {
    season: 'winter', name: '冬',
    temp_offset: -15,
    weather_weights: { '晴': 25, '多云': 25, '阴': 25, '雪': 15, '雨夹雪': 5, '雾': 5 },
    description: '寒风凛冽，万物沉寂，枯枝上偶尔挂着霜花，呼出的气息化作白雾',
  },
};

// ============================================================
// 昼夜
// ============================================================
export interface DayNightInfo {
  is_daytime: boolean;
  phase: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'evening' | 'night' | 'midnight';
  name: string;
  lighting: string;
  mood_modifier: number;
}

const DAYNIGHT_PHASES: Record<string, DayNightInfo> = {
  dawn:     { is_daytime: true,  phase: 'dawn',     name: '破晓', lighting: 'natural', mood_modifier: 5 },
  morning:  { is_daytime: true,  phase: 'morning',  name: '上午', lighting: 'natural', mood_modifier: 10 },
  noon:     { is_daytime: true,  phase: 'noon',     name: '正午', lighting: 'natural', mood_modifier: 5 },
  afternoon:{ is_daytime: true,  phase: 'afternoon',name: '午后', lighting: 'natural', mood_modifier: 0 },
  dusk:     { is_daytime: true,  phase: 'dusk',     name: '黄昏', lighting: 'natural', mood_modifier: -3 },
  evening:  { is_daytime: false, phase: 'evening',  name: '傍晚', lighting: 'artificial', mood_modifier: -2 },
  night:    { is_daytime: false, phase: 'night',    name: '夜晚', lighting: 'dark', mood_modifier: -8 },
  midnight: { is_daytime: false, phase: 'midnight', name: '深夜', lighting: 'dark', mood_modifier: -12 },
};

// ============================================================
// 物候现象
// ============================================================
export interface PhenologyEvent {
  season: Season;
  month: number;
  name: string;
  description: string;
  visual: string;
}

const PHENOLOGY: PhenologyEvent[] = [
  { season: 'spring', month: 3, name: '桃花盛开', description: '桃花灼灼，满树烂漫', visual: '粉色花瓣点缀枝头' },
  { season: 'spring', month: 4, name: '樱花如雪', description: '樱花烂漫，落英缤纷', visual: '白色花瓣随风飘落' },
  { season: 'spring', month: 5, name: '杨柳依依', description: '柳絮纷飞，杨柳轻摆', visual: '柳枝在微风中摇摆' },
  { season: 'summer', month: 6, name: '荷叶田田', description: '池塘荷叶铺满水面', visual: '碧绿荷叶间点缀粉荷' },
  { season: 'summer', month: 7, name: '蝉鸣如雷', description: '蝉声阵阵，热浪滚滚', visual: '枝叶间的蝉奋力鸣叫' },
  { season: 'summer', month: 8, name: '烈日炎炎', description: '酷暑难耐，知了嘶鸣', visual: '柏油路面热气蒸腾' },
  { season: 'autumn', month: 9, name: '桂花飘香', description: '金桂银桂次第开放，满城芬芳', visual: '金色小花簇拥枝头' },
  { season: 'autumn', month: 10, name: '枫叶似火', description: '枫叶转红，层林尽染', visual: '红色枫叶铺满小径' },
  { season: 'autumn', month: 11, name: '落叶纷飞', description: '风吹叶落，满地金黄', visual: '金色落叶在风中旋转' },
  { season: 'winter', month: 12, name: '初雪飘零', description: '第一场雪悄然而至', visual: '细小的雪花轻轻飘落' },
  { season: 'winter', month: 1, name: '银装素裹', description: '大雪覆盖，世界洁白', visual: '屋顶和树枝披上白衣' },
  { season: 'winter', month: 2, name: '寒梅傲雪', description: '梅花在雪中绽放', visual: '红色梅花点缀白雪' },
];

// ============================================================
// 公共API
// ============================================================
export function getSeasonFromMonth(month: number): SeasonInfo {
  if (month >= 3 && month <= 5) return SEASONS.spring;
  if (month >= 6 && month <= 8) return SEASONS.summer;
  if (month >= 9 && month <= 11) return SEASONS.autumn;
  return SEASONS.winter;
}

export function getDayNightPhase(hour: number): DayNightInfo {
  if (hour >= 5 && hour < 6) return DAYNIGHT_PHASES.dawn;
  if (hour >= 6 && hour < 11) return DAYNIGHT_PHASES.morning;
  if (hour >= 11 && hour < 13) return DAYNIGHT_PHASES.noon;
  if (hour >= 13 && hour < 17) return DAYNIGHT_PHASES.afternoon;
  if (hour >= 17 && hour < 18) return DAYNIGHT_PHASES.dusk;
  if (hour >= 18 && hour < 20) return DAYNIGHT_PHASES.evening;
  if (hour >= 20 && hour < 24) return DAYNIGHT_PHASES.night;
  return DAYNIGHT_PHASES.midnight; // 0-5
}

export function getPhenologyEvents(month: number): PhenologyEvent[] {
  return PHENOLOGY.filter(e => e.month === month);
}

export function getCurrentPhenologyEvents(month: number): PhenologyEvent[] {
  // 当月 + 相邻月（过渡期）
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextMonth = month === 12 ? 1 : month + 1;
  return PHENOLOGY.filter(e => e.month === month || e.month === prevMonth || e.month === nextMonth);
}

/** 获取综合自然规则快照 */
export function getNaturalRuleSnapshot(month: number, hour: number, temperature: number, weather: string): {
  season: SeasonInfo;
  day_night: DayNightInfo;
  phenology: PhenologyEvent[];
  environment_description: string;
  comfort_index: number;  // 舒适指数 0-100
} {
  const season = getSeasonFromMonth(month);
  const dayNight = getDayNightPhase(hour);
  const phenology = getCurrentPhenologyEvents(month);

  // 舒适指数
  let comfort = 70;
  // 温度影响（假设舒适温度 22°C）
  const tempDiff = Math.abs(temperature - 22);
  comfort -= tempDiff * 2;
  // 昼夜影响
  comfort += dayNight.mood_modifier;
  // 天气影响
  if (weather.includes('雨') || weather.includes('雪')) comfort -= 10;
  if (weather.includes('雷') || weather.includes('暴')) comfort -= 15;
  comfort = Math.max(0, Math.min(100, comfort));

  // 环境描述
  const phenoDesc = phenology.length > 0
    ? phenology.map(p => p.description).join('，')
    : '';
  const envDesc = [
    season.description,
    phenoDesc ? `此时正值${phenoDesc}` : '',
    `${dayNight.name}时分` + (weather ? `，天气${weather}` : ''),
  ].filter(Boolean).join('。');

  return { season, day_night: dayNight, phenology, environment_description: envDesc, comfort_index: Math.round(comfort) };
}
