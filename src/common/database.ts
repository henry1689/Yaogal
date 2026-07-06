/**
 * SQLite 数据库初始化与管理
 */
import Database from 'better-sqlite3';
import * as path from 'path';
import { ensureDir, getDataDir, log } from './utils';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return db;
}

export function initDatabase(): void {
  const dataDir = getDataDir();
  ensureDir(dataDir);

  const dbPath = path.join(dataDir, 'world_runtime.db');
  log('DB', '打开数据库: ' + dbPath);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  log('DB', '数据库初始化完成');
}

function createTables(): void {
  const d = db!;

  // ===== 表：世界时间 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS world_time (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tick_count INTEGER NOT NULL DEFAULT 0,
      sim_timestamp_ms INTEGER NOT NULL,
      real_timestamp_ms INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      second INTEGER NOT NULL,
      weekday INTEGER NOT NULL,
      season TEXT NOT NULL,
      solar_term TEXT,
      lunar_month INTEGER,
      lunar_day INTEGER,
      moon_phase TEXT,
      is_daytime INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // 确保只有一行
  d.exec(`INSERT OR IGNORE INTO world_time (id, sim_timestamp_ms, real_timestamp_ms, year, month, day, hour, minute, second, weekday, season, is_daytime) VALUES (1, 0, 0, 2026, 1, 1, 0, 0, 0, 0, 'winter', 0)`);

  // ===== 表：天气快照 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS weather_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_ms INTEGER NOT NULL,
      temperature REAL,
      feels_like REAL,
      humidity INTEGER,
      wind_speed REAL,
      wind_direction TEXT,
      weather_desc TEXT,
      weather_icon TEXT,
      aqi INTEGER,
      visibility REAL,
      pressure REAL,
      precip REAL DEFAULT 0,
      cloud TEXT,
      dew_point REAL,
      is_cached INTEGER NOT NULL DEFAULT 0
    )
  `);

  // ===== 表：天气预报（3天） =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS weather_forecast (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_ms INTEGER NOT NULL,
      day_offset INTEGER NOT NULL,
      temp_max REAL,
      temp_min REAL,
      day_text TEXT,
      night_text TEXT,
      wind_dir_day TEXT,
      wind_scale_day TEXT,
      humidity INTEGER,
      precip REAL,
      uv_index INTEGER
    )
  `);

  // ===== 表：灾害预警 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS weather_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_ms INTEGER NOT NULL,
      warning_id TEXT NOT NULL,
      title TEXT,
      level TEXT,
      type_name TEXT,
      text TEXT,
      start_time TEXT,
      end_time TEXT
    )
  `);

  // ===== 表：场景物件状态 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS spatial_objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_name TEXT NOT NULL,
      object_id TEXT NOT NULL UNIQUE,
      object_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      pos_x REAL NOT NULL DEFAULT 0,
      pos_y REAL NOT NULL DEFAULT 0,
      pos_z REAL NOT NULL DEFAULT 0,
      state_json TEXT NOT NULL DEFAULT '{}',
      last_interaction_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ===== 表：生理状态 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS physio_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      health_score REAL NOT NULL DEFAULT 100,
      fatigue_level REAL NOT NULL DEFAULT 0,
      energy_level REAL NOT NULL DEFAULT 100,
      hunger_level REAL NOT NULL DEFAULT 0,
      thirst_level REAL NOT NULL DEFAULT 0,
      body_temp REAL NOT NULL DEFAULT 36.5,
      heart_rate INTEGER NOT NULL DEFAULT 72,
      respiratory_rate INTEGER NOT NULL DEFAULT 16,
      blood_pressure_sys INTEGER NOT NULL DEFAULT 120,
      blood_pressure_dia INTEGER NOT NULL DEFAULT 80,
      injury_type TEXT,
      injury_severity INTEGER DEFAULT 0,
      injury_start_ms INTEGER,
      injury_heal_by_ms INTEGER,
      pregnancy_stage TEXT,
      pregnancy_start_ms INTEGER,
      pregnancy_due_ms INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  d.exec(`INSERT OR IGNORE INTO physio_state (id) VALUES (1)`);

  // ===== 表：化学递质 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS chemistry_levels (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      dopamine REAL NOT NULL DEFAULT 50,
      oxytocin REAL NOT NULL DEFAULT 30,
      serotonin REAL NOT NULL DEFAULT 50,
      adrenaline REAL NOT NULL DEFAULT 10,
      endorphin REAL NOT NULL DEFAULT 20,
      estrogen REAL NOT NULL DEFAULT 50,
      testosterone REAL NOT NULL DEFAULT 50,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  d.exec(`INSERT OR IGNORE INTO chemistry_levels (id) VALUES (1)`);

  // ===== 表：感知快照 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS perception_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_ms INTEGER NOT NULL,
      physical_perception_json TEXT NOT NULL DEFAULT '{}',
      spatial_perception_json TEXT NOT NULL DEFAULT '{}',
      temporal_perception_json TEXT NOT NULL DEFAULT '{}',
      work_perception_json TEXT NOT NULL DEFAULT '{}',
      life_perception_json TEXT NOT NULL DEFAULT '{}',
      world_perception_json TEXT NOT NULL DEFAULT '{}',
      intimacy_perception_json TEXT
    )
  `);

  // ===== 表：亲密状态（加密存储预留） =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS intimacy_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      arousal_level REAL NOT NULL DEFAULT 0,
      intimacy_stage TEXT,
      touch_state_json TEXT,
      behavior_log_json TEXT,
      preference_model_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  d.exec(`INSERT OR IGNORE INTO intimacy_state (id) VALUES (1)`);

  // ===== 表：Hook 日志 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS hook_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_ms INTEGER NOT NULL,
      module TEXT NOT NULL,
      event TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      detail_json TEXT
    )
  `);

  // ===== 表：自我实体状态 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS self_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      posture TEXT NOT NULL DEFAULT 'sit',
      action TEXT NOT NULL DEFAULT 'idle',
      gaze_direction TEXT DEFAULT 'forward',
      clothing_state TEXT DEFAULT 'casual',
      limb_fatigue_json TEXT DEFAULT '{}',
      current_scene TEXT NOT NULL DEFAULT 'home',
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      position_z REAL DEFAULT 0,
      facing REAL DEFAULT 0,
      velocity REAL DEFAULT 0,
      focus_target TEXT DEFAULT NULL,
      focus_intensity REAL DEFAULT 0.5,
      distraction_threshold REAL DEFAULT 0.3,
      energy REAL DEFAULT 100,
      fatigue REAL DEFAULT 0,
      hunger REAL DEFAULT 0,
      mood_baseline REAL DEFAULT 50,
      health REAL DEFAULT 100,
      last_behavior TEXT DEFAULT NULL,
      state_tags TEXT DEFAULT NULL
    )
  `);

  // ===== 表：每日体检报告 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL UNIQUE,
      health_score REAL,
      module_status_json TEXT,
      anomaly_count INTEGER DEFAULT 0,
      trend_notes TEXT,
      full_report_md TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ===== P1 表：经济感知 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS economic_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      net_worth REAL NOT NULL DEFAULT 50000,
      daily_spend REAL NOT NULL DEFAULT 0,
      monthly_income REAL NOT NULL DEFAULT 0,
      monthly_expense REAL NOT NULL DEFAULT 0,
      financial_security REAL NOT NULL DEFAULT 70,
      desire_tension REAL NOT NULL DEFAULT 30,
      consumption_records_json TEXT DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  d.exec(`INSERT OR IGNORE INTO economic_state (id) VALUES (1)`);

  // ===== P1 表：社交状态 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS social_state (
      node_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      warmth REAL NOT NULL DEFAULT 50,
      energy REAL NOT NULL DEFAULT 50,
      last_contact INTEGER NOT NULL,
      contact_frequency INTEGER NOT NULL DEFAULT 7,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ===== P1 表：饮食状态 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS diet_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hunger REAL NOT NULL DEFAULT 30,
      satiety REAL NOT NULL DEFAULT 70,
      last_meal_time INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    )
  `);
  d.exec(`INSERT OR IGNORE INTO diet_state (id, ts) VALUES (1, unixepoch())`);

  d.exec(`
    CREATE TABLE IF NOT EXISTS diet_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      hunger_before REAL NOT NULL,
      hunger_after REAL NOT NULL,
      taste_profile TEXT NOT NULL DEFAULT '{}',
      satisfaction REAL NOT NULL,
      ts INTEGER NOT NULL
    )
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS taste_preferences (
      taste TEXT PRIMARY KEY,
      weight REAL NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ===== P2 表：仪式与习惯 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS ritual_state (
      ritual_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_executed INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS habit_track (
      habit_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      last_check INTEGER NOT NULL DEFAULT 0,
      total_completions INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ===== P2 表：梦境日志 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS dream_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      rem_cycle INTEGER NOT NULL,
      content TEXT NOT NULL,
      emotion_tags TEXT NOT NULL DEFAULT '[]',
      vividness REAL NOT NULL DEFAULT 50,
      remembered INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    )
  `);

  // ===== P3 表：叙事引擎 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS event_log (
      event_id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      valence TEXT NOT NULL DEFAULT 'neutral',
      intensity REAL NOT NULL DEFAULT 50,
      ts INTEGER NOT NULL
    )
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS daily_narrative (
      date TEXT PRIMARY KEY,
      mood_tone TEXT NOT NULL,
      theme TEXT NOT NULL,
      highlight TEXT NOT NULL,
      lesson TEXT NOT NULL DEFAULT '',
      event_count INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL DEFAULT 0
    )
  `);

  // ===== P3 表：世界被动回应 =====
  d.exec(`
    CREATE TABLE IF NOT EXISTS env_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      air_quality REAL NOT NULL DEFAULT 85,
      natural_light REAL NOT NULL DEFAULT 80,
      room_tidiness REAL NOT NULL DEFAULT 75,
      indoor_humidity REAL NOT NULL DEFAULT 55,
      dust_level REAL NOT NULL DEFAULT 15,
      clutter_level REAL NOT NULL DEFAULT 20,
      plant_health REAL NOT NULL DEFAULT 90,
      ts INTEGER NOT NULL
    )
  `);
  d.exec(`INSERT OR IGNORE INTO env_state (id, ts) VALUES (1, unixepoch())`);

  // P1/P2/P3 扩展列（感知快照表）
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN economic_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN social_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN diet_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN rituals_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN info_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN dream_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN narrative_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN tri_body_json TEXT`);
  d.exec(`ALTER TABLE perception_snapshots ADD COLUMN world_passive_json TEXT`);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log('DB', '数据库已关闭');
  }
}
