/**
 * 行为系统 — 补全"感知→决策→执行→世界变化→新感知"完整闭环
 * P0-2 核心模块
 *
 * 三类行为：
 *   - immediate: 即时生效（开灯、喝水、坐下）
 *   - continuous: 有持续时长（工作、睡眠、走路）
 *   - chained: 多子行为序列（出门=换衣→出门→通勤→到岗）
 */

import { getDb } from '../../common/database';
import { worldBus } from '../../core_bus/event_bus';

// ── 行为类型 ──
export type ActionCategory = 'immediate' | 'continuous' | 'chained';
export type ActionStatus = 'pending' | 'active' | 'completed' | 'interrupted' | 'failed';

export interface Consequence {
  /** 延迟秒数（0=即时） */
  delay_seconds: number;
  /** 目标模块 */
  target: 'physio' | 'self' | 'space' | 'mood' | 'chem' | 'intimacy' | 'social' | 'economy';
  /** 效果key */
  effect_key: string;
  /** 效果值 */
  effect_value: number;
  /** 描述 */
  description: string;
  /** 是否已触发 */
  triggered?: boolean;
  /** 触发时间戳 */
  triggered_at?: number;
}

export interface ActionDefinition {
  id: string;
  name: string;
  category: ActionCategory;
  /** 预计持续时间（秒），0=即时 */
  duration_seconds: number;
  /** 可以中断吗 */
  interruptible: boolean;
  /** 需要的前置条件 */
  preconditions: string[];
  /** 即时后果（delay_seconds=0） */
  immediate_consequences: Consequence[];
  /** 延迟后果（delay_seconds>0） */
  delayed_consequences: Consequence[];
  /** 连锁行为的子行为ID列表 */
  sub_actions: string[];
  /** 持续行为中每秒产生的效果 */
  per_tick_effects?: { target: string; effect_key: string; effect_per_second: number }[];
}

export interface ActiveAction {
  instance_id: string;
  action_def_id: string;
  status: ActionStatus;
  started_at: number;
  elapsed_seconds: number;
  duration_seconds: number;
  progress: number; // 0-1
  consequences_triggered: number;
  total_consequences: number;
  sub_action_index: number; // chained 行为当前子行为索引
}

// ── 内置行为库 ──
const BUILTIN_ACTIONS: Record<string, ActionDefinition> = {
  // === 即时行为 ===
  drink_water: {
    id: 'drink_water', name: '喝水', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'physio', effect_key: 'hydration', effect_value: 15, description: '补充水分' },
      { delay_seconds: 0, target: 'self', effect_key: 'fatigue', effect_value: -2, description: '稍缓解疲劳' }
    ],
    delayed_consequences: [], sub_actions: []
  },
  eat_meal: {
    id: 'eat_meal', name: '吃饭', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'self', effect_key: 'hunger', effect_value: -60, description: '饱腹' },
      { delay_seconds: 0, target: 'self', effect_key: 'energy', effect_value: 15, description: '补充能量' },
      { delay_seconds: 0, target: 'physio', effect_key: 'blood_sugar', effect_value: 20, description: '血糖回升' }
    ],
    delayed_consequences: [
      { delay_seconds: 7200, target: 'self', effect_key: 'hunger', effect_value: 20, description: '开始消化，饥饿感回升' }
    ],
    sub_actions: []
  },
  sit_down: {
    id: 'sit_down', name: '坐下', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'self', effect_key: 'posture', effect_value: 1, description: '切换坐姿' },
      { delay_seconds: 0, target: 'self', effect_key: 'energy', effect_value: 5, description: '坐下休息' }
    ],
    delayed_consequences: [
      { delay_seconds: 3600, target: 'self', effect_key: 'fatigue_back', effect_value: 10, description: '久坐背部疲劳' },
      { delay_seconds: 7200, target: 'self', effect_key: 'fatigue_neck', effect_value: 8, description: '久坐颈部疲劳' }
    ],
    sub_actions: []
  },
  stand_up: {
    id: 'stand_up', name: '站起', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'self', effect_key: 'posture', effect_value: 2, description: '切换站姿' },
      { delay_seconds: 0, target: 'self', effect_key: 'fatigue_legs', effect_value: 2, description: '腿部开始受力' }
    ],
    delayed_consequences: [],
    sub_actions: []
  },
  lie_down: {
    id: 'lie_down', name: '躺下', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'self', effect_key: 'posture', effect_value: 3, description: '切换躺姿' },
      { delay_seconds: 0, target: 'self', effect_key: 'energy', effect_value: 3, description: '躺下放松' },
      { delay_seconds: 0, target: 'self', effect_key: 'fatigue_back', effect_value: -5, description: '背部放松' }
    ],
    delayed_consequences: [],
    sub_actions: []
  },
  turn_on_light: {
    id: 'turn_on_light', name: '开灯', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'space', effect_key: 'light_level', effect_value: 80, description: '灯光亮起' }
    ],
    delayed_consequences: [],
    sub_actions: []
  },
  turn_off_light: {
    id: 'turn_off_light', name: '关灯', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'space', effect_key: 'light_level', effect_value: 10, description: '灯光熄灭' }
    ],
    delayed_consequences: [],
    sub_actions: []
  },

  // === 持续行为 ===
  work: {
    id: 'work', name: '工作', category: 'continuous',
    duration_seconds: 3600, interruptible: true, preconditions: [],
    immediate_consequences: [],
    delayed_consequences: [
      { delay_seconds: 1800, target: 'self', effect_key: 'fatigue', effect_value: 8, description: '工作疲劳累积' },
      { delay_seconds: 3600, target: 'self', effect_key: 'fatigue_eyes', effect_value: 6, description: '用眼疲劳' },
      { delay_seconds: 3600, target: 'self', effect_key: 'fatigue_neck', effect_value: 5, description: '久坐颈部疲劳' },
      { delay_seconds: 3600, target: 'self', effect_key: 'energy', effect_value: -15, description: '精力消耗' },
      { delay_seconds: 3600, target: 'mood', effect_key: 'work_stress', effect_value: 5, description: '工作压力' }
    ],
    sub_actions: [],
    per_tick_effects: [
      { target: 'self', effect_key: 'fatigue', effect_per_second: 0.002 },
      { target: 'self', effect_key: 'energy', effect_per_second: -0.004 }
    ]
  },
  sleep: {
    id: 'sleep', name: '睡眠', category: 'continuous',
    duration_seconds: 28800, interruptible: true, preconditions: ['lie_down'],
    immediate_consequences: [],
    delayed_consequences: [
      { delay_seconds: 14400, target: 'self', effect_key: 'energy', effect_value: 30, description: '深度睡眠恢复精力' },
      { delay_seconds: 14400, target: 'self', effect_key: 'fatigue', effect_value: -15, description: '深度睡眠消除疲劳' },
      { delay_seconds: 28800, target: 'self', effect_key: 'energy', effect_value: 25, description: '完整睡眠精力恢复' },
      { delay_seconds: 28800, target: 'self', effect_key: 'fatigue', effect_value: -20, description: '完整睡眠消除疲劳' },
      { delay_seconds: 28800, target: 'physio', effect_key: 'immune', effect_value: 5, description: '免疫系统恢复' }
    ],
    sub_actions: [],
    per_tick_effects: [
      { target: 'self', effect_key: 'energy', effect_per_second: 0.001 },
      { target: 'self', effect_key: 'fatigue', effect_per_second: -0.0005 }
    ]
  },
  walk: {
    id: 'walk', name: '走路', category: 'continuous',
    duration_seconds: 600, interruptible: true, preconditions: ['stand_up'],
    immediate_consequences: [],
    delayed_consequences: [
      { delay_seconds: 600, target: 'self', effect_key: 'fatigue_legs', effect_value: 3, description: '腿部疲劳' },
      { delay_seconds: 600, target: 'self', effect_key: 'energy', effect_value: -5, description: '体力消耗' },
      { delay_seconds: 600, target: 'mood', effect_key: 'mood', effect_value: 5, description: '散步改善心情' }
    ],
    sub_actions: [],
    per_tick_effects: [
      { target: 'self', effect_key: 'fatigue_legs', effect_per_second: 0.005 }
    ]
  },

  // === 连锁行为 ===
  go_out: {
    id: 'go_out', name: '出门', category: 'chained',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'space', effect_key: 'scene', effect_value: 1, description: '场景→户外' }
    ],
    delayed_consequences: [],
    sub_actions: ['change_clothes', 'leave_house', 'commute']
  },
  change_clothes: {
    id: 'change_clothes', name: '换衣服', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'self', effect_key: 'clothing', effect_value: 1, description: '换上外出服' }
    ],
    delayed_consequences: [], sub_actions: []
  },
  leave_house: {
    id: 'leave_house', name: '离家', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: ['change_clothes'],
    immediate_consequences: [
      { delay_seconds: 0, target: 'space', effect_key: 'scene', effect_value: 2, description: '出门' }
    ],
    delayed_consequences: [], sub_actions: []
  },
  commute: {
    id: 'commute', name: '通勤', category: 'continuous',
    duration_seconds: 1800, interruptible: true, preconditions: ['leave_house'],
    immediate_consequences: [],
    delayed_consequences: [
      { delay_seconds: 1800, target: 'self', effect_key: 'fatigue', effect_value: 3, description: '通勤疲劳' },
      { delay_seconds: 1800, target: 'self', effect_key: 'energy', effect_value: -5, description: '通勤消耗' }
    ],
    sub_actions: [],
    per_tick_effects: [
      { target: 'self', effect_key: 'fatigue', effect_per_second: 0.001 }
    ]
  },
  go_home: {
    id: 'go_home', name: '回家', category: 'chained',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'space', effect_key: 'scene', effect_value: 0, description: '场景→家' }
    ],
    delayed_consequences: [],
    sub_actions: ['commute_back', 'enter_house']
  },
  commute_back: {
    id: 'commute_back', name: '回程通勤', category: 'continuous',
    duration_seconds: 1800, interruptible: false, preconditions: [],
    immediate_consequences: [],
    delayed_consequences: [
      { delay_seconds: 1800, target: 'self', effect_key: 'fatigue', effect_value: 3, description: '回程疲劳' }
    ],
    sub_actions: [],
    per_tick_effects: [
      { target: 'self', effect_key: 'fatigue', effect_per_second: 0.001 }
    ]
  },
  enter_house: {
    id: 'enter_house', name: '进家', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: ['commute_back'],
    immediate_consequences: [
      { delay_seconds: 0, target: 'space', effect_key: 'scene', effect_value: 0, description: '回到家' },
      { delay_seconds: 0, target: 'self', effect_key: 'clothing', effect_value: 0, description: '换回家居服' }
    ],
    delayed_consequences: [], sub_actions: []
  },

  // === 熬夜（典型延迟后果） ===
  stay_up_late: {
    id: 'stay_up_late', name: '熬夜', category: 'continuous',
    duration_seconds: 7200, interruptible: true, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'self', effect_key: 'fatigue', effect_value: 20, description: '熬夜实时疲劳' },
      { delay_seconds: 0, target: 'self', effect_key: 'energy', effect_value: -10, description: '精力透支' }
    ],
    delayed_consequences: [
      { delay_seconds: 43200, target: 'physio', effect_key: 'immune', effect_value: -15, description: '免疫力下降（12h后）' },
      { delay_seconds: 86400, target: 'self', effect_key: 'fatigue', effect_value: 10, description: '次日持续疲劳' },
      { delay_seconds: 259200, target: 'physio', effect_key: 'cold_risk', effect_value: 30, description: '感冒概率提升（72h后）' },
      { delay_seconds: 604800, target: 'self', effect_key: 'skin_quality', effect_value: -10, description: '皮肤状态下降（1周后）' }
    ],
    sub_actions: [],
    per_tick_effects: [
      { target: 'self', effect_key: 'fatigue', effect_per_second: 0.003 }
    ]
  },

  // === 连续三天不出门（延迟连锁） ===
  stay_indoors: {
    id: 'stay_indoors', name: '不出门', category: 'immediate',
    duration_seconds: 0, interruptible: false, preconditions: [],
    immediate_consequences: [],
    delayed_consequences: [
      { delay_seconds: 86400, target: 'space', effect_key: 'air_quality', effect_value: -15, description: '空气变浑浊（1天后）' },
      { delay_seconds: 172800, target: 'space', effect_key: 'clutter', effect_value: 20, description: '杂物堆积（2天后）' },
      { delay_seconds: 259200, target: 'mood', effect_key: 'loneliness', effect_value: 15, description: '社交孤独累积（3天后）' },
      { delay_seconds: 259200, target: 'self', effect_key: 'energy', effect_value: -5, description: '室内倦怠' }
    ],
    sub_actions: []
  },

  // === 剧烈运动 ===
  intense_exercise: {
    id: 'intense_exercise', name: '剧烈运动', category: 'continuous',
    duration_seconds: 3600, interruptible: true, preconditions: [],
    immediate_consequences: [
      { delay_seconds: 0, target: 'self', effect_key: 'fatigue', effect_value: 25, description: '运动疲劳' },
      { delay_seconds: 0, target: 'self', effect_key: 'energy', effect_value: -20, description: '能量消耗' },
      { delay_seconds: 0, target: 'physio', effect_key: 'heart_rate', effect_value: 40, description: '心率飙升' }
    ],
    delayed_consequences: [
      { delay_seconds: 3600, target: 'mood', effect_key: 'mood', effect_value: 10, description: '运动后愉悦' },
      { delay_seconds: 28800, target: 'physio', effect_key: 'muscle_recovery', effect_value: -10, description: '肌肉酸痛（8h后）' },
      { delay_seconds: 86400, target: 'physio', effect_key: 'fitness', effect_value: 2, description: '体能提升（24h后）' },
      { delay_seconds: 86400, target: 'self', effect_key: 'energy', effect_value: 5, description: '精力恢复超量补偿' }
    ],
    sub_actions: [],
    per_tick_effects: [
      { target: 'self', effect_key: 'fatigue', effect_per_second: 0.007 },
      { target: 'self', effect_key: 'energy', effect_per_second: -0.005 },
      { target: 'physio', effect_key: 'heart_rate', effect_per_second: 0.01 }
    ]
  }
};

// ── 系统状态 ──
let activeActions: Map<string, ActiveAction> = new Map();
let consequenceQueue: { trigger_at: number; consequence: Consequence; action_instance_id: string }[] = [];

// ── 初始化 ──
export function initActionSystem(): void {
  ensureActionTables();
  // 从DB恢复未完成的行为
  loadActiveActionsFromDB();
}

function ensureActionTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT UNIQUE NOT NULL,
      action_def_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      elapsed_seconds REAL DEFAULT 0,
      category TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS consequence_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_instance_id TEXT NOT NULL,
      trigger_at INTEGER NOT NULL,
      target TEXT NOT NULL,
      effect_key TEXT NOT NULL,
      effect_value REAL NOT NULL,
      description TEXT,
      triggered INTEGER DEFAULT 0,
      triggered_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_cq_trigger ON consequence_queue(triggered, trigger_at);
    CREATE INDEX IF NOT EXISTS idx_action_status ON action_log(status);
  `);
}

function loadActiveActionsFromDB(): void {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM action_log WHERE status = 'active'`).all() as any[];
  for (const row of rows) {
    const def = BUILTIN_ACTIONS[row.action_def_id];
    if (!def) continue;
    activeActions.set(row.instance_id, {
      instance_id: row.instance_id,
      action_def_id: row.action_def_id,
      status: 'active',
      started_at: row.started_at,
      elapsed_seconds: row.elapsed_seconds || 0,
      duration_seconds: def.duration_seconds,
      progress: def.duration_seconds > 0 ? (row.elapsed_seconds || 0) / def.duration_seconds : 1,
      consequences_triggered: 0,
      total_consequences: def.immediate_consequences.length + def.delayed_consequences.length,
      sub_action_index: 0
    });
  }
  // 恢复未触发的延迟后果
  const cqRows = db.prepare(`SELECT * FROM consequence_queue WHERE triggered = 0 ORDER BY trigger_at`).all() as any[];
  consequenceQueue = cqRows.map(r => ({
    trigger_at: r.trigger_at,
    action_instance_id: r.action_instance_id,
    consequence: {
      delay_seconds: 0,
      target: r.target as any,
      effect_key: r.effect_key,
      effect_value: r.effect_value,
      description: r.description,
      triggered: false
    }
  }));
}

// ── 执行行为 ──
export function executeAction(actionDefId: string, customDuration?: number): string | null {
  const def = BUILTIN_ACTIONS[actionDefId];
  if (!def) {
    console.error(`[ActionSystem] 未知行为: ${actionDefId}`);
    return null;
  }

  // 检查前置条件
  for (const pre of def.preconditions) {
    if (pre === 'lie_down') {
      // TODO: 检查自我实体当前姿势
    }
  }

  const instanceId = `${actionDefId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  const duration = customDuration || def.duration_seconds;

  const active: ActiveAction = {
    instance_id: instanceId,
    action_def_id: actionDefId,
    status: 'active',
    started_at: now,
    elapsed_seconds: 0,
    duration_seconds: duration,
    progress: 0,
    consequences_triggered: 0,
    total_consequences: def.immediate_consequences.length + def.delayed_consequences.length,
    sub_action_index: 0
  };

  // 写入DB
  const db = getDb();
  db.prepare(`
    INSERT INTO action_log (instance_id, action_def_id, status, started_at, elapsed_seconds, category)
    VALUES (?, ?, 'active', ?, 0, ?)
  `).run(instanceId, actionDefId, now, def.category);

  // 即时后果
  for (const c of def.immediate_consequences) {
    applyConsequence(c, instanceId);
    active.consequences_triggered++;
  }

  // 延迟后果入队
  for (const c of def.delayed_consequences) {
    const triggerAt = now + c.delay_seconds;
    consequenceQueue.push({ trigger_at: triggerAt, consequence: { ...c, triggered: false }, action_instance_id: instanceId });
    db.prepare(`
      INSERT INTO consequence_queue (action_instance_id, trigger_at, target, effect_key, effect_value, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(instanceId, triggerAt, c.target, c.effect_key, c.effect_value, c.description);
  }

  // 如果是持续行为或即时行为，立即标记完成
  if (def.category === 'immediate') {
    active.status = 'completed';
    active.progress = 1;
    activeActions.delete(instanceId);
    db.prepare(`UPDATE action_log SET status='completed', completed_at=?, elapsed_seconds=0 WHERE instance_id=?`)
      .run(Math.floor(Date.now() / 1000), instanceId);
    worldBus.emit('action.finish', { instanceId, actionDefId, status: 'completed' });
  } else {
    activeActions.set(instanceId, active);
    worldBus.emit('action.start', { instanceId, actionDefId, category: def.category, duration });
  }

  worldBus.emit('action.execute', { instanceId, actionDefId, category: def.category });

  return instanceId;
}

// ── 中断行为 ──
export function interruptAction(instanceId: string): boolean {
  const active = activeActions.get(instanceId);
  if (!active) return false;
  const def = BUILTIN_ACTIONS[active.action_def_id];
  if (!def || !def.interruptible) return false;

  active.status = 'interrupted';
  activeActions.delete(instanceId);

  const db = getDb();
  db.prepare(`UPDATE action_log SET status='interrupted', completed_at=?, elapsed_seconds=? WHERE instance_id=?`)
    .run(Math.floor(Date.now() / 1000), active.elapsed_seconds, instanceId);

  worldBus.emit('action.finish', { instanceId, actionDefId: active.action_def_id, status: 'interrupted' });
  return true;
}

// ── 主循环 tick ──
export function tickActionSystem(deltaSeconds: number): void {
  const now = Math.floor(Date.now() / 1000);

  // 推进所有活跃行为
  for (const [id, active] of activeActions) {
    const def = BUILTIN_ACTIONS[active.action_def_id];
    if (!def) continue;

    active.elapsed_seconds += deltaSeconds;
    active.progress = active.duration_seconds > 0
      ? Math.min(1, active.elapsed_seconds / active.duration_seconds)
      : 1;

    // per_tick_effects
    if (def.per_tick_effects) {
      for (const effect of def.per_tick_effects) {
        applyEffect(effect.target, effect.effect_key, effect.effect_per_second * deltaSeconds);
      }
    }

    // 行为完成？
    if (active.progress >= 1) {
      active.status = 'completed';
      activeActions.delete(id);

      const db = getDb();
      db.prepare(`UPDATE action_log SET status='completed', completed_at=?, elapsed_seconds=? WHERE instance_id=?`)
        .run(Math.floor(Date.now() / 1000), active.elapsed_seconds, id);

      worldBus.emit('action.finish', { instanceId: id, actionDefId: active.action_def_id, status: 'completed' });

      // 连锁行为：触发子行为
      if (def.category === 'chained' && def.sub_actions.length > 0) {
        for (const subId of def.sub_actions) {
          executeAction(subId);
        }
      }
    }
  }

  // 处理延迟后果队列
  const triggered: number[] = [];
  const db = getDb();
  for (let i = 0; i < consequenceQueue.length; i++) {
    const item = consequenceQueue[i];
    if (item.trigger_at <= now && !item.consequence.triggered) {
      applyConsequence(item.consequence, item.action_instance_id);
      item.consequence.triggered = true;
      item.consequence.triggered_at = now;
      triggered.push(i);

      db.prepare(`UPDATE consequence_queue SET triggered=1, triggered_at=? WHERE action_instance_id=? AND trigger_at=?`)
        .run(now, item.action_instance_id, item.trigger_at);
    }
  }
  // 清理已触发的（保留24小时）
  consequenceQueue = consequenceQueue.filter((_, i) => !triggered.includes(i));
}

// ── 应用后果到世界 ──
function applyConsequence(c: Consequence, instanceId: string): void {
  applyEffect(c.target, c.effect_key, c.effect_value);
  worldBus.emit('consequence.applied', {
    instanceId, target: c.target, effect_key: c.effect_key,
    effect_value: c.effect_value, description: c.description
  });
}

function applyEffect(target: string, key: string, value: number): void {
  // 通过事件总线通知对应模块
  worldBus.emit(`world.effect`, { target, key, value });
}

// ── 查询 ──
export function getActiveActions(): ActiveAction[] {
  return Array.from(activeActions.values());
}

export function getActionDef(actionId: string): ActionDefinition | undefined {
  return BUILTIN_ACTIONS[actionId];
}

export function getAllActionDefs(): ActionDefinition[] {
  return Object.values(BUILTIN_ACTIONS);
}

export function getPendingConsequences(): { trigger_at: number; consequence: Consequence; instance_id: string }[] {
  return consequenceQueue
    .filter(c => !c.consequence.triggered)
    .map(c => ({ trigger_at: c.trigger_at, consequence: c.consequence, instance_id: c.action_instance_id }))
    .sort((a, b) => a.trigger_at - b.trigger_at);
}

export function getConsequenceQueueStats(): { total: number; pending: number; triggered: number } {
  const triggered = consequenceQueue.filter(c => c.consequence.triggered).length;
  return {
    total: consequenceQueue.length,
    pending: consequenceQueue.length - triggered,
    triggered
  };
}

/** 清空所有活跃行为（测试用） */
export function clearAllActiveActions(): void {
  const ids = Array.from(activeActions.keys());
  for (const id of ids) {
    const def = BUILTIN_ACTIONS[activeActions.get(id)?.action_def_id || ''];
    if (def?.interruptible || true) {
      activeActions.delete(id);
      const db = getDb();
      db.prepare(`UPDATE action_log SET status='interrupted', completed_at=? WHERE instance_id=?`)
        .run(Math.floor(Date.now() / 1000), id);
    }
  }
}
