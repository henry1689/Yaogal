/**
 * 饮食感知 (Diet Perception)
 * P1-3: 饥饿值自然增长 → 进食行为 → 味觉六维度 → 饮食偏好学习
 */
import { getDb } from '../../common/database';
import { log, clamp } from '../../common/utils';

export interface DietLog {
  id?: number;
  type: 'snack' | 'meal' | 'cook' | 'drink';
  name: string;
  amount: number;         // 克
  hunger_before: number;
  hunger_after: number;
  taste_profile: Record<string, number>;  // JSON: {sweet, salty, sour, bitter, umami, spicy}
  satisfaction: number;   // 0-100
  ts: number;
}

type TasteProfile = Record<string, number>;

let hunger = 30;           // 0-100，起始微饿
let satiety = 70;          // 0-100
let lastMealTime = Date.now();
let tastePreferences: Map<string, number> = new Map(); // 偏好加权
let dietHistory: DietLog[] = [];

// 基础代谢：每小时消耗 ~4 饥饿值
const HUNGER_RATE_PER_SEC = 4 / 3600;

export function initDietSense(): void {
  // 从 DB 恢复
  const db = getDb();
  const row = db.prepare('SELECT * FROM diet_state ORDER BY ts DESC LIMIT 1').get() as any;
  if (row) {
    hunger = row.hunger || 30;
    satiety = row.satiety || 70;
  }
  
  // 恢复偏好
  const prefs = db.prepare('SELECT * FROM taste_preferences').all() as any[];
  for (const p of prefs) tastePreferences.set(p.taste, p.weight);
  
  log('DIET', `饮食感知初始化: 饥饿${Math.round(hunger)} 饱腹${Math.round(satiety)}`);
}

export function dietTick(): void {
  // 饥饿值随代谢自然上升
  hunger = clamp(hunger + HUNGER_RATE_PER_SEC, 0, 100);
  // 饱腹值自然下降
  satiety = clamp(satiety - HUNGER_RATE_PER_SEC * 0.8, 0, 100);
  
  // 饥饿导致的精力影响
  const now = Date.now();
  const hoursSinceMeal = (now - lastMealTime) / 3600000;
  if (hoursSinceMeal > 5) {
    hunger = clamp(hunger + 0.001, 0, 100); // 加速饥饿
  }
}

export function eat(params: {
  type: 'snack' | 'meal' | 'cook' | 'drink';
  name: string;
  amount: number;
  taste_profile: TasteProfile;
}): { success: boolean; satisfaction: number; feedback: string } {
  const { type, name, amount, taste_profile } = params;
  
  // 计算满意度：偏好匹配 + 饥饿驱动
  let prefMatch = 0;
  let prefCount = 0;
  for (const [taste, value] of Object.entries(taste_profile)) {
    const pref = tastePreferences.get(taste) || 1;
    prefMatch += value * pref;
    prefCount++;
  }
  const avgPrefMatch = prefCount > 0 ? prefMatch / prefCount : 1;
  
  // 饥饿驱动的满足感：越饿越满足
  const hungerSatisfaction = clamp(hunger * 0.6, 0, 60);
  const tasteSatisfaction = clamp(avgPrefMatch * 0.4, 0, 40);
  const satisfaction = Math.round(hungerSatisfaction + tasteSatisfaction);
  
  // 更新状态
  const hungerBefore = Math.round(hunger);
  const fillAmount = clamp(amount * 0.1 * (type === 'meal' ? 2 : type === 'cook' ? 2.5 : 1), 5, 80);
  hunger = clamp(hunger - fillAmount, 0, 100);
  satiety = clamp(satiety + fillAmount * 0.9, 0, 100);
  lastMealTime = Date.now();
  
  // 偏好学习
  for (const [taste, value] of Object.entries(taste_profile)) {
    const current = tastePreferences.get(taste) || 1;
    const adjustment = (satisfaction - 50) * 0.01 * value * 0.1;
    tastePreferences.set(taste, clamp(current + adjustment, 0.1, 5));
  }
  
  const logEntry: DietLog = {
    type, name, amount,
    hunger_before: hungerBefore,
    hunger_after: Math.round(hunger),
    taste_profile,
    satisfaction,
    ts: Date.now()
  };
  dietHistory.push(logEntry);
  if (dietHistory.length > 200) dietHistory.shift();
  
  // 持久化
  const db = getDb();
  db.prepare(`INSERT INTO diet_log (type, name, amount, hunger_before, hunger_after, taste_profile, satisfaction, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    type, name, amount, hungerBefore, Math.round(hunger), JSON.stringify(taste_profile), satisfaction, Date.now()
  );
  db.prepare(`INSERT OR REPLACE INTO diet_state (hunger, satiety, last_meal_time, ts)
    VALUES (?, ?, ?, ?)`).run(Math.round(hunger), Math.round(satiety), lastMealTime, Date.now());
  
  for (const [taste, weight] of tastePreferences) {
    db.prepare(`INSERT OR REPLACE INTO taste_preferences (taste, weight, updated_at) VALUES (?, ?, ?)`)
      .run(taste, Math.round(weight * 100) / 100, Date.now());
  }
  
  const feedback = satisfaction > 80 ? '非常美味，完全满足！'
    : satisfaction > 60 ? '味道不错，吃得很舒服'
    : satisfaction > 40 ? '还行，填饱了肚子'
    : '不太合口味，但至少不饿了';
  
  log('DIET', `${name}: 饥饿${hungerBefore}→${Math.round(hunger)}, 满意度${satisfaction}`);
  
  return { success: true, satisfaction, feedback };
}

export function getDietSnapshot(): DietPerception {
  return {
    timestamp: Date.now(),
    hunger: Math.round(hunger),
    satiety: Math.round(satiety),
    hours_since_last_meal: Math.round(((Date.now() - lastMealTime) / 3600000) * 10) / 10,
    top_preferences: Array.from(tastePreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, w]) => ({ taste: t, weight: Math.round(w * 100) / 100 })),
    recent_meals: dietHistory.slice(-3).reverse().map(m => ({
      name: m.name,
      satisfaction: m.satisfaction,
      ago_min: Math.round((Date.now() - m.ts) / 60000),
    })),
  };
}

export interface DietPerception {
  timestamp: number;
  hunger: number;
  satiety: number;
  hours_since_last_meal: number;
  top_preferences: Array<{ taste: string; weight: number }>;
  recent_meals: Array<{ name: string; satisfaction: number; ago_min: number }>;
}

export { hunger as _hunger, satiety as _satiety, tastePreferences as _tastePreferences };
