/**
 * WebSocket 对外接口 — 持续推送世界完整环境状态 + 全维度感知快照
 */
import { WebSocketServer, WebSocket } from 'ws';
import { log } from '../common/utils';
import { getWorldTime } from '../natural_env/time_calendar/time_service';
import { getCurrentWeather } from '../natural_env/weather_sensor/weather_service';
import { getSelfState } from '../self_entity/self_entity_service';
import { getIntimacyPerception } from '../perception_seven/intimacy_perception/intimacy_engine';
import { getSexualOrganSnapshot } from '../intimacy_extension/sexual_organ_physiology';
import { buildCompactContext } from '../narrative_encoder';
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

/** 安全JSON解析 */
function safeJson(val: any, fallback: any = null): any {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

/** 构建完整世界快照 */
function buildWorldSnapshot(): any {
  const worldTime = getWorldTime();
  const weather = getCurrentWeather();
  const db = getDb();
  const physio = db.prepare('SELECT * FROM physio_state WHERE id = 1').get();
  const lastSnapshot = db.prepare('SELECT * FROM perception_snapshots ORDER BY id DESC LIMIT 1').get() as any;
  const selfState = getSelfState();
  const intimacy = getIntimacyPerception();
  const sexualOrgans = getSexualOrganSnapshot();
  const chemState = db.prepare('SELECT * FROM chemistry_levels ORDER BY id DESC LIMIT 1').get() as any;
  const sexualDb = db.prepare('SELECT * FROM sexual_organ_state ORDER BY id DESC LIMIT 1').get() as any;
  const scene = db.prepare('SELECT * FROM scene_state ORDER BY id DESC LIMIT 1').get() as any;
  
  // 叙事编码器 — 自然语言世界上下文
  const narrativeContext = buildCompactContext();

  return {
    type: 'world_snapshot',
    timestamp: Date.now(),
    version: '1.0.0',
    
    // ===== 自然语言上下文（太虚境可直接注入对话）=====
    narrative_context: narrativeContext,
    
    // ===== 时间 =====
    time: worldTime ? {
      year: worldTime.year, month: worldTime.month, day: worldTime.day,
      hour: worldTime.hour, minute: worldTime.minute, second: worldTime.second,
      weekday: worldTime.weekday, season: worldTime.season,
      solar_term: worldTime.solar_term, moon_phase: worldTime.moon_phase,
      is_daytime: worldTime.is_daytime === 1,
    } : null,
    
    // ===== 天气 =====
    weather: weather ? {
      temperature: parseFloat(weather.temp), feels_like: parseFloat(weather.feelsLike),
      humidity: parseInt(weather.humidity), wind_speed: parseFloat(weather.windSpeed),
      weather_desc: weather.text, wind_dir: weather.windDir, pressure: parseFloat(weather.pressure),
    } : null,
    
    // ===== 生理状态 =====
    physio: physio ? {
      health_score: (physio as any).health_score,
      fatigue_level: (physio as any).fatigue_level,
      energy_level: (physio as any).energy_level,
      body_temp: (physio as any).body_temp,
      injury: (physio as any).injury_type,
      pregnancy_stage: (physio as any).pregnancy_stage,
    } : null,
    
    // ===== 自我实体（他的身体）=====
    self_entity: selfState ? {
      posture: selfState.posture,
      action: selfState.action,
      gaze_direction: selfState.gaze_direction,
      clothing_state: selfState.clothing_state,
      current_scene: selfState.current_scene,
      energy: selfState.energy,
      fatigue: selfState.fatigue,
      hunger: selfState.hunger,
      mood_baseline: selfState.mood_baseline,
      focus_intensity: selfState.focus_intensity,
      limb_fatigue: selfState.limb_fatigue,
      position: { x: selfState.position_x, y: selfState.position_y, z: selfState.position_z },
    } : null,
    
    // ===== 场景状态 =====
    scene: scene ? {
      current_scene: (scene as any).current_scene,
      sub_area: (scene as any).sub_area,
      is_indoor: (scene as any).is_indoor,
      transit_status: (scene as any).transit_status,
      transit_remaining_sec: (scene as any).transit_remaining_sec,
    } : null,
    
    // ===== 亲密引擎 =====
    intimacy: intimacy ? {
      phase: intimacy.phase || 'idle',
      arousal_level: intimacy.arousal_level || 0,
      orgasm_build_up: intimacy.orgasm_build_up || 0,
      pleasure_intensity: intimacy.pleasure_intensity || 0,
      chemistry: chemState ? {
        dopamine: chemState.dopamine,
        oxytocin: chemState.oxytocin,
        serotonin: chemState.serotonin,
        adrenaline: chemState.adrenaline,
        endorphin: chemState.endorphin,
        estrogen: chemState.estrogen,
      } : null,
      hearing: intimacy.auditory || null,
      body_parts_summary: intimacy.body_parts_summary || null,
    } : null,
    
    // ===== 性器官生理（男女双系统）=====
    sexual_organs: sexualOrgans || null,
    sexual_organ_db: sexualDb ? {
      female_json: safeJson((sexualDb as any).female_json),
      male_json: safeJson((sexualDb as any).male_json),
    } : null,
    
    // ===== 十维感知（P0原有7维）=====
    perception: lastSnapshot ? {
      physical: safeJson(lastSnapshot.physical_perception_json),
      spatial: safeJson(lastSnapshot.spatial_perception_json),
      temporal: safeJson(lastSnapshot.temporal_perception_json),
      work: safeJson(lastSnapshot.work_perception_json),
      life: safeJson(lastSnapshot.life_perception_json),
      world: safeJson(lastSnapshot.world_perception_json),
    } : null,
    
    // ===== P1 上层感知（经济/社交/饮食）=====
    economy: lastSnapshot ? safeJson(lastSnapshot.economic_json) : null,
    social: lastSnapshot ? safeJson(lastSnapshot.social_json) : null,
    diet: lastSnapshot ? safeJson(lastSnapshot.diet_json) : null,
    
    // ===== P2 深度体验（仪式/信息/梦境）=====
    ritual: lastSnapshot ? safeJson(lastSnapshot.rituals_json) : null,
    information: lastSnapshot ? safeJson(lastSnapshot.info_json) : null,
    dream: lastSnapshot ? safeJson(lastSnapshot.dream_json) : null,
    
    // ===== P3 叙事与世界（叙事/三体联动/世界回应）=====
    narrative: lastSnapshot ? safeJson(lastSnapshot.narrative_json) : null,
    tri_body: lastSnapshot ? safeJson(lastSnapshot.tri_body_json) : null,
    world_passive: lastSnapshot ? safeJson(lastSnapshot.world_passive_json) : null,
    
    // ===== C3-C6 人生圈层 =====
    daily_together: lastSnapshot ? safeJson(lastSnapshot.daily_together_json) : null,
    childbirth: lastSnapshot ? safeJson(lastSnapshot.childbirth_json) : null,
    family: lastSnapshot ? safeJson(lastSnapshot.family_json) : null,
    personal_extension: lastSnapshot ? safeJson(lastSnapshot.extension_json) : null,
  };
}

export function stopWebSocketServer(): void {
  if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
  if (wss) { wss.close(); wss = null; }
}
