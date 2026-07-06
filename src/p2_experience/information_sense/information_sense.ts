/**
 * 信息感知 (Information Perception)
 * P2-2: 三流并行(新闻/社交/知识) + 注意力建模 + 信息焦虑 + 注意力疲劳
 */
import { getDb } from '../../common/database';
import { log, clamp } from '../../common/utils';

interface InfoItem {
  id: string;
  type: 'news' | 'social' | 'knowledge';
  title: string;
  consumed_at: number;
  duration_sec: number;      // 阅读时长
  depth: number;              // 0-100 阅读深度
  distraction_count: number;  // 被打断次数
  emotional_impact: number;   // -100~+100
}

let infoStream: InfoItem[] = [];
let attentionFocus = 80;     // 注意力集中度
let attentionFatigue = 0;    // 注意力疲劳
let dailyInfoVolume = 0;
let infoAnxiety = 30;        // 信息焦虑度
let attentionFragments: string[] = []; // 注意力残片
let lastDeepFocus = Date.now();
let switchingCost = 0;

export function initInformationSense(): void {
  log('INFO', '信息感知初始化');
}

export function infoTick(): void {
  const now = Date.now();
  
  // 信息焦虑自然波动
  const hoursSinceFocus = (now - lastDeepFocus) / 3600000;
  infoAnxiety = clamp(infoAnxiety + (hoursSinceFocus > 2 ? 0.001 : -0.0005), 0, 100);
  
  // 注意力疲劳恢复
  attentionFatigue = clamp(attentionFatigue * 0.9999, 0, 100);
  attentionFocus = clamp(80 - attentionFatigue * 0.5 - switchingCost * 0.3, 10, 100);
  
  // 切换成本衰减（每次切换后缓慢恢复）
  switchingCost = clamp(switchingCost * 0.995, 0, 50);
  
  // 每日凌晨重置
  if (new Date(now).getHours() === 0 && new Date(now).getMinutes() === 0 && new Date(now).getSeconds() < 5) {
    dailyInfoVolume = 0;
    infoStream = [];
    attentionFragments = [];
  }
}

export function consumeInfo(params: {
  type: 'news' | 'social' | 'knowledge';
  title: string;
  duration_sec: number;
  depth: number;
  distraction_count: number;
  emotional_impact?: number;
}): { focus_change: number; fatigue_added: number } {
  const item: InfoItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: params.type,
    title: params.title,
    consumed_at: Date.now(),
    duration_sec: params.duration_sec,
    depth: params.depth,
    distraction_count: params.distraction_count,
    emotional_impact: params.emotional_impact || 0,
  };
  
  infoStream.push(item);
  if (infoStream.length > 200) infoStream.shift();
  dailyInfoVolume++;
  
  // 注意力消耗
  const fatigueCost = params.duration_sec * 0.01 * (1 - params.depth / 100);
  attentionFatigue = clamp(attentionFatigue + fatigueCost, 0, 100);
  
  // 被打断的注意力残片
  if (params.distraction_count > 0) {
    attentionFragments.push(params.title);
    if (attentionFragments.length > 20) attentionFragments.shift();
    switchingCost = clamp(switchingCost + params.distraction_count * 3, 0, 50);
  }
  
  // 深度阅读恢复专注
  if (params.depth > 70 && params.distraction_count === 0) {
    lastDeepFocus = Date.now();
    infoAnxiety = clamp(infoAnxiety - 3, 0, 100);
  }
  
  log('INFO', `消费 ${params.type}:${params.title} (${params.duration_sec}s, 深度${params.depth})`);
  
  return {
    focus_change: Math.round(attentionFocus),
    fatigue_added: Math.round(fatigueCost * 10) / 10,
  };
}

export function getInfoSnapshot(): InformationPerception {
  const recentItems = infoStream.slice(-10).reverse();
  const typeBreakdown = { news: 0, social: 0, knowledge: 0 };
  for (const item of infoStream) typeBreakdown[item.type]++;
  
  return {
    timestamp: Date.now(),
    attention_focus: Math.round(attentionFocus),
    attention_fatigue: Math.round(attentionFatigue),
    info_anxiety: Math.round(infoAnxiety),
    daily_volume: dailyInfoVolume,
    switching_cost: Math.round(switchingCost),
    fragment_count: attentionFragments.length,
    recent_items: recentItems.map(i => ({
      title: i.title.slice(0, 30),
      type: i.type,
      ago_min: Math.round((Date.now() - i.consumed_at) / 60000),
    })),
    type_breakdown: typeBreakdown,
  };
}

export interface InformationPerception {
  timestamp: number;
  attention_focus: number;
  attention_fatigue: number;
  info_anxiety: number;
  daily_volume: number;
  switching_cost: number;
  fragment_count: number;
  recent_items: Array<{ title: string; type: string; ago_min: number }>;
  type_breakdown: { news: number; social: number; knowledge: number };
}
