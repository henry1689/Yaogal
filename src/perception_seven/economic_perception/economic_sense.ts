/**
 * 经济感知 (Economic Perception)
 * P1-1: 资产净值/日消费/月度变动/财务安全感/物欲张力
 * 每秒 tick 更新，每 10 秒产出感知快照
 */
import { getDb } from '../../common/database';
import { log, clamp } from '../../common/utils';

export interface EconomicLedger {
  id?: number;
  date: string;
  asset_total: number;
  daily_spend: number;
  monthly_change: number;
  financial_security: number;    // 0-100
  desire_tension: number;        // 0-100 物欲张力
  spend_categories: string;      // JSON: {food, housing, transport, entertainment, other}
  notes: string;
  ts: number;
}

interface CategorySpend {
  food: number;
  housing: number; 
  transport: number;
  entertainment: number;
  other: number;
}

let tracking = false;
let today = '';
let assetTotal = 100000;         // 默认10万
let todaySpend = 0;
let monthlyHistory: number[] = [];
let categories: CategorySpend = { food: 0, housing: 0, transport: 0, entertainment: 0, other: 0 };
let pendingDesires: Array<{ item: string; cost: number; urgency: number; since: number }> = [];

export function initEconomicSense(initialAssets?: number): void {
  if (initialAssets) assetTotal = initialAssets;
  today = new Date().toISOString().slice(0, 10);
  
  // 从数据库恢复今日数据
  const db = getDb();
  const row = db.prepare('SELECT * FROM economic_ledger WHERE date = ? ORDER BY ts DESC LIMIT 1').get(today) as any;
  if (row) {
    assetTotal = row.asset_total;
    todaySpend = row.daily_spend;
    try { categories = JSON.parse(row.spend_categories || '{}'); } catch {}
  }
  
  log('ECONOMIC', `经济感知初始化: 资产${assetTotal}, 今日消费${todaySpend}`);
}

export function economicTick(): void {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  
  // 跨日重置
  if (todayStr !== today) {
    // 存档昨日
    saveLedger(today);
    // 月度统计
    monthlyHistory.push(todaySpend);
    if (monthlyHistory.length > 31) monthlyHistory.shift();
    
    today = todayStr;
    todaySpend = 0;
    categories = { food: 0, housing: 0, transport: 0, entertainment: 0, other: 0 };
  }
  
  // 日落前自动结算当日台账
  if (now.getHours() === 22 && now.getMinutes() === 0 && now.getSeconds() < 5) {
    saveLedger(today);
  }
  
  // 物欲张力自然衰减（每天消退~5%）
  if (now.getSeconds() === 0) {
    pendingDesires = pendingDesires
      .map(d => ({ ...d, urgency: clamp(d.urgency * 0.95, 0, 100) }))
      .filter(d => d.urgency > 5);
    
    // 随机生成新物欲（概率性）
    if (Math.random() < 0.02) {
      const items = [
        { item: '新电子产品', cost: 5000 },
        { item: '旅行', cost: 8000 },
        { item: '书籍', cost: 200 },
        { item: '美食体验', cost: 500 },
        { item: '衣物', cost: 1000 },
      ];
      const pick = items[Math.floor(Math.random() * items.length)];
      pendingDesires.push({ ...pick, urgency: 20 + Math.random() * 30, since: Date.now() });
      log('ECONOMIC', `新物欲产生: ${pick.item} ¥${pick.cost}`);
    }
  }
}

export function recordSpend(amount: number, category: keyof CategorySpend): void {
  todaySpend += amount;
  categories[category] += amount;
  assetTotal -= amount;
  log('ECONOMIC', `消费: ¥${amount} (${category}), 今日累计 ¥${todaySpend}`);
}

export function getEconomicSnapshot(): EconomicPerception {
  const monthlyAvg = monthlyHistory.length > 0
    ? monthlyHistory.reduce((a, b) => a + b, 0) / monthlyHistory.length
    : todaySpend;
  
  const monthlyTotal = monthlyHistory.reduce((a, b) => a + b, todaySpend);
  
  // 财务安全感: 资产/月均消费比率 + 稳定性
  const runwayMonths = monthlyAvg > 0 ? assetTotal / (monthlyAvg * 30) : 100;
  const security = clamp(runwayMonths * 8, 0, 100); // ~12个月缓冲=满分
  
  // 物欲张力
  const desireSum = pendingDesires.reduce((s, d) => s + d.urgency, 0);
  const desireTension = clamp(desireSum / (pendingDesires.length || 1), 0, 100);
  
  return {
    timestamp: Date.now(),
    asset_total: assetTotal,
    daily_spend: todaySpend,
    monthly_spend: monthlyTotal,
    monthly_avg: Math.round(monthlyAvg),
    financial_security: Math.round(security),
    desire_tension: Math.round(desireTension),
    runway_months: Math.round(runwayMonths),
    spend_categories: { ...categories },
    pending_desires: pendingDesires.length,
  };
}

function saveLedger(date: string): void {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO economic_ledger (date, asset_total, daily_spend, monthly_change, financial_security, desire_tension, spend_categories, notes, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    date, assetTotal, todaySpend, 0, 0, 0,
    JSON.stringify(categories), '', Date.now()
  );
}

export interface EconomicPerception {
  timestamp: number;
  asset_total: number;
  daily_spend: number;
  monthly_spend: number;
  monthly_avg: number;
  financial_security: number;
  desire_tension: number;
  runway_months: number;
  spend_categories: CategorySpend;
  pending_desires: number;
}

export { categories as _categories };
