/**
 * 梦境感知 (Dream Perception)
 * P2-3: 睡眠阶段建模(浅睡/深睡/REM) + 梦境生成 + 残留情绪
 */
import { getDb } from '../../common/database';
import { log, clamp } from '../../common/utils';

type SleepStage = 'awake' | 'light' | 'deep' | 'rem';

interface Dream {
  id: string;
  date: string;
  stage_generated: number;  // 第几个REM周期
  content: string;
  emotion_tags: string[];   // 情绪标签
  source_events: string[];  // 来自当日哪些事件
  vividness: number;        // 0-100
  remembered: boolean;
}

let currentStage: SleepStage = 'awake';
let stageTimer = 0;          // 当前阶段已持续秒数
let sleepStartTime = 0;
let totalSleepTime = 0;
let remCycleCount = 0;
let tonightDreams: Dream[] = [];
let residualEmotion: string | null = null;
let residualIntensity = 0;
let dailyEvents: string[] = [];     // 当日事件摘要（梦境素材）
let dailyEmotions: string[] = [];   // 当日情绪片段

// 睡眠阶段时长（分钟）
const STAGE_DURATIONS: Record<SleepStage, number> = {
  awake: 0,
  light: 15,    // 浅睡 15分钟
  deep: 20,     // 深睡 20分钟
  rem: 10,      // REM 10分钟
};

const STAGE_SEQUENCE: SleepStage[] = ['light', 'deep', 'light', 'rem', 'light', 'deep', 'light', 'rem'];

export function initDreamSense(): void {
  log('DREAM', '梦境感知初始化');
}

export function dreamTick(): void {
  // 睡眠阶段推进（仅在入睡状态）
  if (currentStage === 'awake') return;
  
  stageTimer++;
  
  const stageDurationSec = STAGE_DURATIONS[currentStage] * 60;
  if (stageTimer >= stageDurationSec) {
    advanceSleepStage();
  }
  
  totalSleepTime++;
}

export function startSleep(): void {
  currentStage = 'light';
  stageTimer = 0;
  sleepStartTime = Date.now();
  remCycleCount = 0;
  tonightDreams = [];
  log('DREAM', '进入睡眠：浅睡阶段');
}

export function wakeUp(): { residual_emotion: string | null; intensity: number; dreams_remembered: Dream[] } {
  const result = {
    residual_emotion: residualEmotion,
    intensity: residualIntensity,
    dreams_remembered: tonightDreams.filter(d => d.remembered),
  };
  
  // 持久化梦境
  const db = getDb();
  for (const dream of tonightDreams) {
    if (dream.remembered) {
      db.prepare(`INSERT INTO dream_log (date, rem_cycle, content, emotion_tags, vividness, remembered, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        new Date().toISOString().slice(0, 10), dream.stage_generated,
        dream.content, JSON.stringify(dream.emotion_tags), dream.vividness, 1, Date.now()
      );
    }
  }
  
  // 残留情绪自然衰减（每小时 -5）
  const hoursAwake = 0;
  // 唤醒后的情绪残留保留，由外部 tick 管理衰减
  
  currentStage = 'awake';
  stageTimer = 0;
  totalSleepTime = 0;
  
  log('DREAM', `醒来: ${tonightDreams.length}个梦, ${result.dreams_remembered.length}个记得, 残留情绪: ${residualEmotion || '无'}`);
  return result;
}

function advanceSleepStage(): void {
  // 按序列推进
  const currentIdx = STAGE_SEQUENCE.indexOf(currentStage);
  let nextIdx: number;
  
  if (currentIdx === -1 || currentIdx >= STAGE_SEQUENCE.length - 1) {
    nextIdx = 0; // 循环
  } else {
    nextIdx = currentIdx + 1;
  }
  
  const nextStage = STAGE_SEQUENCE[nextIdx];
  
  if (nextStage === 'rem') {
    remCycleCount++;
    // REM阶段生成梦境
    generateDream(remCycleCount);
  }
  
  currentStage = nextStage;
  stageTimer = 0;
}

function generateDream(cycleNum: number): void {
  // 从当日事件+情绪+随机印象中采样
  const sourceEvents: string[] = [];
  const usedEmotions: string[] = [];
  
  // 取当日事件（最多3个）
  const shuffledEvents = [...dailyEvents].sort(() => Math.random() - 0.5);
  sourceEvents.push(...shuffledEvents.slice(0, Math.min(3, shuffledEvents.length)));
  
  // 取当日情绪（最多2个）
  const shuffledEmotions = [...dailyEmotions].sort(() => Math.random() - 0.5);
  usedEmotions.push(...shuffledEmotions.slice(0, 2));
  
  // 随机印象
  const randomImpressions = ['水', '飞行', '追逃', '坠落', '重逢', '迷宫', '食物', '童年', '考试', '迷路'];
  const pickedImpression = randomImpressions[Math.floor(Math.random() * randomImpressions.length)];
  
  // 生成梦境内容
  const dreamContent = generateDreamContent(sourceEvents, usedEmotions, pickedImpression);
  
  // 情绪标签
  const emotionTags = determineDreamEmotions(usedEmotions, pickedImpression);
  
  const vividness = 30 + Math.random() * 60; // 30-90
  const remembered = vividness > 50 || cycleNum === remCycleCount; // 最后一个REM更容易记住
  
  const dream: Dream = {
    id: `dream_${Date.now()}_${cycleNum}`,
    date: new Date().toISOString().slice(0, 10),
    stage_generated: cycleNum,
    content: dreamContent,
    emotion_tags: emotionTags,
    source_events: sourceEvents,
    vividness: Math.round(vividness),
    remembered,
  };
  
  tonightDreams.push(dream);
  
  // 设置残留情绪
  if (remembered && emotionTags.length > 0) {
    residualEmotion = emotionTags[0];
    residualIntensity = clamp((vividness - 30) / 60, 0.1, 1);
  }
  
  log('DREAM', `REM#${cycleNum}: ${dreamContent.slice(0, 40)}... [${emotionTags.join(',')}]`);
}

function generateDreamContent(events: string[], emotions: string[], impression: string): string {
  if (events.length === 0) {
    return `无意义的${impression}场景在脑海中闪现`;
  }
  
  const templates = [
    `${events[0]}的场景与${impression}交织在一起`,
    `在${impression}的背景下，${events[0]}反复上演`,
    `${events.join('和')}在${impression}中融合成荒诞的一幕`,
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function determineDreamEmotions(emotions: string[], impression: string): string[] {
  const impressionEmotionMap: Record<string, string[]> = {
    '水': ['平静', '恐惧'],
    '飞行': ['自由', '兴奋'],
    '追逃': ['焦虑', '恐惧'],
    '坠落': ['恐惧', '无助'],
    '重逢': ['喜悦', '怀念'],
    '迷宫': ['困惑', '焦虑'],
    '食物': ['满足', '欲望'],
    '童年': ['怀念', '忧伤'],
    '考试': ['焦虑', '紧张'],
    '迷路': ['焦虑', '迷茫'],
  };
  
  const tags = new Set(emotions);
  const impressionEmotions = impressionEmotionMap[impression] || [];
  for (const e of impressionEmotions) tags.add(e);
  
  return Array.from(tags).slice(0, 3);
}

export function addDailyEvent(description: string): void {
  dailyEvents.push(description);
  if (dailyEvents.length > 50) dailyEvents.shift();
}

export function addDailyEmotion(emotion: string): void {
  dailyEmotions.push(emotion);
  if (dailyEmotions.length > 50) dailyEmotions.shift();
}

export function getDreamSnapshot(): DreamPerception {
  return {
    timestamp: Date.now(),
    sleep_stage: currentStage,
    total_sleep_min: Math.round(totalSleepTime / 60),
    rem_cycles: remCycleCount,
    dreams_tonight: tonightDreams.length,
    remembered_dreams: tonightDreams.filter(d => d.remembered).length,
    residual_emotion: residualEmotion,
    residual_intensity: Math.round(residualIntensity * 100) / 100,
    last_dream: tonightDreams.length > 0 ? tonightDreams[tonightDreams.length - 1].content.slice(0, 60) : null,
  };
}

export function dreamEmotionTick(): void {
  // 残留情绪随时间衰减
  if (residualEmotion && currentStage === 'awake') {
    residualIntensity = clamp(residualIntensity - 0.00001, 0, 1);
    if (residualIntensity <= 0.05) {
      residualEmotion = null;
      residualIntensity = 0;
    }
  }
}

export interface DreamPerception {
  timestamp: number;
  sleep_stage: string;
  total_sleep_min: number;
  rem_cycles: number;
  dreams_tonight: number;
  remembered_dreams: number;
  residual_emotion: string | null;
  residual_intensity: number;
  last_dream: string | null;
}
