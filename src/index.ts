/**
 * PersonalWorld 主入口
 * 初始化所有模块，启动世界运转
 */
import { log } from './common/utils';
import { startTimeService } from './natural_env/time_calendar/time_service';
import { startWeatherService } from './natural_env/weather_sensor/weather_service';
import { startPhysioService } from './creature_law/human_physio/physio_service';
import { startMonitorService } from './runtime_monitor/daily_inspect/monitor_service';
import { startPerceptionService } from './perception_seven/perception_service';
import { startWebSocketServer } from './external_api/world_event_api';
import { startHttpServer } from './external_api/action_handle';
import { initDatabase } from './common/database';

async function main() {
  log('BOOT', '========================================');
  log('BOOT', '  PersonalWorld 个人专属世界模型 v0.1.0');
  log('BOOT', '  启动时间: ' + new Date().toISOString());
  log('BOOT', '========================================');

  // 1. 初始化数据库
  log('BOOT', '初始化数据库...');
  await initDatabase();

  // 2. 启动时间服务（核心时钟）
  log('BOOT', '启动时间服务...');
  startTimeService();

  // 3. 启动天气服务
  log('BOOT', '启动天气服务...');
  startWeatherService();

  // 4. 启动生理服务
  log('BOOT', '启动生理服务...');
  startPhysioService();

  // 5. 启动七维感知服务（含亲密引擎）
  log('BOOT', '启动七维感知服务...');
  startPerceptionService();

  // 6. 启动监控服务
  log('BOOT', '启动监控服务...');
  startMonitorService();

  // 7. 启动对外接口
  log('BOOT', '启动 WebSocket 服务器...');
  startWebSocketServer();

  log('BOOT', '启动 HTTP 行为接口...');
  startHttpServer();

  log('BOOT', 'PersonalWorld 全部模块启动完成');
  log('BOOT', '世界开始运转...');
}

main().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
