/**
 * 世界感知 — 天气/新闻/季节/社会氛围 → 希望感/无力感/世界观基调
 */
import { getCurrentWeather } from '../../natural_env/weather_sensor/weather_service';
import { getWorldTime } from '../../natural_env/time_calendar/time_service';
import { clamp } from '../../common/utils';

export interface WorldPerception {
  /** 天气影响 0-100（0=糟糕, 100=极好） */
  weather_impact: number;
  /** 季节美感 0-100 */
  season_beauty: number;
  /** 社会氛围基调 -50到+50（负=压抑, 正=积极） */
  social_atmosphere: number;
  /** 希望感 0-100 */
  hope_level: number;
  /** 无力感 0-100（反向） */
  helplessness: number;
  /** 世界观基调 -50到+50（负=悲观, 正=乐观） */
  worldview_tone: number;
  /** 与大自然的连接感 0-100 */
  nature_connection: number;
}

let socialAtmosphere = 10; // 外部可调

export function updateSocialAtmosphere(value: number): void {
  socialAtmosphere = clamp(value, -50, 50);
}

export function getWorldPerception(): WorldPerception {
  const weather = getCurrentWeather() as any;
  const wt = getWorldTime() as any;

  // 天气影响
  let weatherImpact = 50;
  if (weather) {
    if (weather.weather_desc?.includes('晴')) weatherImpact = 75;
    else if (weather.weather_desc?.includes('多云')) weatherImpact = 60;
    else if (weather.weather_desc?.includes('阴')) weatherImpact = 40;
    else if (weather.weather_desc?.includes('雨')) weatherImpact = 30;
    else if (weather.weather_desc?.includes('雪')) weatherImpact = 55;
    // 温度修正
    if (weather.temperature > 35) weatherImpact -= 15;
    else if (weather.temperature < 5) weatherImpact -= 10;
  }

  // 季节美感
  let seasonBeauty = 50;
  const season = wt?.season;
  if (season === 'spring') seasonBeauty = 75;
  else if (season === 'autumn') seasonBeauty = 70;
  else if (season === 'summer') seasonBeauty = 55;
  else if (season === 'winter') seasonBeauty = 45;
  // 节气加成
  if (wt?.solar_term) seasonBeauty += 5;

  // 希望感 = 天气 + 季节 + 社会氛围
  const hope = clamp(weatherImpact * 0.3 + seasonBeauty * 0.3 + (socialAtmosphere + 50) * 0.4, 0, 100);

  // 无力感
  const helplessness = clamp(100 - hope * 0.7, 0, 100);

  // 世界观基调
  const worldviewTone = clamp((hope - 50) * 0.8 + socialAtmosphere * 0.2, -50, 50);

  // 自然连接感：好天气 + 适合户外
  const natureConnection = clamp(weatherImpact * 0.5 + seasonBeauty * 0.3 + 10, 0, 100);

  return {
    weather_impact: Math.round(weatherImpact),
    season_beauty: Math.round(seasonBeauty),
    social_atmosphere: Math.round(socialAtmosphere),
    hope_level: Math.round(hope),
    helplessness: Math.round(helplessness),
    worldview_tone: Math.round(worldviewTone),
    nature_connection: Math.round(natureConnection),
  };
}
