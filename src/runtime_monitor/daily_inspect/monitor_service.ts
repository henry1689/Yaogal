/**
 * 监控服务 — 独立Hook探针 + 每日体检报告（增强版）
 * 
 * 日报涵盖：模块状态表、健康评分、天气摘要、生理摘要、异常统计、趋势对比、优化建议
 */
import { getDb } from '../../common/database';
import { log, nowMs, ensureDir } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';

let hookCleanup: (() => void) | null = null;

// ─── 配置 ───────────────────────────────────────────────

const MODULE_WEIGHTS: Record<string, number> = {
  time:        10,
  weather:     10,
  scene:        8,
  objects:      8,
  physio:      15,
  physics:      5,
  chemistry:    8,
  intimacy:     8,
  perception:  10,
  event_bus:    8,
  hook:         8,
  external:     2,
};

const REPORT_DIR = path.resolve(__dirname, '../../../reports');

// ─── 工具函数 ───────────────────────────────────────────

/** 获取昨日日期字符串 yyyy-mm-dd */
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 获取今日日期字符串 yyyy-mm-dd */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 将安全取值包装为字符串，null/undefined 返回 fallback */
function str(val: any, fallback = 'N/A'): string {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

/** 安全 toFixed */
function fixed(val: any, digits = 1): string {
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
}

/** 状态图标 */
function statusIcon(status: string): string {
  switch (status) {
    case 'RUNNING':   return '🟢';
    case 'WARNING':   return '🟡';
    case 'ERROR':     return '🔴';
    case 'STOPPED':   return '⚫';
    case 'NO_DATA':   return '⚪';
    case 'N/A':       return '⬜';
    default:          return '⚪';
  }
}

// ─── 模块状态检测 ──────────────────────────────────────

interface ModuleStatus {
  status: string;
  detail: string;
  weight: number;
}

function checkAllModules(db: ReturnType<typeof getDb>): Record<string, ModuleStatus> {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ── 时间模块 ──
  const timeRow = db.prepare('SELECT * FROM world_time WHERE id = 1').get() as any;
  const timeStatus: ModuleStatus = {
    status: timeRow ? 'RUNNING' : 'STOPPED',
    detail: timeRow
      ? `${timeRow.year}-${String(timeRow.month).padStart(2,'0')}-${String(timeRow.day).padStart(2,'0')} ${timeRow.season}`
      : '无数据',
    weight: MODULE_WEIGHTS.time,
  };

  // ── 天气模块 ──
  const weatherRow = db.prepare(
    'SELECT * FROM weather_snapshot ORDER BY timestamp_ms DESC LIMIT 1'
  ).get() as any;
  let weatherStatus: ModuleStatus;
  if (!weatherRow) {
    weatherStatus = { status: 'NO_DATA', detail: '无天气快照', weight: MODULE_WEIGHTS.weather };
  } else if (now - weatherRow.timestamp_ms > DAY_MS) {
    weatherStatus = { status: 'WARNING', detail: '数据过期 > 24h', weight: MODULE_WEIGHTS.weather };
  } else {
    weatherStatus = { status: 'RUNNING', detail: `最新: ${weatherRow.weather_desc || 'N/A'}, ${fixed(weatherRow.temperature)}°C`, weight: MODULE_WEIGHTS.weather };
  }

  // ── 场景/物件模块 ──
  const sceneCount = (db.prepare(
    'SELECT COUNT(DISTINCT scene_name) as cnt FROM spatial_objects'
  ).get() as any)?.cnt || 0;
  const objCount = (db.prepare('SELECT COUNT(*) as cnt FROM spatial_objects').get() as any)?.cnt || 0;

  const sceneStatus: ModuleStatus = {
    status: sceneCount > 0 ? 'RUNNING' : 'NO_DATA',
    detail: `${sceneCount} 场景(s)`,
    weight: MODULE_WEIGHTS.scene,
  };

  const objectsStatus: ModuleStatus = {
    status: objCount > 0 ? 'RUNNING' : 'NO_DATA',
    detail: `${objCount} 物件(s)`,
    weight: MODULE_WEIGHTS.objects,
  };

  // ── 生理模块 ──
  const physioRow = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  let physioStatus: ModuleStatus;
  if (!physioRow) {
    physioStatus = { status: 'STOPPED', detail: '无生理数据', weight: MODULE_WEIGHTS.physio };
  } else if (physioRow.health_score < 50) {
    physioStatus = { status: 'ERROR', detail: `健康值低: ${fixed(physioRow.health_score)}`, weight: MODULE_WEIGHTS.physio };
  } else if (physioRow.health_score < 80) {
    physioStatus = { status: 'WARNING', detail: `健康值: ${fixed(physioRow.health_score)}`, weight: MODULE_WEIGHTS.physio };
  } else {
    physioStatus = { status: 'RUNNING', detail: `健康值: ${fixed(physioRow.health_score)}`, weight: MODULE_WEIGHTS.physio };
  }

  // ── 物理模块（无独立表，通过 hook_log 检测物理相关事件） ──
  const physicsEvents = (db.prepare(
    "SELECT COUNT(*) as cnt FROM hook_log WHERE module = 'physics'"
  ).get() as any)?.cnt || 0;
  const physicsStatus: ModuleStatus = {
    status: physicsEvents > 0 ? 'RUNNING' : 'N/A',
    detail: physicsEvents > 0 ? `${physicsEvents} 事件(s) 记录` : '无独立物理表',
    weight: MODULE_WEIGHTS.physics,
  };

  // ── 化学模块 ──
  const chemRow = db.prepare('SELECT * FROM chemistry_levels WHERE id = 1').get() as any;
  const chemStatus: ModuleStatus = {
    status: chemRow ? 'RUNNING' : 'STOPPED',
    detail: chemRow ? `多巴胺:${fixed(chemRow.dopamine)} 血清素:${fixed(chemRow.serotonin)}` : '无数据',
    weight: MODULE_WEIGHTS.chemistry,
  };

  // ── 亲密模块 ──
  const intimacyRow = db.prepare('SELECT * FROM intimacy_state WHERE id = 1').get() as any;
  const intimacyEnabled = intimacyRow?.enabled === 1;
  const intimacyStatus: ModuleStatus = {
    status: intimacyRow ? (intimacyEnabled ? 'RUNNING' : 'STOPPED') : 'NO_DATA',
    detail: intimacyRow
      ? (intimacyEnabled ? `阶段: ${str(intimacyRow.intimacy_stage, '初始')}` : '已禁用')
      : '无数据',
    weight: MODULE_WEIGHTS.intimacy,
  };

  // ── 感知模块 ──
  const perceptionCount = (db.prepare('SELECT COUNT(*) as cnt FROM perception_snapshots').get() as any)?.cnt || 0;
  const perceptionStatus: ModuleStatus = {
    status: perceptionCount > 0 ? 'RUNNING' : 'NO_DATA',
    detail: `${perceptionCount} 快照(s)`,
    weight: MODULE_WEIGHTS.perception,
  };

  // ── 事件总线 ──
  const busEvents = worldBus.getLog(1000);
  const busEventCount = busEvents.length;
  const busRecentEvents = busEvents.slice(-10);
  const busHasRecent = busRecentEvents.length > 0 && (now - busRecentEvents[busRecentEvents.length - 1].timestamp < 300_000); // 5min
  const busStatus: ModuleStatus = {
    status: busHasRecent ? 'RUNNING' : (busEventCount > 0 ? 'WARNING' : 'NO_DATA'),
    detail: `${busEventCount} 事件(s) 在缓存, ${busRecentEvents.length} 最近`,
    weight: MODULE_WEIGHTS.event_bus,
  };

  // ── Hook 探针 ──
  const hookTotal = (db.prepare('SELECT COUNT(*) as cnt FROM hook_log').get() as any)?.cnt || 0;
  const hookStatus: ModuleStatus = {
    status: hookTotal > 0 ? 'RUNNING' : 'NO_DATA',
    detail: `${hookTotal} 条记录`,
    weight: MODULE_WEIGHTS.hook,
  };

  // ── 外部接口（检测天气数据来源） ──
  const externalCached = weatherRow?.is_cached === 1;
  const externalStatus: ModuleStatus = {
    status: weatherRow ? (externalCached ? 'WARNING' : 'RUNNING') : 'NO_DATA',
    detail: externalCached ? '天气数据为缓存（API 可能不可达）' : '天气 API 正常',
    weight: MODULE_WEIGHTS.external,
  };

  return {
    time: timeStatus,
    weather: weatherStatus,
    scene: sceneStatus,
    objects: objectsStatus,
    physio: physioStatus,
    physics: physicsStatus,
    chemistry: chemStatus,
    intimacy: intimacyStatus,
    perception: perceptionStatus,
    event_bus: busStatus,
    hook: hookStatus,
    external: externalStatus,
  };
}

// ─── 健康评分计算 ──────────────────────────────────────

function calculateHealthScore(modules: Record<string, ModuleStatus>): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const m of Object.values(modules)) {
    totalWeight += m.weight;
    switch (m.status) {
      case 'RUNNING':   weightedScore += m.weight * 100; break;
      case 'WARNING':   weightedScore += m.weight * 60;  break;
      case 'ERROR':     weightedScore += m.weight * 25;  break;
      case 'STOPPED':   weightedScore += m.weight * 10;  break;
      case 'NO_DATA':   weightedScore += m.weight * 20;  break;
      case 'N/A':       weightedScore += m.weight * 50;  break;
      default:          weightedScore += m.weight * 30;  break;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedScore / totalWeight);
}

// ─── 天气摘要 ───────────────────────────────────────────

function weatherSummary(db: ReturnType<typeof getDb>): string {
  const latest = db.prepare(
    'SELECT * FROM weather_snapshot ORDER BY timestamp_ms DESC LIMIT 1'
  ).get() as any;
  if (!latest) return '无天气数据。';

  const lines: string[] = [];
  lines.push(`- **天气**: ${latest.weather_desc || '未知'}`);
  lines.push(`- **温度**: ${fixed(latest.temperature)}°C (体感 ${fixed(latest.feels_like)}°C)`);
  lines.push(`- **湿度**: ${str(latest.humidity)}%`);
  lines.push(`- **风速**: ${fixed(latest.wind_speed)} m/s ${str(latest.wind_direction, '')}`);
  if (latest.aqi != null) lines.push(`- **空气质量**: AQI ${latest.aqi}`);
  if (latest.visibility != null) lines.push(`- **能见度**: ${fixed(latest.visibility)} km`);
  lines.push(`- **数据来源**: ${latest.is_cached ? '缓存' : '实时 API'}`);
  return lines.join('\n');
}

// ─── 生理摘要 ───────────────────────────────────────────

function physioSummary(db: ReturnType<typeof getDb>): string {
  const p = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  if (!p) return '无生理数据。';

  const lines: string[] = [];
  lines.push(`- **健康评分**: ${fixed(p.health_score)} / 100`);
  lines.push(`- **疲劳度**: ${fixed(p.fatigue_level)} / 100 (越高越疲劳)`);
  lines.push(`- **精力值**: ${fixed(p.energy_level)} / 100`);
  lines.push(`- **饥饿度**: ${fixed(p.hunger_level)} / 100`);
  lines.push(`- **口渴度**: ${fixed(p.thirst_level)} / 100`);
  lines.push(`- **体温**: ${fixed(p.body_temp)}°C`);
  lines.push(`- **心率**: ${p.heart_rate} bpm`);
  lines.push(`- **呼吸率**: ${p.respiratory_rate} 次/分`);
  lines.push(`- **血压**: ${p.blood_pressure_sys}/${p.blood_pressure_dia} mmHg`);
  lines.push(`- **伤病**: ${p.injury_type || '无'}${p.injury_severity ? ` (严重度: ${p.injury_severity})` : ''}`);
  lines.push(`- **孕期**: ${p.pregnancy_stage || '无'}`);
  return lines.join('\n');
}

// ─── 化学递质摘要 ──────────────────────────────────────

function chemistrySummary(db: ReturnType<typeof getDb>): string {
  const c = db.prepare('SELECT * FROM chemistry_levels WHERE id = 1').get() as any;
  if (!c) return '无化学递质数据。';

  const lines: string[] = [];
  lines.push(`- 多巴胺: ${fixed(c.dopamine)} | 催产素: ${fixed(c.oxytocin)} | 血清素: ${fixed(c.serotonin)}`);
  lines.push(`- 肾上腺素: ${fixed(c.adrenaline)} | 内啡肽: ${fixed(c.endorphin)}`);
  lines.push(`- 雌激素: ${fixed(c.estrogen)} | 睾酮: ${fixed(c.testosterone)}`);
  return lines.join('\n');
}

// ─── 异常统计 ──────────────────────────────────────────

interface AnomalyStats {
  errors: number;
  warnings: number;
  infos: number;
  errorDetails: string[];
  warningDetails: string[];
}

function anomalyStats(db: ReturnType<typeof getDb>, today: string): AnomalyStats {
  const todayStart = new Date(today + 'T00:00:00+08:00').getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const errors = db.prepare(
    "SELECT * FROM hook_log WHERE severity = 'error' AND timestamp_ms >= ? AND timestamp_ms < ?"
  ).all(todayStart, todayEnd) as any[];

  const warnings = db.prepare(
    "SELECT * FROM hook_log WHERE severity = 'warning' AND timestamp_ms >= ? AND timestamp_ms < ?"
  ).all(todayStart, todayEnd) as any[];

  return {
    errors: errors.length,
    warnings: warnings.length,
    infos: (db.prepare(
      "SELECT COUNT(*) as cnt FROM hook_log WHERE severity = 'info' AND timestamp_ms >= ? AND timestamp_ms < ?"
    ).get(todayStart, todayEnd) as any)?.cnt || 0,
    errorDetails: errors.slice(0, 20).map((e: any) => `- [${e.module}] ${e.event}`),
    warningDetails: warnings.slice(0, 20).map((e: any) => `- [${e.module}] ${e.event}`),
  };
}

// ─── 趋势对比 ──────────────────────────────────────────

interface TrendData {
  yesterdayReport: any | null;
  scoreDiff: number | null;
  anomalyDiff: string | null;
}

function trendComparison(db: ReturnType<typeof getDb>, today: string, currentScore: number, currentAnomalies: number): TrendData {
  const yesterday = yesterdayStr();

  // 尝试读取昨日报告
  const yesterdayReport = db.prepare(
    'SELECT * FROM daily_reports WHERE report_date = ?'
  ).get(yesterday) as any;

  // 也尝试从文件读取
  const yesterdayFile = path.join(REPORT_DIR, `${yesterday}-world-report.md`);
  let yesterdayFileExists = false;
  try { yesterdayFileExists = fs.existsSync(yesterdayFile); } catch (_) {}

  let scoreDiff: number | null = null;
  let anomalyDiff: string | null = null;

  if (yesterdayReport) {
    scoreDiff = currentScore - (yesterdayReport.health_score || 0);
    const yesterdayAnomalies = yesterdayReport.anomaly_count || 0;
    const diff = currentAnomalies - yesterdayAnomalies;
    anomalyDiff = diff > 0 ? `+${diff}` : `${diff}`;
  } else if (yesterdayFileExists) {
    // 昨日报告存在但不在数据库中，标记为有历史数据
    scoreDiff = null;
    anomalyDiff = null;
  }

  return {
    yesterdayReport: yesterdayReport || (yesterdayFileExists ? { _fileOnly: true } : null),
    scoreDiff,
    anomalyDiff,
  };
}

// ─── 优化建议 ──────────────────────────────────────────

function generateSuggestions(
  modules: Record<string, ModuleStatus>,
  physio: any,
  anomalies: AnomalyStats
): string[] {
  const suggestions: string[] = [];

  // 模块问题 → 建议
  if (modules.time.status !== 'RUNNING') suggestions.push('⏱️ **时间模块**异常，检查 world_time 表和 time_service 是否运行。');
  if (modules.weather.status === 'NO_DATA') suggestions.push('🌤️ **天气模块**无数据，检查天气 API 连接或手动录入天气快照。');
  if (modules.weather.status === 'WARNING') suggestions.push('🌤️ **天气数据过期**，检查天气采集定时任务是否正常。');
  if (modules.scene.status === 'NO_DATA') suggestions.push('🏠 无场景数据，建议运行 world_init 初始化场景物件。');
  if (modules.physio.status === 'ERROR') suggestions.push('❤️ **生理模块**健康评分过低，检查伤病状态并触发恢复机制。');
  if (modules.physio.status === 'STOPPED') suggestions.push('❤️ **生理模块**未运行，检查 physio_engine 是否启动。');
  if (modules.chemistry.status === 'STOPPED') suggestions.push('🧪 **化学模块**无数据，检查 chemistry_engine 是否初始化。');
  if (modules.intimacy.status === 'STOPPED' && modules.intimacy.detail.includes('禁用')) {
    suggestions.push('💕 亲密模块已禁用，如需启用请设置 intimacy_state.enabled = 1。');
  }
  if (modules.perception.status === 'NO_DATA') suggestions.push('👁️ 无感知快照，检查 perception_engine 是否运行。');
  if (modules.event_bus.status === 'WARNING') suggestions.push('📡 事件总线近期无新事件，检查各模块是否正常 emit。');
  if (modules.external.status === 'WARNING') suggestions.push('🌐 外部 API 数据为缓存，检查网络连接或 API Key 配置。');

  // 生理异常 → 建议
  if (physio) {
    if (physio.fatigue_level > 70) suggestions.push('😴 疲劳度过高 (>{70})，建议触发休息/睡眠行为。');
    if (physio.energy_level < 30) suggestions.push('🔋 精力值过低 (<30)，建议补充能量或休息。');
    if (physio.hunger_level > 60) suggestions.push('🍽️ 饥饿度偏高 (>{60})，建议进食。');
    if (physio.thirst_level > 60) suggestions.push('💧 口渴度偏高 (>{60})，建议饮水。');
    if (physio.injury_type && physio.injury_severity > 0) {
      suggestions.push(`🤕 存在伤病: ${physio.injury_type} (严重度 ${physio.injury_severity})，关注恢复进度。`);
    }
    if (physio.pregnancy_stage && physio.pregnancy_stage !== 'none') {
      suggestions.push(`🤰 孕期阶段: ${physio.pregnancy_stage}，关注孕期事件和倒计时。`);
    }
  }

  // Hook 异常 → 建议
  if (anomalies.errors > 0) {
    suggestions.push(`🚨 今日 ${anomalies.errors} 条 error 日志，建议查看 hook_log 详情排查。`);
  }
  if (anomalies.warnings > 10) {
    suggestions.push(`⚠️ 今日 ${anomalies.warnings} 条 warning 日志，注意潜在问题积累。`);
  }

  // 无异常时
  if (suggestions.length === 0) {
    suggestions.push('✅ 系统运行状态良好，无需特殊关注。');
  }

  return suggestions;
}

// ─── 完整日报生成 ──────────────────────────────────────

/**
 * 生成每日体检报告（Markdown）
 * 返回完整 Markdown 字符串，同时保存到 reports/ 目录和数据库
 */
export function generateDailyReport(): string {
  log('MONITOR', '开始生成每日体检报告...');
  const db = getDb();
  const today = todayStr();

  // 1. 模块状态检测
  const modules = checkAllModules(db);

  // 2. 健康评分
  const healthScore = calculateHealthScore(modules);

  // 3. 异常统计
  const anomalies = anomalyStats(db, today);
  const anomalyCount = anomalies.errors + anomalies.warnings;

  // 4. 趋势对比
  const trend = trendComparison(db, today, healthScore, anomalyCount);

  // 5. 天气
  const weatherMd = weatherSummary(db);

  // 6. 生理
  const physioRow = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  const physioMd = physioSummary(db);

  // 7. 化学递质
  const chemMd = chemistrySummary(db);

  // 8. 优化建议
  const suggestions = generateSuggestions(modules, physioRow, anomalies);

  // ─── 构建 Markdown ───
  const lines: string[] = [];

  lines.push(`# 瑶光 Yaogal 世界日报`);
  lines.push(`**日期**: ${today}`);
  lines.push(`**健康评分**: ${healthScore}/100`);
  lines.push('');

  // 趋势对比
  if (trend.yesterdayReport) {
    const scoreArrow = trend.scoreDiff != null
      ? (trend.scoreDiff > 0 ? '↑' : trend.scoreDiff < 0 ? '↓' : '→')
      : '';
    const anomalyArrow = trend.anomalyDiff != null
      ? (trend.anomalyDiff.startsWith('-') ? '↓' : trend.anomalyDiff === '0' ? '→' : '↑')
      : '';
    lines.push('## 📊 趋势对比（vs 昨日）');
    if (trend.scoreDiff != null) {
      lines.push(`- 健康评分: ${trend.scoreDiff > 0 ? '+' : ''}${trend.scoreDiff} ${scoreArrow}`);
    }
    if (trend.anomalyDiff != null) {
      lines.push(`- 异常数量: ${trend.anomalyDiff} ${anomalyArrow}`);
    }
    if (trend.scoreDiff == null && trend.anomalyDiff == null) {
      lines.push('- 昨日报告已生成但缺少数值对比数据，趋势将从明日开始追踪。');
    }
  } else {
    lines.push('## 📊 趋势对比（vs 昨日）');
    lines.push('- 暂无昨日报告，趋势将从明日开始追踪。');
  }
  lines.push('');

  // 模块状态表
  lines.push('## 📋 模块状态');
  lines.push('| 模块 | 状态 | 详情 |');
  lines.push('|------|------|------|');

  const moduleLabels: Record<string, string> = {
    time:       '⏱️ 时间服务',
    weather:    '🌤️ 天气服务',
    scene:      '🏠 场景管理',
    objects:    '📦 物件管理',
    physio:     '❤️ 生理系统',
    physics:    '⚛️ 物理系统',
    chemistry:  '🧪 化学递质',
    intimacy:   '💕 亲密系统',
    perception: '👁️ 感知系统',
    event_bus:  '📡 事件总线',
    hook:       '🪝 Hook 探针',
    external:   '🌐 外部接口',
  };

  for (const [key, label] of Object.entries(moduleLabels)) {
    const m = modules[key];
    if (m) {
      lines.push(`| ${label} | ${statusIcon(m.status)} ${m.status} | ${m.detail} |`);
    }
  }
  lines.push('');

  // 天气
  lines.push('## 🌤️ 天气摘要');
  lines.push(weatherMd);
  lines.push('');

  // 生理
  lines.push('## ❤️ 生理状态');
  lines.push(physioMd);
  lines.push('');

  // 化学递质
  lines.push('## 🧪 化学递质');
  lines.push(chemMd);
  lines.push('');

  // 异常统计
  lines.push('## 🚨 异常统计');
  lines.push(`- **Error**: ${anomalies.errors} 条`);
  lines.push(`- **Warning**: ${anomalies.warnings} 条`);
  lines.push(`- **Info**: ${anomalies.infos} 条`);
  if (anomalies.errorDetails.length > 0) {
    lines.push('');
    lines.push('### 今日 Error 详情');
    for (const e of anomalies.errorDetails) lines.push(e);
  }
  if (anomalies.warningDetails.length > 0) {
    lines.push('');
    lines.push('### 今日 Warning 详情');
    for (const w of anomalies.warningDetails) lines.push(w);
  }
  lines.push('');

  // 优化建议
  lines.push('## 💡 优化建议');
  for (const sug of suggestions) lines.push(sug);
  lines.push('');

  // 页脚
  lines.push('---');
  lines.push(`*由 瑶光 Yaogal 监控服务自动生成 · ${new Date().toISOString()}*`);

  const reportMd = lines.join('\n');

  // ─── 写入文件 ───
  ensureDir(REPORT_DIR);
  const reportPath = path.join(REPORT_DIR, `${today}-world-report.md`);
  fs.writeFileSync(reportPath, reportMd, 'utf8');

  // ─── 存入数据库 ───
  const existing = db.prepare('SELECT id FROM daily_reports WHERE report_date = ?').get(today);
  if (existing) {
    db.prepare(`
      UPDATE daily_reports
      SET health_score = ?, module_status_json = ?, anomaly_count = ?, 
          trend_notes = ?, full_report_md = ?, created_at = datetime('now')
      WHERE report_date = ?
    `).run(
      healthScore,
      JSON.stringify(modules),
      anomalyCount,
      JSON.stringify({ scoreDiff: trend.scoreDiff, anomalyDiff: trend.anomalyDiff }),
      reportMd,
      today
    );
  } else {
    db.prepare(`
      INSERT INTO daily_reports (report_date, health_score, module_status_json, anomaly_count, trend_notes, full_report_md, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      today,
      healthScore,
      JSON.stringify(modules),
      anomalyCount,
      JSON.stringify({ scoreDiff: trend.scoreDiff, anomalyDiff: trend.anomalyDiff }),
      reportMd
    );
  }

  log('MONITOR', `每日报告已生成: ${reportPath} (评分: ${healthScore})`);
  worldBus.emit(WorldEvents.DAILY_REPORT_READY, { path: reportPath, score: healthScore });

  return reportMd;
}

// ─── 定时器 ─────────────────────────────────────────────

let reportJob: cron.ScheduledTask | null = null;

/**
 * 启动每日报告定时器
 * 默认每日凌晨 01:00 (Asia/Shanghai) 触发
 * 在 startMonitorService() 中自动调用，也可独立调用
 */
export function scheduleDailyReport(cronExpr: string = '0 1 * * *', timezone: string = 'Asia/Shanghai'): void {
  if (reportJob) {
    reportJob.stop();
    reportJob = null;
  }
  reportJob = cron.schedule(cronExpr, () => {
    generateDailyReport();
  }, { timezone });
  log('MONITOR', `每日报告定时已设置: ${cronExpr} ${timezone}`);
}

// ─── 监控服务生命周期 ───────────────────────────────────

function logHook(module: string, event: string, severity: string, detail?: any): void {
  getDb().prepare(`
    INSERT INTO hook_log (timestamp_ms, module, event, severity, detail_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(nowMs(), module, event, severity, detail ? JSON.stringify(detail) : null);
}

export function startMonitorService(): void {
  log('MONITOR', '监控服务启动...');

  // 注册全局 Hook 探针
  hookCleanup = worldBus.on('*', (payload) => {
    // 所有事件都记录到 hook_log
    // 简化：通过逐个订阅关键事件
  });

  // 订阅关键事件
  worldBus.on(WorldEvents.MODULE_ERROR, (payload) => {
    logHook('system', 'module_error', 'error', payload);
  });

  worldBus.on(WorldEvents.HEALTH_STATE_CHANGED, (payload) => {
    logHook('creature_law', 'health_changed', 'warning', payload);
  });

  worldBus.on(WorldEvents.WEATHER_WARNING, (payload) => {
    logHook('natural_env', 'weather_warning', 'warning', payload);
  });

  worldBus.on(WorldEvents.PHYSIO_TICK, () => {
    // 每5秒的生理tick，记录在内存，每10分钟落盘一次
  });

  // 启动每日报告定时器：每天凌晨 01:00
  scheduleDailyReport();

  log('MONITOR', '每日报告定时: 01:00 Asia/Shanghai');
}

export function stopMonitorService(): void {
  if (hookCleanup) {
    hookCleanup();
    hookCleanup = null;
  }
  if (reportJob) {
    reportJob.stop();
    reportJob = null;
  }
}

/** 手动触发报告生成（向后兼容） */
export { generateDailyReport as manualReport };
