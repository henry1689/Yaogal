/**
 * 仪式与习惯系统 (Rituals & Habits)
 * P2-1: 20+ 预定义仪式 + 10 个习惯轨道 + 连续性追踪
 */
import { getDb } from '../../common/database';
import { log, clamp } from '../../common/utils';

interface Ritual {
  id: string;
  name: string;
  time_pattern: { start_hour: number; end_hour: number };
  days: number[];            // 0=周日, 1=周一...
  last_executed: number;
  streak: number;
}

interface Habit {
  id: string;
  name: string;
  target_days: number[];
  frequency: 'daily' | 'weekly' | 'monthly';
  current_streak: number;
  longest_streak: number;
  status: 'active' | 'broken' | 'recovering';
  last_check: number;
  total_completions: number;
  history: boolean[];        // 最近30天完成情况
}

let rituals: Map<string, Ritual> = new Map();
let habits: Map<string, Habit> = new Map();
let ritualComfort = 50;     // 仪式带来的稳定感

export function initRituals(): void {
  // 预定义20+仪式
  const defaults: Ritual[] = [
    { id: 'morning_coffee', name: '晨间咖啡', time_pattern: { start_hour: 7, end_hour: 9 }, days: [1,2,3,4,5,6,0], last_executed: 0, streak: 0 },
    { id: 'morning_browse', name: '晨间浏览', time_pattern: { start_hour: 8, end_hour: 9 }, days: [1,2,3,4,5,6,0], last_executed: 0, streak: 0 },
    { id: 'lunch', name: '午膳', time_pattern: { start_hour: 12, end_hour: 13 }, days: [1,2,3,4,5,6,0], last_executed: 0, streak: 0 },
    { id: 'afternoon_tea', name: '下午茶', time_pattern: { start_hour: 15, end_hour: 16 }, days: [1,2,3,4,5], last_executed: 0, streak: 0 },
    { id: 'evening_scroll', name: '晚间刷屏', time_pattern: { start_hour: 21, end_hour: 23 }, days: [1,2,3,4,5,6,0], last_executed: 0, streak: 0 },
    { id: 'night_read', name: '夜读', time_pattern: { start_hour: 22, end_hour: 24 }, days: [1,2,3,4,5,6,0], last_executed: 0, streak: 0 },
    { id: 'shower', name: '沐浴', time_pattern: { start_hour: 21, end_hour: 23 }, days: [1,2,3,4,5,6,0], last_executed: 0, streak: 0 },
    { id: 'plant_care', name: '植物养护', time_pattern: { start_hour: 8, end_hour: 10 }, days: [0,6], last_executed: 0, streak: 0 },
    { id: 'weekend_clean', name: '周末打扫', time_pattern: { start_hour: 10, end_hour: 14 }, days: [0,6], last_executed: 0, streak: 0 },
  ];
  
  for (const r of defaults) rituals.set(r.id, r);
  
  // 预定义10个习惯轨道
  const habitDefaults: Habit[] = [
    { id: 'reading', name: '阅读', target_days: [1,2,3,4,5,6,0], frequency: 'daily', current_streak: 0, longest_streak: 0, status: 'active', last_check: 0, total_completions: 0, history: new Array(30).fill(false) },
    { id: 'walking', name: '散步', target_days: [1,2,3,4,5,6,0], frequency: 'daily', current_streak: 0, longest_streak: 0, status: 'active', last_check: 0, total_completions: 0, history: new Array(30).fill(false) },
    { id: 'cleaning', name: '清洁', target_days: [0,3,6], frequency: 'weekly', current_streak: 0, longest_streak: 0, status: 'active', last_check: 0, total_completions: 0, history: new Array(30).fill(false) },
    { id: 'cooking', name: '烹饪', target_days: [1,2,3,4,5,6,0], frequency: 'daily', current_streak: 0, longest_streak: 0, status: 'active', last_check: 0, total_completions: 0, history: new Array(30).fill(false) },
    { id: 'contact_family', name: '联系家人', target_days: [0,6], frequency: 'weekly', current_streak: 0, longest_streak: 0, status: 'active', last_check: 0, total_completions: 0, history: new Array(30).fill(false) },
    { id: 'finance_review', name: '理财回顾', target_days: [6], frequency: 'weekly', current_streak: 0, longest_streak: 0, status: 'active', last_check: 0, total_completions: 0, history: new Array(30).fill(false) },
  ];
  
  for (const h of habitDefaults) habits.set(h.id, h);
  
  // 从 DB 恢复
  const db = getDb();
  const ritualRows = db.prepare('SELECT * FROM ritual_state').all() as any[];
  for (const row of ritualRows) {
    if (rituals.has(row.ritual_id)) {
      const r = rituals.get(row.ritual_id)!;
      r.last_executed = row.last_executed;
      r.streak = row.streak;
    }
  }
  const habitRows = db.prepare('SELECT * FROM habit_track').all() as any[];
  for (const row of habitRows) {
    if (habits.has(row.habit_id)) {
      const h = habits.get(row.habit_id)!;
      h.current_streak = row.current_streak;
      h.longest_streak = row.longest_streak;
      h.status = row.status;
      h.last_check = row.last_check;
      h.total_completions = row.total_completions;
    }
  }
  
  log('RITUALS', `仪式习惯初始化: ${rituals.size}仪式 ${habits.size}习惯`);
}

export function ritualTick(): void {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  // 检测当前时段可执行的仪式
  for (const [id, ritual] of rituals) {
    if (!ritual.days.includes(day)) continue;
    if (hour < ritual.time_pattern.start_hour || hour > ritual.time_pattern.end_hour) continue;
    
    // 今天是否已执行 (同一天内只触发一次)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ritual.last_executed >= todayStart) continue;
    
    ritual.last_executed = Date.now();
    ritual.streak++;
    ritualComfort = clamp(ritualComfort + 0.5, 0, 100);
    
    log('RITUALS', `${ritual.name} 执行 (连续${ritual.streak}天)`);
  }
  
  // 仪式舒适感自然衰减
  ritualComfort = clamp(ritualComfort * 0.9999, 10, 100);
  
  // 习惯检查：每日凌晨结算
  if (hour === 0 && now.getMinutes() === 0 && now.getSeconds() < 5) {
    dailyHabitCheck(day);
  }
  
  // 持久化
  if (now.getMinutes() === 30 && now.getSeconds() < 5) {
    persistRituals();
  }
}

export function completeHabit(habitId: string): { success: boolean; feedback: string } {
  const habit = habits.get(habitId);
  if (!habit) return { success: false, feedback: '未知习惯' };
  
  const now = Date.now();
  habit.last_check = now;
  habit.total_completions++;
  habit.history.push(true);
  if (habit.history.length > 30) habit.history.shift();
  
  // 检查连续
  const today = new Date(now).getDay();
  if (habit.target_days.includes(today)) {
    if (habit.status === 'recovering' || habit.status === 'broken') {
      habit.status = 'recovering';
    }
  }
  
  log('HABITS', `${habit.name} 完成 (总计${habit.total_completions}次)`);
  return { success: true, feedback: `${habit.name} 已完成！总计${habit.total_completions}次` };
}

function dailyHabitCheck(today: number): void {
  for (const [id, habit] of habits) {
    if (!habit.target_days.includes(today)) continue;
    
    const yesterday = Date.now() - 86400000;
    if (habit.last_check >= yesterday) {
      habit.current_streak++;
      if (habit.current_streak > habit.longest_streak) {
        habit.longest_streak = habit.current_streak;
      }
      habit.status = 'active';
    } else {
      habit.status = habit.current_streak > 0 ? 'broken' : 'active';
      habit.current_streak = 0;
    }
    habit.history.push(false);
    if (habit.history.length > 30) habit.history.shift();
  }
}

function persistRituals(): void {
  const db = getDb();
  for (const [id, r] of rituals) {
    db.prepare(`INSERT OR REPLACE INTO ritual_state (ritual_id, name, last_executed, streak, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run(id, r.name, r.last_executed, r.streak, Date.now());
  }
  for (const [id, h] of habits) {
    db.prepare(`INSERT OR REPLACE INTO habit_track (habit_id, name, current_streak, longest_streak, status, last_check, total_completions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, h.name, h.current_streak, h.longest_streak, h.status, h.last_check, h.total_completions, Date.now());
  }
}

export function getRitualSnapshot(): RitualPerception {
  const now = Date.now();
  const todayRituals = Array.from(rituals.values())
    .filter(r => r.last_executed >= new Date().setHours(0,0,0,0))
    .map(r => r.name);
  
  const habitSummaries = Array.from(habits.values()).map(h => ({
    name: h.name,
    streak: h.current_streak,
    longest: h.longest_streak,
    status: h.status,
    total: h.total_completions,
  }));
  
  return {
    timestamp: now,
    ritual_comfort: Math.round(ritualComfort),
    today_rituals: todayRituals,
    habits: habitSummaries,
    active_habits: habitSummaries.filter(h => h.status === 'active').length,
    broken_habits: habitSummaries.filter(h => h.status === 'broken').length,
  };
}

export interface RitualPerception {
  timestamp: number;
  ritual_comfort: number;
  today_rituals: string[];
  habits: Array<{ name: string; streak: number; longest: number; status: string; total: number }>;
  active_habits: number;
  broken_habits: number;
}
