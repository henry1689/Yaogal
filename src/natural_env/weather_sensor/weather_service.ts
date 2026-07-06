/**
 * 天气服务 — 和风天气 JWT Ed25519 认证
 * 
 * 认证: JWT Ed25519 (取代传统 API Key)
 * 接口: /v7/weather/now, /v7/weather/3d, /v7/warning/now
 * 缓存: 30分钟 / 夜间休眠 / 限流
 */
import axios from 'axios';
import { sign, createPrivateKey } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { getDb } from '../../common/database';
import { log, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

interface WeatherConfig {
  jwt_kid: string;            // 凭据ID
  jwt_sub: string;            // 项目ID
  jwt_private_key_path: string; // Ed25519 私钥路径
  api_host: string;           // API域名
  city_id: string;            // 城市 LocationID
  cache_ttl_minutes: number;
  night_quiet_hours: string;
  rate_limit_per_hour: number;
}

interface QWeatherNow {
  obsTime: string;
  temp: string;
  feelsLike: string;
  icon: string;
  text: string;
  wind360: string;
  windDir: string;
  windScale: string;
  windSpeed: string;
  humidity: string;
  precip: string;
  pressure: string;
  vis: string;
  cloud: string;
  dew: string;
}

interface QWeatherWarning {
  id: string;
  sender: string;
  pubTime: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  level: string;
  type: string;
  typeName: string;
  text: string;
  related: string;
}

let config: WeatherConfig;
let cacheTimer: NodeJS.Timeout | null = null;
let requestCount = 0;
let resetHour = new Date().getHours();
let cachedNow: QWeatherNow | null = null;
let cachedForecast: any | null = null;
let cachedWarnings: QWeatherWarning[] = [];
let lastFetchMs = 0;

// ============================================================
// JWT 生成
// ============================================================

function generateJWT(): string {
  const privPem = fs.readFileSync(config.jwt_private_key_path, 'utf-8');
  const header = { alg: 'EdDSA', kid: config.jwt_kid };
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 900; // 15分钟有效期
  const payload = { sub: config.jwt_sub, iat, exp };

  const msg =
    Buffer.from(JSON.stringify(header)).toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(payload)).toString('base64url');

  const pk = createPrivateKey(privPem);
  const sig = sign(null, Buffer.from(msg), pk).toString('base64url');

  return msg + '.' + sig;
}

// ============================================================
// 配置加载
// ============================================================

function loadConfig(): WeatherConfig {
  const configPath = path.resolve(__dirname, '../../../config.yaml');
  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = yaml.parse(raw);
  return cfg.weather;
}

// ============================================================
// 限流 & 夜休检查
// ============================================================

function isRateLimited(): boolean {
  const hour = new Date().getHours();
  if (hour !== resetHour) {
    requestCount = 0;
    resetHour = hour;
  }
  return requestCount >= config.rate_limit_per_hour;
}

function isNightQuiet(): boolean {
  const hour = new Date().getHours();
  const [quietStart, quietEnd] = config.night_quiet_hours.split('-').map(Number);
  return hour >= quietStart || hour < quietEnd;
}

function isCacheValid(): boolean {
  return (nowMs() - lastFetchMs) < config.cache_ttl_minutes * 60 * 1000;
}

// ============================================================
// API 调用
// ============================================================

async function apiGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const jwt = generateJWT();
  const url = `${config.api_host}${endpoint}`;
  
  const res = await axios.get(url, {
    params: params || {},
    headers: { Authorization: `Bearer ${jwt}` },
    timeout: 5000,
  });
  
  if (res.data?.code !== '200') {
    throw new Error(`API ${endpoint}: code=${res.data?.code}`);
  }
  
  return res.data as T;
}

// ============================================================
// 三个核心接口
// ============================================================

async function fetchWeatherNow(): Promise<QWeatherNow | null> {
  if (isRateLimited() || isNightQuiet()) return null;
  try {
    requestCount++;
    const data = await apiGet<any>('/v7/weather/now', { location: config.city_id });
    return data.now as QWeatherNow;
  } catch (err: any) {
    log('WEATHER', `now 获取失败: ${err.message}`);
    return null;
  }
}

async function fetchForecast3d(): Promise<any | null> {
  if (isRateLimited() || isNightQuiet()) return null;
  try {
    requestCount++;
    const data = await apiGet<any>('/v7/weather/3d', { location: config.city_id });
    return data.daily;
  } catch (err: any) {
    log('WEATHER', `forecast 获取失败: ${err.message}`);
    return null;
  }
}

async function fetchWarnings(): Promise<QWeatherWarning[]> {
  if (isRateLimited()) return [];
  try {
    requestCount++;
    const data = await apiGet<any>('/v7/warning/now', { location: config.city_id });
    return (data.warning || []) as QWeatherWarning[];
  } catch (err: any) {
    // 无预警时 API 可能返回 204 或无 warning 字段，正常
    return [];
  }
}

// ============================================================
// 天气获取主逻辑
// ============================================================

async function fullFetch(): Promise<void> {
  if (isCacheValid()) return; // 缓存未过期

  const now = await fetchWeatherNow();
  if (now) {
    cachedNow = now;
    lastFetchMs = nowMs();
    saveWeatherSnapshot(now, false);
    worldBus.emit(WorldEvents.WEATHER_UPDATED, now);
    log('WEATHER', `实时: ${now.temp}°C(${now.feelsLike}°) ${now.text} 湿${now.humidity}% ${now.windDir}${now.windScale}级`);
  }

  const fc = await fetchForecast3d();
  if (fc) {
    cachedForecast = fc;
    saveForecastSnapshot(fc);
  }

  const warnings = await fetchWarnings();
  if (warnings.length > 0) {
    cachedWarnings = warnings;
    saveWarningSnapshots(warnings);
    log('WEATHER', `⚠️ 预警: ${warnings.map(w => w.typeName).join(', ')}`);
  }
}

// ============================================================
// 数据库持久化
// ============================================================

function saveWeatherSnapshot(data: QWeatherNow, isCached: boolean): void {
  getDb().prepare(`
    INSERT INTO weather_snapshot (timestamp_ms, temperature, feels_like, humidity, wind_speed, wind_direction, weather_desc, weather_icon, aqi, visibility, pressure, precip, cloud, dew_point, is_cached)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nowMs(),
    parseFloat(data.temp),
    parseFloat(data.feelsLike),
    parseInt(data.humidity),
    parseFloat(data.windSpeed),
    data.windDir,
    data.text,
    data.icon,
    null, // AQI 需要单独接口
    parseFloat(data.vis),
    parseFloat(data.pressure),
    parseFloat(data.precip),
    data.cloud || null,
    parseFloat(data.dew),
    isCached ? 1 : 0
  );
}

function saveForecastSnapshot(daily: any[]): void {
  const stmt = getDb().prepare(`
    INSERT INTO weather_forecast (timestamp_ms, day_offset, temp_max, temp_min, day_text, night_text, wind_dir_day, wind_scale_day, humidity, precip, uv_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  daily.forEach((d: any, i: number) => {
    stmt.run(nowMs(), i, d.tempMax, d.tempMin, d.textDay, d.textNight, d.windDirDay, d.windScaleDay, d.humidity, d.precip, d.uvIndex);
  });
}

function saveWarningSnapshots(warnings: QWeatherWarning[]): void {
  const stmt = getDb().prepare(`
    INSERT INTO weather_warnings (timestamp_ms, warning_id, title, level, type_name, text, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  warnings.forEach(w => {
    stmt.run(nowMs(), w.id, w.title, w.level, w.typeName, w.text, w.startTime, w.endTime);
  });
}

// ============================================================
// 启动 / 停止
// ============================================================

export function startWeatherService(): void {
  config = loadConfig();

  if (!config.jwt_kid || !config.jwt_sub) {
    log('WEATHER', '⚠️ JWT 凭据未配置，使用模拟数据');
    startMockWeather();
    return;
  }

  if (!fs.existsSync(config.jwt_private_key_path)) {
    log('WEATHER', `⚠️ 私钥文件不存在: ${config.jwt_private_key_path}，使用模拟数据`);
    startMockWeather();
    return;
  }

  log('WEATHER', `JWT认证启动 (city=${config.city_id}, cache=${config.cache_ttl_minutes}min, host=${config.api_host})`);

  // 首次获取
  fullFetch();

  // 定时刷新
  cacheTimer = setInterval(() => {
    lastFetchMs = 0; // 强制刷新
    fullFetch();
  }, config.cache_ttl_minutes * 60 * 1000);
}

function startMockWeather(): void {
  log('WEATHER', '启动模拟模式');
  setInterval(() => {
    const mockNow: QWeatherNow = {
      obsTime: new Date().toISOString(),
      temp: (15 + Math.random() * 15).toFixed(1),
      feelsLike: (12 + Math.random() * 18).toFixed(1),
      humidity: String(Math.floor(40 + Math.random() * 40)),
      windSpeed: (Math.random() * 10).toFixed(1),
      windDir: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.floor(Math.random() * 8)],
      text: ['晴', '多云', '阴', '小雨'][Math.floor(Math.random() * 4)],
      icon: '100',
      pressure: (1000 + Math.random() * 20).toFixed(0),
      wind360: String(Math.floor(Math.random() * 360)),
      windScale: String(Math.floor(Math.random() * 6)),
      precip: '0.0',
      vis: String(10 + Math.random() * 15),
      cloud: String(Math.floor(Math.random() * 100)),
      dew: (5 + Math.random() * 10).toFixed(1),
    };
    cachedNow = mockNow;
    lastFetchMs = nowMs();
    saveWeatherSnapshot(mockNow, true);
  }, 30 * 60 * 1000);
}

export function stopWeatherService(): void {
  if (cacheTimer) {
    clearInterval(cacheTimer);
    cacheTimer = null;
  }
}

// ============================================================
// 查询接口
// ============================================================

export function getCurrentWeather(): QWeatherNow | null {
  return cachedNow;
}

export function getForecast3d(): any | null {
  return cachedForecast;
}

export function getActiveWarnings(): QWeatherWarning[] {
  return cachedWarnings;
}

/** 检查 JWT 配置是否完整 */
export function isApiAvailable(): boolean {
  try {
    if (!config) config = loadConfig();
    return !!(config.jwt_kid && config.jwt_sub && fs.existsSync(config.jwt_private_key_path));
  } catch {
    return false;
  }
}

/** 城市ID查询（用于用户输入城市名获取LocationID） */
export async function cityLookup(cityName: string): Promise<{ id: string; name: string }[]> {
  try {
    const data = await apiGet<any>('/v2/city/lookup', { location: cityName });
    return (data.location || []).map((l: any) => ({ id: l.id, name: `${l.name}, ${l.adm1}, ${l.country}` }));
  } catch (err: any) {
    log('WEATHER', `城市查询失败: ${err.message}`);
    return [];
  }
}
