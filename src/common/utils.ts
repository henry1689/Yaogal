/**
 * 通用工具模块
 */
import * as fs from 'fs';
import * as path from 'path';

/** 安全创建目录 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** 获取项目根目录 */
export function getProjectRoot(): string {
  return path.resolve(__dirname, '../..');
}

/** 获取数据目录 */
export function getDataDir(): string {
  const dir = path.join(getProjectRoot(), 'data');
  ensureDir(dir);
  return dir;
}

/** 获取当前时间戳（秒） */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 获取当前时间戳（毫秒） */
export function nowMs(): number {
  return Date.now();
}

/** 格式化日志 */
export function log(module: string, message: string, data?: any): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}][${module}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/** 睡眠 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 安全的 JSON 解析 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/** 限制数值范围 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** 按比率衰减（指数衰减） */
export function decay(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** 生成唯一ID */
export function uid(): string {
  return `${nowMs()}_${Math.random().toString(36).slice(2, 9)}`;
}
