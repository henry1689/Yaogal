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
      is_cached INTEGER NOT NULL DEFAULT 0
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
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log('DB', '数据库已关闭');
  }
}
