/**
 * 第六圈：个人伸展 — 学习/工作/娱乐/艺术/社会 五维
 *
 * 个人向外延展的完整模型：
 *   学习: 知识图谱、技能树、学习进度
 *   工作: 项目进展、成就感、倦怠
 *   娱乐: 游戏/运动/旅行/社交娱乐
 *   艺术: 音乐/绘画/写作/摄影/手工
 *   社会: 社区参与/志愿者/公民责任/公共事务
 */
import { getDb } from '../common/database';
import { log, clamp } from '../common/utils';

let initialized = false;
let tickCount = 0;

// ============================================================
// 类型定义
// ============================================================

interface Skill {
  id: string;
  name: string;
  category: string;         // tech/humanities/creative/physical/social
  level: number;            // 0-100
  xp: number;
  xp_to_next: number;
  last_practiced_tick: number;
  decay_rate: number;       // 每天自然退化
}

interface LearningState {
  skills: Skill[];
  current_focus: string;     // 当前专注学习的技能
  study_hours_today: number;
  curiosity: number;         // 好奇心 0-100
  learning_momentum: number; // 学习动量 0-100
  books_read_this_year: number;
}

interface WorkState {
  project_name: string;
  progress: number;          // 0-100
  satisfaction: number;      // 工作满意度
  achievement_unlocked_today: boolean;
  burnout: number;           // 倦怠度
  flow_state: boolean;       // 是否在心流状态
  weekly_goals_completed: number;
  weekly_goals_total: number;
  career_growth_momentum: number;
}

interface EntertainmentState {
  gaming_hours_today: number;
  gaming_satisfaction: number;
  sports_type: string;
  sports_minutes_today: number;
  sports_endorphin: number;
  travel_planning: boolean;
  travel_excitement: number;
  social_entertainment_events: number;
  entertainment_balance: number; // -100(纯工作) ~ +100(纯娱乐)
}

interface ArtState {
  music_practice_minutes: number;
  music_skill: number;
  painting_hours: number;
  painting_satisfaction: number;
  writing_words_today: number;
  writing_project: string;
  photography_photos_taken: number;
  craft_project: string;
  creative_flow: boolean;
  aesthetic_satisfaction: number;
}

interface SocialState {
  community_hours_this_month: number;
  volunteer_impact: number;
  civic_engagement: number;    // 公民参与度
  public_affairs_awareness: number;
  social_capital: number;      // 社会资本
  reputation: number;          // 声望
  network_size: number;
  mentor_role: boolean;
  mentee_count: number;
}

interface PersonalExtensionState {
  learning: LearningState;
  work: WorkState;
  entertainment: EntertainmentState;
  art: ArtState;
  social: SocialState;
}

let state: PersonalExtensionState = {
  learning: {
    skills: [
      { id: 'typescript', name: 'TypeScript', category: 'tech', level: 70, xp: 3500, xp_to_next: 5000, last_practiced_tick: 0, decay_rate: 0.5 },
      { id: 'ai_ml', name: 'AI/ML', category: 'tech', level: 65, xp: 3000, xp_to_next: 4500, last_practiced_tick: 0, decay_rate: 0.3 },
      { id: 'chinese_lit', name: '中文文学', category: 'humanities', level: 55, xp: 2000, xp_to_next: 3500, last_practiced_tick: 0, decay_rate: 0.2 },
      { id: 'piano', name: '钢琴', category: 'creative', level: 30, xp: 400, xp_to_next: 1500, last_practiced_tick: 0, decay_rate: 0.8 },
      { id: 'photography', name: '摄影', category: 'creative', level: 45, xp: 1200, xp_to_next: 2500, last_practiced_tick: 0, decay_rate: 0.4 },
      { id: 'social_skill', name: '社交能力', category: 'social', level: 60, xp: 2500, xp_to_next: 4000, last_practiced_tick: 0, decay_rate: 0.3 },
    ],
    current_focus: 'typescript',
    study_hours_today: 0,
    curiosity: 70,
    learning_momentum: 50,
    books_read_this_year: 3,
  },
  work: {
    project_name: 'Yaogal',
    progress: 65,
    satisfaction: 60,
    achievement_unlocked_today: false,
    burnout: 25,
    flow_state: false,
    weekly_goals_completed: 3,
    weekly_goals_total: 5,
    career_growth_momentum: 55,
  },
  entertainment: {
    gaming_hours_today: 0,
    gaming_satisfaction: 50,
    sports_type: 'running',
    sports_minutes_today: 0,
    sports_endorphin: 20,
    travel_planning: false,
    travel_excitement: 0,
    social_entertainment_events: 0,
    entertainment_balance: -20, // 轻微偏工作
  },
  art: {
    music_practice_minutes: 0,
    music_skill: 30,
    painting_hours: 0,
    painting_satisfaction: 40,
    writing_words_today: 0,
    writing_project: '',
    photography_photos_taken: 0,
    craft_project: '',
    creative_flow: false,
    aesthetic_satisfaction: 50,
  },
  social: {
    community_hours_this_month: 0,
    volunteer_impact: 0,
    civic_engagement: 30,
    public_affairs_awareness: 40,
    social_capital: 50,
    reputation: 45,
    network_size: 20,
    mentor_role: false,
    mentee_count: 0,
  },
};

// ============================================================
// 初始化
// ============================================================

export function initPersonalExtension(): void {
  if (initialized) return;

  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS extension_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      skills_json TEXT NOT NULL DEFAULT '[]',
      learning_json TEXT NOT NULL DEFAULT '{}',
      work_json TEXT NOT NULL DEFAULT '{}',
      entertainment_json TEXT NOT NULL DEFAULT '{}',
      art_json TEXT NOT NULL DEFAULT '{}',
      social_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`INSERT OR IGNORE INTO extension_state (id) VALUES (1)`);

  // 学习日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      xp_gained INTEGER,
      level_before REAL,
      level_after REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 恢复状态
  const row = db.prepare('SELECT * FROM extension_state WHERE id = 1').get() as any;
  if (row) {
    try {
      state.learning.skills = JSON.parse(row.skills_json || '[]');
      Object.assign(state.learning, JSON.parse(row.learning_json || '{}'));
      Object.assign(state.work, JSON.parse(row.work_json || '{}'));
      Object.assign(state.entertainment, JSON.parse(row.entertainment_json || '{}'));
      Object.assign(state.art, JSON.parse(row.art_json || '{}'));
      Object.assign(state.social, JSON.parse(row.social_json || '{}'));
    } catch (_) {}
  }

  initialized = true;
  log('C6', '个人伸展模块初始化完成');
}

// ============================================================
// Tick
// ============================================================

export function personalExtensionTick(dtSeconds: number): void {
  tickCount++;

  // 技能自然衰减（每天检查一次）
  if (tickCount % 86400 === 0) {
    for (const skill of state.learning.skills) {
      const daysSincePractice = (tickCount - skill.last_practiced_tick) / 86400;
      if (daysSincePractice > 3) {
        const decay = skill.decay_rate * (daysSincePractice - 3) * 0.5;
        skill.level = clamp(skill.level - decay, 0, 100);
        // XP也退化
        skill.xp = clamp(skill.xp - decay * (skill.xp_to_next / 100), 0, skill.xp_to_next);
      }
    }
  }

  // 工作倦怠自然积累
  if (tickCount % 3600 === 0) {
    state.work.burnout = clamp(state.work.burnout + 0.1, 0, 100);
    if (state.work.burnout > 70) {
      state.work.satisfaction = clamp(state.work.satisfaction - 0.3, 0, 100);
      state.work.flow_state = false;
    }
  }

  // 心流状态随时间褪去
  if (state.work.flow_state && tickCount % 300 === 0) {
    state.work.flow_state = Math.random() < 0.85; // 85%概率维持
    if (!state.work.flow_state) {
      log('C6', '心流状态中断');
    }
  }

  // 娱乐平衡
  const workMinutes = tickCount % 86400 < 57600 ? 480 : 0; // 白天8h假设工作
  const playMinutes = state.entertainment.gaming_hours_today * 60 + state.entertainment.sports_minutes_today;
  state.entertainment.entertainment_balance = clamp(
    ((playMinutes - workMinutes * 0.3) / 100) * 20, -100, 100,
  );

  // 社会资本自然演变
  if (tickCount % 86400 === 0) {
    if (state.social.network_size > 0) {
      state.social.social_capital = clamp(state.social.social_capital + (Math.random() * 2 - 0.5), 0, 100);
    }
  }

  // 持久化
  if (tickCount % 60 === 0) {
    saveState();
  }
}

// ============================================================
// 行为接口
// ============================================================

/** 学习技能 */
export function studySkill(skillId: string, minutes: number, quality: number): void {
  const skill = state.learning.skills.find(s => s.id === skillId);
  if (!skill) return;

  const effectiveMinutes = minutes * (quality / 100);
  const xpGained = Math.floor(effectiveMinutes * 2 * (1 + state.learning.curiosity / 200));
  skill.xp += xpGained;
  skill.last_practiced_tick = tickCount;

  // 升级检测
  const levelBefore = skill.level;
  while (skill.xp >= skill.xp_to_next) {
    skill.xp -= skill.xp_to_next;
    skill.level = Math.min(skill.level + 1, 100);
    skill.xp_to_next = Math.floor(skill.xp_to_next * 1.3);
  }
  if (skill.level > levelBefore) {
    log('C6', `🎯 技能升级: ${skill.name} Lv${levelBefore}→Lv${skill.level}`);
  }

  state.learning.study_hours_today += minutes / 60;
  state.learning.current_focus = skillId;
  state.learning.learning_momentum = clamp(state.learning.learning_momentum + quality * 0.1, 0, 100);

  getDb().prepare(`
    INSERT INTO study_log (tick, skill_id, minutes, xp_gained, level_before, level_after)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tickCount, skillId, minutes, xpGained, levelBefore, skill.level);

  log('C6', `学习${skill.name} ${minutes}分钟 +${xpGained}XP`);
}

/** 完成工作任务 */
export function completeWorkTask(taskName: string, difficulty: number, hours: number): void {
  state.work.progress = clamp(state.work.progress + difficulty * 2, 0, 100);
  state.work.satisfaction = clamp(state.work.satisfaction + difficulty, 0, 100);
  state.work.burnout = clamp(state.work.burnout + hours * 2, 0, 100);

  // 心流触发条件：高难度+低倦怠+好状态
  if (difficulty > 60 && state.work.burnout < 50 && Math.random() < 0.4) {
    state.work.flow_state = true;
    state.work.burnout = clamp(state.work.burnout - 5, 0, 100);
    log('C6', '✨ 进入心流状态');
  }

  // 成就感解锁
  if (state.work.progress >= 100) {
    state.work.achievement_unlocked_today = true;
    state.work.career_growth_momentum = clamp(state.work.career_growth_momentum + 10, 0, 100);
    log('C6', '🏆 项目里程碑达成');
  }
}

/** 运动 */
export function doSports(type: string, minutes: number, intensity: number): void {
  state.entertainment.sports_minutes_today += minutes;
  state.entertainment.sports_type = type;
  state.entertainment.sports_endorphin = clamp(state.entertainment.sports_endorphin + intensity * 0.5, 0, 100);
  // 运动缓解倦怠
  state.work.burnout = clamp(state.work.burnout - intensity * 0.3, 0, 100);
  log('C6', `${type} ${minutes}分钟 强度${intensity}`);
}

/** 玩游戏 */
export function playGame(hours: number, satisfaction: number): void {
  state.entertainment.gaming_hours_today += hours;
  state.entertainment.gaming_satisfaction = clamp(
    state.entertainment.gaming_satisfaction * 0.7 + satisfaction * 0.3, 0, 100,
  );
  // 游戏降倦怠但也可能降低工作动力
  state.work.burnout = clamp(state.work.burnout - hours * 3, 0, 100);
  log('C6', `游戏${hours}h 满意度${satisfaction}`);
}

/** 艺术创作 */
export function artCreation(type: 'music' | 'painting' | 'writing' | 'photography' | 'craft', minutes: number): void {
  switch (type) {
    case 'music':
      state.art.music_practice_minutes += minutes;
      state.art.music_skill = clamp(state.art.music_skill + minutes * 0.02, 0, 100);
      break;
    case 'painting':
      state.art.painting_hours += minutes / 60;
      state.art.painting_satisfaction = clamp(state.art.painting_satisfaction + minutes * 0.01, 0, 100);
      break;
    case 'writing':
      state.art.writing_words_today += Math.floor(minutes * 15);
      break;
    case 'photography':
      state.art.photography_photos_taken += Math.floor(minutes / 10);
      break;
    case 'craft':
      state.art.craft_project = '进行中';
      break;
  }
  state.art.aesthetic_satisfaction = clamp(state.art.aesthetic_satisfaction + minutes * 0.01, 0, 100);

  // 创造性心流
  if (minutes > 30 && Math.random() < 0.5) {
    state.art.creative_flow = true;
    log('C6', `🎨 ${type}创作进入心流`);
  }
}

/** 社会参与 */
export function socialEngagement(type: 'community' | 'volunteer' | 'civic', hours: number): void {
  switch (type) {
    case 'community':
      state.social.community_hours_this_month += hours;
      state.social.social_capital = clamp(state.social.social_capital + hours * 0.5, 0, 100);
      break;
    case 'volunteer':
      state.social.volunteer_impact = clamp(state.social.volunteer_impact + hours * 2, 0, 100);
      state.social.reputation = clamp(state.social.reputation + hours, 0, 100);
      break;
    case 'civic':
      state.social.civic_engagement = clamp(state.social.civic_engagement + hours * 1.5, 0, 100);
      break;
  }
  // 社会参与提升公共事务意识
  state.social.public_affairs_awareness = clamp(state.social.public_affairs_awareness + hours * 0.3, 0, 100);
}

/** 阅读书籍 */
export function readBook(bookName: string, pages: number): void {
  state.learning.books_read_this_year++;
  state.learning.curiosity = clamp(state.learning.curiosity + 3, 0, 100);
  log('C6', `📚 读完: ${bookName} (${pages}页) 今年第${state.learning.books_read_this_year}本`);
}

// ============================================================
// 每日重置检查
// ============================================================

let lastDayReset = -1;

export function checkDayResetExtension(worldDay: number): void {
  if (worldDay !== lastDayReset) {
    state.learning.study_hours_today = 0;
    state.work.achievement_unlocked_today = false;
    state.entertainment.gaming_hours_today = 0;
    state.entertainment.sports_minutes_today = 0;
    state.art.writing_words_today = 0;
    state.art.photography_photos_taken = 0;
    state.art.creative_flow = false;
    lastDayReset = worldDay;
  }
}

// ============================================================
// 持久化
// ============================================================

function saveState(): void {
  getDb().prepare(`
    UPDATE extension_state SET
      skills_json = ?, learning_json = ?, work_json = ?,
      entertainment_json = ?, art_json = ?, social_json = ?,
      updated_at = datetime('now','localtime')
    WHERE id = 1
  `).run(
    JSON.stringify(state.learning.skills),
    JSON.stringify({ study_hours_today: state.learning.study_hours_today, curiosity: state.learning.curiosity, learning_momentum: state.learning.learning_momentum, books_read_this_year: state.learning.books_read_this_year }),
    JSON.stringify(state.work),
    JSON.stringify(state.entertainment),
    JSON.stringify(state.art),
    JSON.stringify(state.social),
  );
}

// ============================================================
// 快照接口
// ============================================================

export function getExtensionSnapshot(): object {
  return {
    learning: {
      skills: state.learning.skills.map(s => ({
        name: s.name, level: s.level.toFixed(0), category: s.category,
        decay_at_risk: (tickCount - s.last_practiced_tick) > 86400 * 3,
      })),
      current_focus: state.learning.current_focus,
      study_hours_today: state.learning.study_hours_today.toFixed(1),
      curiosity: state.learning.curiosity.toFixed(0),
      learning_momentum: state.learning.learning_momentum.toFixed(0),
      books_this_year: state.learning.books_read_this_year,
    },
    work: {
      project: state.work.project_name,
      progress: state.work.progress.toFixed(0),
      satisfaction: state.work.satisfaction.toFixed(0),
      burnout: state.work.burnout.toFixed(0),
      flow_state: state.work.flow_state,
      weekly_goals: `${state.work.weekly_goals_completed}/${state.work.weekly_goals_total}`,
      career_momentum: state.work.career_growth_momentum.toFixed(0),
    },
    entertainment: {
      gaming_hours: state.entertainment.gaming_hours_today.toFixed(1),
      sports: { type: state.entertainment.sports_type, minutes: state.entertainment.sports_minutes_today, endorphin: state.entertainment.sports_endorphin.toFixed(0) },
      balance: state.entertainment.entertainment_balance.toFixed(0),
      travel: state.entertainment.travel_planning ? { excitement: state.entertainment.travel_excitement.toFixed(0) } : null,
    },
    art: {
      music: { minutes: state.art.music_practice_minutes, skill: state.art.music_skill.toFixed(0) },
      painting: { hours: state.art.painting_hours.toFixed(1), satisfaction: state.art.painting_satisfaction.toFixed(0) },
      writing: { words_today: state.art.writing_words_today, project: state.art.writing_project },
      creative_flow: state.art.creative_flow,
      aesthetic_satisfaction: state.art.aesthetic_satisfaction.toFixed(0),
    },
    social: {
      community_hours_this_month: state.social.community_hours_this_month.toFixed(0),
      volunteer_impact: state.social.volunteer_impact.toFixed(0),
      civic_engagement: state.social.civic_engagement.toFixed(0),
      social_capital: state.social.social_capital.toFixed(0),
      reputation: state.social.reputation.toFixed(0),
      network_size: state.social.network_size,
      is_mentor: state.social.mentor_role,
    },
  };
}
