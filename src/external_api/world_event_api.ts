/**
 * WebSocket 对外接口 — 持续推送世界完整环境状态 + 七维感知快照
 */
import { WebSocketServer, WebSocket } from 'ws';
import { log } from '../common/utils';
import { getWorldTime } from '../natural_env/time_calendar/time_service';
import { getCurrentWeather } from '../natural_env/weather_sensor/weather_service';
import { getDb } from '../common/database';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

let wss: WebSocketServer | null = null;
let pushTimer: NodeJS.Timeout | null = null;

export function startWebSocketServer(): void {
  const configPath = path.resolve(__dirname, '../../config.yaml');
  const cfg = yaml.parse(fs.readFileSync(configPath, 'utf8'));
  const port = cfg.websocket?.port || 9528;

  wss = new WebSocketServer({ port });
  
  wss.on('connection', (ws: WebSocket) => {
    log('WS', '客户端已连接');
    
    // 立即发送完整状态快照
    ws.send(JSON.stringify(buildWorldSnapshot()));

    ws.on('close', () => {
      log('WS', '客户端已断开');
    });

    ws.on('error', (err) => {
      log('WS', `错误: ${err.message}`);
    });
  });

  // 每秒推送世界状态
  pushTimer = setInterval(() => {
    const snapshot = buildWorldSnapshot();
    wss?.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(snapshot));
      }
    });
  }, 1000);

  log('WS', `WebSocket 服务器启动在端口 ${port}`);
}

/** 构建完整世界快照 */
function buildWorldSnapshot(): any {
  const worldTime = getWorldTime();
  const weather = getCurrentWeather();
  const db = getDb();
  const physio = db.prepare('SELECT * FROM physio_state WHERE id = 1').get();
  const lastSnapshot = db.prepare('SELECT * FROM perception_snapshots ORDER BY id DESC LIMIT 1').get();

  return {
    type: 'world_snapshot',
    timestamp: Date.now(),
    time: worldTime ? {
      year: worldTime.year, month: worldTime.month, day: worldTime.day,
      hour: worldTime.hour, minute: worldTime.minute, second: worldTime.second,
      weekday: worldTime.weekday, season: worldTime.season,
      solar_term: worldTime.solar_term, moon_phase: worldTime.moon_phase,
      is_daytime: worldTime.is_daytime === 1,
    } : null,
    weather: weather ? {
      temperature: parseFloat(weather.temp), feels_like: parseFloat(weather.feelsLike),
      humidity: parseInt(weather.humidity), wind_speed: parseFloat(weather.windSpeed),
      weather_desc: weather.text, wind_dir: weather.windDir, pressure: parseFloat(weather.pressure),
    } : null,
    physio: physio ? {
      health_score: (physio as any).health_score,
      fatigue_level: (physio as any).fatigue_level,
      energy_level: (physio as any).energy_level,
      body_temp: (physio as any).body_temp,
      injury: (physio as any).injury_type,
      pregnancy_stage: (physio as any).pregnancy_stage,
    } : null,
    perception: lastSnapshot ? {
      physical: JSON.parse((lastSnapshot as any).physical_perception_json || '{}'),
      spatial: JSON.parse((lastSnapshot as any).spatial_perception_json || '{}'),
      temporal: JSON.parse((lastSnapshot as any).temporal_perception_json || '{}'),
      work: JSON.parse((lastSnapshot as any).work_perception_json || '{}'),
      life: JSON.parse((lastSnapshot as any).life_perception_json || '{}'),
      world: JSON.parse((lastSnapshot as any).world_perception_json || '{}'),
    } : null,
  };
}

export function stopWebSocketServer(): void {
  if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
  if (wss) { wss.close(); wss = null; }
}
