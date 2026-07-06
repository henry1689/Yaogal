/**
 * 监控服务 — 独立Hook探针 + 每日体检报告
 */
import { getDb } from '../../common/database';
import { log, nowMs, ensureDir } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';

let hookCleanup: (() => void) | null = null;
let reportJob: cron.ScheduledTask | null = null;

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

  // 定时生成每日报告：每天凌晨 01:00
  reportJob = cron.schedule('0 1 * * *', () => {
    generateDailyReport();
  }, {
    timezone: 'Asia/Shanghai',
  });

  log('MONITOR', '每日报告定时: 01:00 Asia/Shanghai');
}

function logHook(module: string, event: string, severity: string, detail?: any): void {
  getDb().prepare(`
    INSERT INTO hook_log (timestamp_ms, module, event, severity, detail_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(nowMs(), module, event, severity, detail ? JSON.stringify(detail) : null);
}

/** 生成每日体检报告 */
export function generateDailyReport(): string {
  log('MONITOR', '开始生成每日体检报告...');
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // 收集各模块状态
  const timeState = db.prepare('SELECT * FROM world_time WHERE id = 1').get() as any;
  const weatherCount = (db.prepare('SELECT COUNT(*) as cnt FROM weather_snapshot').get() as any)?.cnt || 0;
  const physioState = db.prepare('SELECT * FROM physio_state WHERE id = 1').get() as any;
  const hookErrors = (db.prepare("SELECT COUNT(*) as cnt FROM hook_log WHERE severity = 'error'").get() as any)?.cnt || 0;
  const hookWarnings = (db.prepare("SELECT COUNT(*) as cnt FROM hook_log WHERE severity = 'warning'").get() as any)?.cnt || 0;
  const perceptionCount = (db.prepare('SELECT COUNT(*) as cnt FROM perception_snapshots').get() as any)?.cnt || 0;

  // 健康评分
  let healthScore = 100;
  if (!timeState) healthScore -= 30;
  if (weatherCount === 0) healthScore -= 10;
  if (physioState?.health_score < 80) healthScore -= 15;
  if (hookErrors > 0) healthScore -= hookErrors * 5;
  if (hookWarnings > 5) healthScore -= 5;

  const moduleStatus = {
    time: timeState ? 'RUNNING' : 'STOPPED',
    weather: weatherCount > 0 ? 'RUNNING' : 'NO_DATA',
    physio: physioState ? 'RUNNING' : 'STOPPED',
    perception: perceptionCount > 0 ? 'RUNNING' : 'NO_DATA',
    hooks: `${hookErrors} errors / ${hookWarnings} warnings`,
  };

  const reportMd = `# PersonalWorld 每日体检报告
**日期**: ${today}
**健康评分**: ${healthScore}/100

## 模块状态
| 模块 | 状态 |
|------|------|
| 时间服务 | ${moduleStatus.time} |
| 天气服务 | ${moduleStatus.weather} |
| 生理服务 | ${moduleStatus.physio} |
| 感知系统 | ${moduleStatus.perception} |
| 异常统计 | ${moduleStatus.hooks} |

## 生理快照
- 健康值: ${physioState?.health_score || 'N/A'}
- 疲劳度: ${physioState?.fatigue_level?.toFixed(1) || 'N/A'}
- 精力值: ${physioState?.energy_level?.toFixed(1) || 'N/A'}
- 伤病: ${physioState?.injury_type || '无'}
- 孕期: ${physioState?.pregnancy_stage || '无'}

## 当前时间
- 公历: ${timeState?.year || '?'}-${timeState?.month || '?'}-${timeState?.day || '?'}
- 季节: ${timeState?.season || '?'}
- 节气: ${timeState?.solar_term || '无'}
- 月相: ${timeState?.moon_phase || '?'}
`;

  // 写入文件
  const reportDir = path.resolve(__dirname, '../../../reports');
  ensureDir(reportDir);
  const reportPath = path.join(reportDir, `report_${today}.md`);
  fs.writeFileSync(reportPath, reportMd, 'utf8');

  // 存入数据库
  db.prepare(`
    INSERT OR REPLACE INTO daily_reports (report_date, health_score, module_status_json, anomaly_count, full_report_md, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(today, healthScore, JSON.stringify(moduleStatus), hookErrors + hookWarnings, reportMd);

  log('MONITOR', `每日报告已生成: ${reportPath} (评分: ${healthScore})`);
  worldBus.emit(WorldEvents.DAILY_REPORT_READY, { path: reportPath, score: healthScore });

  return reportMd;
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

/** 手动触发报告生成 */
export { generateDailyReport as manualReport };
