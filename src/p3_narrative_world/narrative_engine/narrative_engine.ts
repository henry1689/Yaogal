/**
 * 叙事引擎 (Narrative Engine)
 * P3-1: 事件日志 → 每日叙事摘要 → 每周主题提取
 * 把离散快照串成"今天发生了什么"的叙事
 */
import { getDb } from '../../common/database';
import { log } from '../../common/utils';

interface NarrativeEvent {
  id: string;
  timestamp: number;
  category: 'world' | 'behavior' | 'emotion' | 'social' | 'economic' | 'physio' | 'intimacy';
  summary: string;
  valence: 'positive' | 'negative' | 'neutral';
  intensity: number;   // 0-100
}

interface DailyNarrative {
  date: string;
  events: NarrativeEvent[];
  mood_tone: string;       // 情绪基调
  theme: string;           // 当天主题
  highlight: string;       // 最突出事件
  lesson: string;          // 当天收获/教训
  week_number: number;
}

let eventLog: NarrativeEvent[] = [];
let dailyNarratives: DailyNarrative[] = [];
let currentWeekTheme = '';
let weeklyEventCounts: Record<string, number> = {};

export function initNarrativeEngine(): void {
  log('NARRATIVE', '叙事引擎初始化');
}

export function logEvent(event: Omit<NarrativeEvent, 'id'>): void {
  const fullEvent: NarrativeEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };
  
  eventLog.push(fullEvent);
  if (eventLog.length > 200) eventLog.shift();
  
  // 持久化
  const db = getDb();
  db.prepare(`INSERT INTO event_log (event_id, timestamp, category, summary, valence, intensity, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    fullEvent.id, fullEvent.timestamp, fullEvent.category,
    fullEvent.summary, fullEvent.valence, fullEvent.intensity, Date.now()
  );
  
  // 更新周统计
  const key = `${fullEvent.category}:${fullEvent.valence}`;
  weeklyEventCounts[key] = (weeklyEventCounts[key] || 0) + 1;
}

export function narrativeTick(): void {}

export function generateDailyNarrative(): DailyNarrative {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = eventLog.filter(e => {
    const eventDate = new Date(e.timestamp).toISOString().slice(0, 10);
    return eventDate === today;
  });
  
  // 计算情绪基调
  const valenceMap = { positive: 1, neutral: 0, negative: -1 };
  const totalValence = todayEvents.reduce((s, e) => s + (valenceMap[e.valence] || 0) * e.intensity, 0) / 100;
  const moodTone = totalValence > 0.5 ? '积极' : totalValence < -0.5 ? '挑战' : totalValence < -0.1 ? '平静偏郁' : '平静';
  
  // 提取主题
  const themes = extractThemes(todayEvents);
  const theme = themes.length > 0 ? themes[0] : '日常';
  
  // 最突出事件
  const sorted = [...todayEvents].sort((a, b) => b.intensity - a.intensity);
  const highlight = sorted.length > 0 ? sorted[0].summary : '无特殊事件';
  
  // 教训
  const negativeEvents = todayEvents.filter(e => e.valence === 'negative');
  const lesson = negativeEvents.length > 0
    ? `今日有${negativeEvents.length}件不如意事，明天可调整`
    : '今日平稳，保持节奏';
  
  const narrative: DailyNarrative = {
    date: today,
    events: todayEvents.slice(-20),
    mood_tone: moodTone,
    theme,
    highlight,
    lesson,
    week_number: getWeekNumber(),
  };
  
  dailyNarratives.push(narrative);
  if (dailyNarratives.length > 30) dailyNarratives.shift();
  
  // 持久化
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO daily_narrative (date, mood_tone, theme, highlight, lesson, event_count, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    today, moodTone, theme, highlight, lesson, todayEvents.length, Date.now()
  );
  
  log('NARRATIVE', `每日叙事: ${moodTone} | ${theme} | ${todayEvents.length}事件`);
  
  return narrative;
}

export function getWeeklyNarrative(): string {
  // 计算周主题
  const sorted = Object.entries(weeklyEventCounts).sort((a, b) => b[1] - a[1]);
  const topCategories = sorted.slice(0, 3).map(([k, v]) => {
    const [cat, val] = k.split(':');
    return `${cat}(${val})×${v}`;
  });
  
  currentWeekTheme = topCategories.length > 0
    ? `本周主要围绕 ${topCategories.join(', ')}`
    : '本周平稳度过';
  
  // 重置周统计（新的一周）
  if (new Date().getDay() === 0) {
    weeklyEventCounts = {};
  }
  
  return currentWeekTheme;
}

function extractThemes(events: NarrativeEvent[]): string[] {
  const categoryCounts: Record<string, number> = {};
  for (const e of events) categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  
  return Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => `${catCategoryToChinese(cat)}(${count}件)`);
}

function catCategoryToChinese(cat: string): string {
  const map: Record<string, string> = {
    world: '世界感知', behavior: '行为', emotion: '情绪',
    social: '社交', economic: '经济', physio: '身体', intimacy: '亲密',
  };
  return map[cat] || cat;
}

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

export function getNarrativeSnapshot(): NarrativePerception {
  const latestNarrative = dailyNarratives.length > 0
    ? dailyNarratives[dailyNarratives.length - 1]
    : null;
  
  return {
    timestamp: Date.now(),
    today_mood_tone: latestNarrative?.mood_tone || '未生成',
    today_theme: latestNarrative?.theme || '未生成',
    today_events_count: latestNarrative?.events.length || 0,
    week_theme: currentWeekTheme || '未生成',
    recent_narratives: dailyNarratives.slice(-7).map(n => ({
      date: n.date,
      mood: n.mood_tone,
      theme: n.theme,
    })),
  };
}

export interface NarrativePerception {
  timestamp: number;
  today_mood_tone: string;
  today_theme: string;
  today_events_count: number;
  week_theme: string;
  recent_narratives: Array<{ date: string; mood: string; theme: string }>;
}
