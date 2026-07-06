/**
 * 天气服务 — 和风天气接入
 * 30分钟缓存、夜间休眠、限流防超额
 */
import axios from 'axios';
import { getDb } from '../../common/database';
import { log, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

interface WeatherConfig {
  api_key: string;
  city_id: string;
  cache_ttl_minutes: number;
  night_quiet_hours: string;
  rate_limit_per_hour: number;
}

let config: WeatherConfig;
let cacheTimer: NodeJS.Timeout | null = null;
let requestCount = 0;
let resetHour = new Date().getHours();

function loadConfig(): WeatherConfig {
  const configPath = path.resolve(__dirname, '../../../config.yaml');
  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = yaml.parse(raw);
  return cfg.weather;
}

export function startWeatherService(): void {
  config = loadConfig();
  
  if (!config.api_key || !config.city_id) {
    log('WEATHER', '⚠️ 和风天气 API Key 或城市ID未配置，使用模拟数据');
    startMockWeather();
    return;
  }

  log('WEATHER', `天气服务启动 (city=${config.city_id}, cache=${config.cache_ttl_minutes}min)`);
  
  // 首次获取
  fetchWeather();
  
  // 定时刷新
  cacheTimer = setInterval(fetchWeather, config.cache_ttl_minutes * 60 * 1000);
}

async function fetchWeather(): Promise<void> {
  const hour = new Date().getHours();
  const [quietStart, quietEnd] = config.night_quiet_hours.split('-').map(Number);
  
  // 夜间休眠
  if (hour >= quietStart || hour < quietEnd) {
    log('WEATHER', '夜间休眠，跳过获取');
    return;
  }

  // 限流检查
  if (hour !== resetHour) {
    requestCount = 0;
    resetHour = hour;
  }
  if (requestCount >= config.rate_limit_per_hour) {
    log('WEATHER', '⚠️ 达到小时限流上限');
    return;
  }

  try {
    requestCount++;
    const res = await axios.get('https://devapi.qweather.com/v7/weather/now', {
      params: {
        location: config.city_id,
        key: config.api_key,
      },
      timeout: 5000,
    });

    if (res.data?.code === '200') {
      saveWeatherSnapshot(res.data.now, false);
      worldBus.emit(WorldEvents.WEATHER_UPDATED, res.data.now);
      log('WEATHER', `获取成功: ${res.data.now.temp}°C, ${res.data.now.text}`);
    } else {
      log('WEATHER', `API 返回异常: code=${res.data?.code}`);
    }
  } catch (err: any) {
    log('WEATHER', `获取失败: ${err.message}`);
  }
}

function saveWeatherSnapshot(data: any, isCached: boolean): void {
  getDb().prepare(`
    INSERT INTO weather_snapshot (timestamp_ms, temperature, feels_like, humidity, wind_speed, wind_direction, weather_desc, weather_icon, aqi, visibility, pressure, is_cached)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nowMs(),
    parseFloat(data.temp),
    parseFloat(data.feelsLike),
    parseInt(data.humidity),
    parseFloat(data.windSpeed),
    data.windDir,
    data.text,
    data.icon,
    null, 0,
    parseFloat(data.pressure),
    isCached ? 1 : 0
  );
}

function startMockWeather(): void {
  // 模拟天气数据
  setInterval(() => {
    const mockData = {
      temp: String((15 + Math.random() * 15).toFixed(1)),
      feelsLike: String((12 + Math.random() * 18).toFixed(1)),
      humidity: String(Math.floor(40 + Math.random() * 40)),
      windSpeed: String((Math.random() * 10).toFixed(1)),
      windDir: ['北','东北','东','东南','南','西南','西','西北'][Math.floor(Math.random()*8)],
      text: ['晴','多云','阴','小雨'][Math.floor(Math.random()*4)],
      icon: '100',
      pressure: String((1000 + Math.random() * 20).toFixed(0)),
    };
    saveWeatherSnapshot(mockData, true);
  }, 30 * 60 * 1000);
}

export function stopWeatherService(): void {
  if (cacheTimer) {
    clearInterval(cacheTimer);
    cacheTimer = null;
  }
}

/** 获取最新天气 */
export function getCurrentWeather(): any {
  return getDb().prepare('SELECT * FROM weather_snapshot ORDER BY id DESC LIMIT 1').get();
}
