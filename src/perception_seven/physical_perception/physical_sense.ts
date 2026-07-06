/**
 * 物理感知 — 温度/湿度/光线/声音/气味 → 舒适度/精力/情绪基调
 */
import { getCurrentWeather } from '../../natural_env/weather_sensor/weather_service';
import { getWorldTime } from '../../natural_env/time_calendar/time_service';
import { clamp } from '../../common/utils';

export interface PhysicalPerception {
  /** 温度舒适度 0-100（0=极冷, 50=最舒适, 100=极热） */
  thermal_comfort: number;
  /** 体感温度 */
  feels_like_temp: number;
  /** 湿度舒适度 0-100 */
  humidity_comfort: number;
  /** 光线感知 0-100（0=全黑, 50=适中, 100=刺眼） */
  light_level: number;
  /** 声音环境 0-100（0=寂静, 50=正常, 100=嘈杂） */
  noise_level: number;
  /** 气味感知描述 */
  smell_notes: string[];
  /** 综合身体舒适度 0-100 */
  body_comfort: number;
  /** 精力基调 -50到+50（负=低落, 正=充沛） */
  energy_tone: number;
  /** 情绪基调 -50到+50（负=阴郁, 正=愉悦） */
  mood_tone: number;
  /** 对行为的驱动力影响描述 */
  behavioral_drive: string;
}

export function getPhysicalPerception(): PhysicalPerception {
  const weather = getCurrentWeather() as any;
  const worldTime = getWorldTime() as any;

  // 温度舒适度：以22°C为最佳
  let thermalComfort = 50;
  let feelsLike = 22;
  if (weather) {
    const temp = weather.temperature || 22;
    feelsLike = weather.feels_like || temp;
    // 高斯型：22°C最优，偏离越大越不适
    const deviation = Math.abs(temp - 22);
    thermalComfort = clamp(50 - deviation * 3, 0, 100);
  }

  // 湿度舒适度：40-60%最优
  let humidityComfort = 50;
  if (weather?.humidity) {
    const dev = Math.abs(weather.humidity - 50);
    humidityComfort = clamp(50 - dev * 1.5, 0, 100);
  }

  // 光线：根据昼夜
  let lightLevel = 50;
  if (worldTime) {
    const hour = worldTime.hour;
    if (hour >= 6 && hour < 8) lightLevel = 30 + (hour - 6) * 35; // 晨光
    else if (hour >= 8 && hour < 17) lightLevel = 70 + Math.random() * 20; // 白昼
    else if (hour >= 17 && hour < 19) lightLevel = 90 - (hour - 17) * 45; // 黄昏
    else lightLevel = 5 + Math.random() * 10; // 夜间
  }

  // 声音环境：根据时间和场景估算
  let noiseLevel = 30;
  if (worldTime) {
    const hour = worldTime.hour;
    if (hour >= 8 && hour <= 18) noiseLevel = 45 + Math.random() * 20; // 白天
    else if (hour >= 19 && hour <= 22) noiseLevel = 35 + Math.random() * 15; // 傍晚
    else noiseLevel = 10 + Math.random() * 15; // 深夜安静
  }

  // 气味
  const smellNotes: string[] = [];
  if (worldTime?.season === 'spring') smellNotes.push('清新的花草香');
  if (worldTime?.season === 'summer') smellNotes.push('温暖的空气');
  if (worldTime?.season === 'autumn') smellNotes.push('干爽的落叶气息');
  if (worldTime?.season === 'winter') smellNotes.push('清冽的寒气');
  if (weather?.weather_desc?.includes('雨')) smellNotes.push('湿润的泥土味');

  // 综合身体舒适度
  const bodyComfort = (thermalComfort * 0.4 + humidityComfort * 0.2 + (100 - Math.abs(lightLevel - 50)) * 0.2 + (100 - Math.abs(noiseLevel - 40)) * 0.2);

  // 精力基调：舒适度越高精力越好
  const energyTone = clamp((bodyComfort - 50) * 0.8, -50, 50);

  // 情绪基调
  const moodTone = clamp((bodyComfort - 50) * 0.7 + (weather?.weather_desc?.includes('晴') ? 15 : weather?.weather_desc?.includes('雨') ? -10 : 0), -50, 50);

  return {
    thermal_comfort: Math.round(thermalComfort),
    feels_like_temp: feelsLike,
    humidity_comfort: Math.round(humidityComfort),
    light_level: Math.round(lightLevel),
    noise_level: Math.round(noiseLevel),
    smell_notes: smellNotes,
    body_comfort: Math.round(bodyComfort),
    energy_tone: Math.round(energyTone),
    mood_tone: Math.round(moodTone),
    behavioral_drive: energyTone > 20 ? '精力充沛，适合活动' : energyTone < -20 ? '疲惫，倾向于休息' : '状态平稳',
  };
}
