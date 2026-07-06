/**
 * HTTP 行为接口 — 接收外部行为意图，世界独立演算结果返回
 */
import express from 'express';
import { log } from '../common/utils';
import { applyInjury, startPregnancy } from '../creature_law/human_physio/physio_service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

let app: express.Application | null = null;
let server: any = null;

export function startHttpServer(): void {
  const configPath = path.resolve(__dirname, '../../config.yaml');
  const cfg = yaml.parse(fs.readFileSync(configPath, 'utf8'));
  const port = cfg.http?.port || 9529;

  app = express();
  app.use(express.json({ limit: '1mb' }));

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 行为接口：接收外部意图
  app.post('/action', (req, res) => {
    const { action, params } = req.body;
    log('HTTP', `收到行为请求: ${action}`);

    try {
      const result = handleAction(action, params);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 世界状态查询
  app.get('/world-state', (_req, res) => {
    const { getWorldTime } = require('../../natural_env/time_calendar/time_service');
    const { getCurrentWeather } = require('../../natural_env/weather_sensor/weather_service');
    res.json({
      time: getWorldTime(),
      weather: getCurrentWeather(),
    });
  });

  server = app.listen(port, () => {
    log('HTTP', `HTTP 行为接口启动在端口 ${port}`);
  });
}

function handleAction(action: string, params: any): any {
  switch (action) {
    case 'apply_injury': {
      applyInjury(params.type, params.severity);
      return { message: `伤病已触发: ${params.type}` };
    }
    case 'start_pregnancy': {
      startPregnancy();
      return { message: '孕期已启动' };
    }
    case 'set_scene': {
      // 场景切换（预留）
      return { message: `场景切换至: ${params.scene}` };
    }
    default:
      throw new Error(`未知行为: ${action}`);
  }
}

export function stopHttpServer(): void {
  if (server) { server.close(); server = null; }
}
