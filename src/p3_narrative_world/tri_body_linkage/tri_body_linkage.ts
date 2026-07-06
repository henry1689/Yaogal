/**
 * 三体联动 (Tri-Body Linkage)
 * P3-2: 情绪↔行为↔世界 自我调节闭环
 * 情绪基线下降 → 自动建议调节行为 → 行为改变世界 → 世界反馈优化情绪
 */
import { log, clamp } from '../../common/utils';

type FixAction = 'walk' | 'socialize' | 'rest' | 'eat' | 'entertain' | 'exercise' | 'meditate';

interface FixTemplate {
  name: string;
  description: string;
  conditions: Array<{ metric: string; threshold: number; direction: 'low' | 'high' }>;
  suggested_action: FixAction;
  expected_effect: string;
  cooldown_minutes: number;
}

let fixTemplates: FixTemplate[] = [];
let lastFixAction: Map<FixAction, number> = new Map();
let autoFixEnabled = true;

// 当前状态的缓存引用（由外部注入）
let currentState: {
  mood_baseline: number;
  energy: number;
  fatigue: number;
  hunger: number;
  social_energy: number;
  loneliness: number;
  attention_fatigue: number;
} = { mood_baseline: 70, energy: 80, fatigue: 20, hunger: 30, social_energy: 60, loneliness: 30, attention_fatigue: 20 };

export function initTriBodyLinkage(): void {
  // 7个预设修复行为模板
  fixTemplates = [
    { name: '散步放松', description: '外出散步15分钟恢复精力', conditions: [
      { metric: 'mood_baseline', threshold: 40, direction: 'low' },
      { metric: 'fatigue', threshold: 60, direction: 'high' },
    ], suggested_action: 'walk', expected_effect: '情绪+8, 疲劳-10', cooldown_minutes: 60 },
    
    { name: '社交充电', description: '联系朋友缓解孤独', conditions: [
      { metric: 'loneliness', threshold: 50, direction: 'high' },
      { metric: 'social_energy', threshold: 30, direction: 'high' },
    ], suggested_action: 'socialize', expected_effect: '孤独感-15, 关系温度+5', cooldown_minutes: 120 },
    
    { name: '小睡恢复', description: '10-20分钟小睡恢复精力', conditions: [
      { metric: 'energy', threshold: 30, direction: 'low' },
      { metric: 'fatigue', threshold: 50, direction: 'high' },
    ], suggested_action: 'rest', expected_effect: '精力+20, 疲劳-15', cooldown_minutes: 90 },
    
    { name: '进食补充', description: '吃点东西补充能量', conditions: [
      { metric: 'hunger', threshold: 60, direction: 'high' },
      { metric: 'energy', threshold: 40, direction: 'low' },
    ], suggested_action: 'eat', expected_effect: '饥饿-30, 精力+10', cooldown_minutes: 45 },
    
    { name: '娱乐放松', description: '看视频/听音乐缓解低情绪', conditions: [
      { metric: 'mood_baseline', threshold: 30, direction: 'low' },
    ], suggested_action: 'entertain', expected_effect: '情绪+15', cooldown_minutes: 60 },
    
    { name: '简单运动', description: '做一些伸展或轻度运动', conditions: [
      { metric: 'fatigue', threshold: 40, direction: 'high' },
      { metric: 'mood_baseline', threshold: 50, direction: 'low' },
    ], suggested_action: 'exercise', expected_effect: '疲劳-8, 情绪+5', cooldown_minutes: 60 },
    
    { name: '冥想放空', description: '5分钟冥想清空注意力疲劳', conditions: [
      { metric: 'attention_fatigue', threshold: 60, direction: 'high' },
    ], suggested_action: 'meditate', expected_effect: '注意力疲劳-20', cooldown_minutes: 30 },
  ];
  
  log('TRI_BODY', `三体联动初始化: ${fixTemplates.length}个修复模板`);
}

export function updateState(state: Partial<typeof currentState>): void {
  Object.assign(currentState, state);
}

export function triBodyTick(): void {
  if (!autoFixEnabled) return;
  
  const now = Date.now();
  
  // 评估是否需要干预
  const matches = findMatchingFixes();
  
  for (const fix of matches) {
    const lastTime = lastFixAction.get(fix.suggested_action) || 0;
    if (now - lastTime < fix.cooldown_minutes * 60000) continue;
    
    // 触发修复行为
    lastFixAction.set(fix.suggested_action, now);
    log('TRI_BODY', `自动建议: ${fix.name} (${fix.expected_effect})`);
    
    // 模拟世界反馈
    applyFixEffect(fix.suggested_action);
  }
}

function findMatchingFixes(): FixTemplate[] {
  return fixTemplates.filter(fix => {
    return fix.conditions.every(cond => {
      const value = (currentState as any)[cond.metric] || 0;
      if (cond.direction === 'low') return value < cond.threshold;
      return value > cond.threshold;
    });
  });
}

function applyFixEffect(action: FixAction): void {
  switch (action) {
    case 'walk':
      currentState.mood_baseline = clamp(currentState.mood_baseline + 8, 0, 100);
      currentState.fatigue = clamp(currentState.fatigue - 10, 0, 100);
      currentState.energy = clamp(currentState.energy + 5, 0, 100);
      break;
    case 'socialize':
      currentState.loneliness = clamp(currentState.loneliness - 15, 0, 100);
      currentState.social_energy = clamp(currentState.social_energy - 5, 0, 100);
      currentState.mood_baseline = clamp(currentState.mood_baseline + 5, 0, 100);
      break;
    case 'rest':
      currentState.energy = clamp(currentState.energy + 20, 0, 100);
      currentState.fatigue = clamp(currentState.fatigue - 15, 0, 100);
      break;
    case 'eat':
      currentState.hunger = clamp(currentState.hunger - 30, 0, 100);
      currentState.energy = clamp(currentState.energy + 10, 0, 100);
      break;
    case 'entertain':
      currentState.mood_baseline = clamp(currentState.mood_baseline + 15, 0, 100);
      break;
    case 'exercise':
      currentState.fatigue = clamp(currentState.fatigue - 8, 0, 100);
      currentState.mood_baseline = clamp(currentState.mood_baseline + 5, 0, 100);
      currentState.energy = clamp(currentState.energy + 3, 0, 100);
      break;
    case 'meditate':
      currentState.attention_fatigue = clamp(currentState.attention_fatigue - 20, 0, 100);
      currentState.mood_baseline = clamp(currentState.mood_baseline + 3, 0, 100);
      break;
  }
}

export function getTriBodySnapshot(): TriBodyPerception {
  const pendingFixes = findMatchingFixes().slice(0, 3);
  
  return {
    timestamp: Date.now(),
    auto_fix_enabled: autoFixEnabled,
    current_state: { ...currentState },
    pending_suggestions: pendingFixes.map(f => ({
      name: f.name,
      action: f.suggested_action,
      effect: f.expected_effect,
    })),
    last_fix_actions: Object.fromEntries(lastFixAction),
  };
}

export function setAutoFix(enabled: boolean): void {
  autoFixEnabled = enabled;
  log('TRI_BODY', `自动修复: ${enabled ? '开启' : '关闭'}`);
}

export interface TriBodyPerception {
  timestamp: number;
  auto_fix_enabled: boolean;
  current_state: typeof currentState;
  pending_suggestions: Array<{ name: string; action: string; effect: string }>;
  last_fix_actions: Record<string, number>;
}
