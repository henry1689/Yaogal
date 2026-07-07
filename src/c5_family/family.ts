/**
 * 第五圈：家庭 — 家庭角色/责任分配/情感三角/代际关系
 *
 * 四维度：角色、责任、情感三角、代际
 * 在瑶光世界中，伴侣称为"玉瑶"，孩子由生育模块出生
 */
import { getDb } from '../common/database';
import { log, clamp } from '../common/utils';

let initialized = false;
let tickCount = 0;

// ============================================================
// 常量
// ============================================================

// 家庭角色
type FamilyRole = 'provider' | 'nurturer' | 'disciplinarian' | 'playmate' | 'mediator' | 'homemaker';

// 责任类型
type ResponsibilityType = 'financial' | 'childcare' | 'household' | 'emotional_labor' | 'social_coordination' | 'healthcare';

// ============================================================
// 状态类型
// ============================================================

interface FamilyMember {
  id: string;
  name: string;
  role: string;             // self/partner/child/parent/grandparent/sibling
  age: number;
  health: number;
  happiness: number;
  stress: number;
}

interface RoleProfile {
  role: FamilyRole;
  competence: number;       // 0-100 胜任度
  satisfaction: number;     // 0-100 满意度
  burnout: number;          // 0-100 倦怠度
  hours_per_day: number;    // 日均投入时间
}

interface ResponsibilityAllocation {
  type: ResponsibilityType;
  self_pct: number;         // 自己承担百分比
  partner_pct: number;      // 伴侣承担百分比
  fairness_balance: number; // -100~100 (负=自己失衡,正=伴侣失衡,0=公平)
}

interface EmotionalTriangle {
  self_partner_warmth: number;      // 自己-伴侣 温暖度 0-100
  self_child_warmth: number;        // 自己-孩子 温暖度
  partner_child_warmth: number;     // 伴侣-孩子 温暖度
  triangle_tension: number;         // 三角张力 0-100
  jealousy_flag: boolean;           // 是否存在嫉妒
  alliance_pattern: string;         // 结盟模式 none/self_child/partner_child/parental
}

interface GenerationalRelation {
  with_father: number;      // 与父亲关系 0-100
  with_mother: number;      // 与母亲关系
  with_father_in_law: number;
  with_mother_in_law: number;
  filial_piety_pressure: number;    // 孝道压力 0-100
  generational_conflict: number;    // 代际冲突 0-100
  support_provided: number;         // 已提供支持量
  support_received: number;         // 收到支持量
}

interface FamilyState {
  // 成员
  family_members: FamilyMember[];

  // 角色
  self_roles: RoleProfile[];
  partner_roles: RoleProfile[];

  // 责任
  responsibilities: ResponsibilityAllocation[];

  // 情感三角
  triangle: EmotionalTriangle;

  // 代际
  generation: GenerationalRelation;

  // 家庭整体
  family_health: number;    // 家庭健康度 0-100
  family_stress: number;    // 家庭压力 0-100
  family_cohesion: number;  // 家庭凝聚力 0-100
  domestic_violence_risk: number; // 家暴风险 0-100
}

let state: FamilyState = {
  family_members: [
    { id: 'self', name: '陈洪毅', role: 'self', age: 30, health: 90, happiness: 70, stress: 40 },
    { id: 'partner', name: '玉瑶', role: 'partner', age: 28, health: 95, happiness: 75, stress: 35 },
  ],

  self_roles: [
    { role: 'provider', competence: 70, satisfaction: 50, burnout: 20, hours_per_day: 10 },
    { role: 'nurturer', competence: 55, satisfaction: 65, burnout: 15, hours_per_day: 4 },
    { role: 'playmate', competence: 75, satisfaction: 80, burnout: 5, hours_per_day: 2 },
  ],
  partner_roles: [
    { role: 'nurturer', competence: 80, satisfaction: 70, burnout: 15, hours_per_day: 8 },
    { role: 'homemaker', competence: 75, satisfaction: 60, burnout: 20, hours_per_day: 6 },
    { role: 'playmate', competence: 80, satisfaction: 85, burnout: 5, hours_per_day: 3 },
  ],

  responsibilities: [
    { type: 'financial', self_pct: 70, partner_pct: 30, fairness_balance: 20 },
    { type: 'childcare', self_pct: 35, partner_pct: 65, fairness_balance: -15 },
    { type: 'household', self_pct: 30, partner_pct: 70, fairness_balance: -20 },
    { type: 'emotional_labor', self_pct: 40, partner_pct: 60, fairness_balance: -10 },
    { type: 'social_coordination', self_pct: 30, partner_pct: 70, fairness_balance: -20 },
    { type: 'healthcare', self_pct: 50, partner_pct: 50, fairness_balance: 0 },
  ],

  triangle: {
    self_partner_warmth: 75,
    self_child_warmth: 70,
    partner_child_warmth: 80,
    triangle_tension: 15,
    jealousy_flag: false,
    alliance_pattern: 'none',
  },

  generation: {
    with_father: 60,
    with_mother: 70,
    with_father_in_law: 50,
    with_mother_in_law: 45,
    filial_piety_pressure: 40,
    generational_conflict: 30,
    support_provided: 50,
    support_received: 30,
  },

  family_health: 75,
  family_stress: 30,
  family_cohesion: 70,
  domestic_violence_risk: 5,
};

// ============================================================
// 初始化
// ============================================================

export function initFamily(): void {
  if (initialized) return;

  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS family_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      family_members_json TEXT NOT NULL DEFAULT '[]',
      self_roles_json TEXT NOT NULL DEFAULT '[]',
      partner_roles_json TEXT NOT NULL DEFAULT '[]',
      responsibilities_json TEXT NOT NULL DEFAULT '[]',
      triangle_json TEXT NOT NULL DEFAULT '{}',
      generation_json TEXT NOT NULL DEFAULT '{}',
      family_health REAL DEFAULT 75,
      family_stress REAL DEFAULT 30,
      family_cohesion REAL DEFAULT 70,
      domestic_violence_risk REAL DEFAULT 5,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`INSERT OR IGNORE INTO family_state (id, generation_json) VALUES (1, '{"with_father":50,"with_mother":60,"with_father_in_law":40,"with_mother_in_law":40,"generational_conflict":30,"support_provided":30,"support_received":20}')`);
  // 首次写入默认三角形字段（避免空JSON覆盖默认状态）
  db.exec(`UPDATE family_state SET triangle_json = '{"parent_child_bond":70,"triangle_tension":20,"alliance_pattern":"neutral","jealousy_flag":false}' WHERE id = 1 AND triangle_json = '{}'`);
  // 首次写入默认责任字段
  db.exec(`UPDATE family_state SET responsibilities_json = '[]' WHERE id = 1 AND responsibilities_json = '[]'`);
  // 首次写入默认家庭成员
  db.exec(`UPDATE family_state SET family_members_json = '[]' WHERE id = 1 AND family_members_json = '[]'`);
  db.exec(`UPDATE family_state SET self_roles_json = '[]' WHERE id = 1 AND self_roles_json = '[]'`);
  db.exec(`UPDATE family_state SET partner_roles_json = '[]' WHERE id = 1 AND partner_roles_json = '[]'`);

  // 家庭事件日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS family_event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      member TEXT,
      detail TEXT,
      outcome TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 恢复状态
  const row = db.prepare('SELECT * FROM family_state WHERE id = 1').get() as any;
  if (row) {
    try {
      state.family_members = JSON.parse(row.family_members_json || '[]');
      state.self_roles = JSON.parse(row.self_roles_json || '[]');
      state.partner_roles = JSON.parse(row.partner_roles_json || '[]');
      state.responsibilities = JSON.parse(row.responsibilities_json || '[]');
      const triParsed = JSON.parse(row.triangle_json || '{}') || {};
      state.triangle = {
        self_partner_warmth: triParsed.self_partner_warmth ?? 75,
        self_child_warmth: triParsed.self_child_warmth ?? 70,
        partner_child_warmth: triParsed.partner_child_warmth ?? 80,
        triangle_tension: triParsed.triangle_tension ?? 15,
        jealousy_flag: triParsed.jealousy_flag ?? false,
        alliance_pattern: triParsed.alliance_pattern ?? 'none',
      };
      const genParsed = JSON.parse(row.generation_json || '{}') || {};
      state.generation = {
        with_father: genParsed.with_father ?? 50,
        with_mother: genParsed.with_mother ?? 60,
        with_father_in_law: genParsed.with_father_in_law ?? 40,
        with_mother_in_law: genParsed.with_mother_in_law ?? 40,
        filial_piety_pressure: genParsed.filial_piety_pressure ?? 25,
        generational_conflict: genParsed.generational_conflict ?? 30,
        support_provided: genParsed.support_provided ?? 30,
        support_received: genParsed.support_received ?? 20,
      };
    } catch (_) {}
    state.family_health = row.family_health ?? 75;
    state.family_stress = row.family_stress ?? 30;
    state.family_cohesion = row.family_cohesion ?? 70;
    state.domestic_violence_risk = row.domestic_violence_risk ?? 5;
  }

  initialized = true;
  log('C5', '家庭模块初始化完成');
}

// ============================================================
// Tick
// ============================================================

export function familyTick(dtSeconds: number): void {
  tickCount++;

  // 角色倦怠自然积累（每10分钟）
  if (tickCount % 600 === 0) {
    for (const r of state.self_roles) {
      r.burnout = clamp(r.burnout + 0.1, 0, 100);
      r.satisfaction = clamp(r.satisfaction - 0.05, 0, 100);
    }
    for (const r of state.partner_roles) {
      r.burnout = clamp(r.burnout + 0.08, 0, 100);
      r.satisfaction = clamp(r.satisfaction - 0.04, 0, 100);
    }
  }

  // 责任不公导致的伴侣幸福感下降
  for (const resp of state.responsibilities) {
    if (Math.abs(resp.fairness_balance) > 30) {
      const partner = state.family_members.find(m => m.id === 'partner');
      if (partner) {
        partner.stress = clamp(partner.stress + 0.001 * dtSeconds, 0, 100);
        if (resp.fairness_balance < -25) {
          // 伴侣承担太多→不满累积
          partner.happiness = clamp(partner.happiness - 0.002 * dtSeconds, 0, 100);
        }
      }
    }
  }

  // 情感三角张力：三角成员的温暖度失衡会导致张力上升
  const t = state.triangle;
  const avgWarmth = (t.self_partner_warmth + t.self_child_warmth + t.partner_child_warmth) / 3;
  const warmthGap = Math.max(
    Math.abs(t.self_partner_warmth - t.self_child_warmth),
    Math.abs(t.self_partner_warmth - t.partner_child_warmth),
    Math.abs(t.self_child_warmth - t.partner_child_warmth),
  );
  t.triangle_tension = clamp(warmthGap * 0.5 + (100 - avgWarmth) * 0.3, 0, 100);

  // 代际冲突自然演变
  if (tickCount % 3600 === 0) {
    state.generation.generational_conflict = clamp(
      state.generation.generational_conflict + (Math.random() * 2 - 1), 0, 100,
    );
  }

  // 家庭整体健康度 = 成员平均健康 + 凝聚力 - 压力
  const avgMemberHealth = state.family_members.reduce((s, m) => s + m.health, 0) / state.family_members.length;
  const avgHappiness = state.family_members.reduce((s, m) => s + m.happiness, 0) / state.family_members.length;
  state.family_health = clamp((avgMemberHealth * 0.4 + avgHappiness * 0.4 + state.family_cohesion * 0.2), 0, 100);
  state.family_stress = clamp(
    state.family_members.reduce((s, m) => s + m.stress, 0) / state.family_members.length, 0, 100,
  );

  // 家暴风险：高压力 + 高代际冲突 + 低温暖度 → 高风险
  state.domestic_violence_risk = clamp(
    (state.family_stress * 0.3 + state.generation.generational_conflict * 0.3 + (100 - t.self_partner_warmth) * 0.4) * 0.5,
    0, 100,
  );

  // 持久化（每60秒）
  if (tickCount % 60 === 0) {
    saveState();
  }
}

// ============================================================
// 行为接口
// ============================================================

/** 添加家庭成员 */
export function addFamilyMember(member: FamilyMember): void {
  if (state.family_members.find(m => m.id === member.id)) return;
  state.family_members.push(member);
  logEvent('member_added', member.id, `添加家庭成员: ${member.name} (${member.role})`);
  log('C5', `新增家庭成员: ${member.name}`);
}

/** 重新分配责任 */
export function adjustResponsibility(type: ResponsibilityType, selfPct: number): void {
  const resp = state.responsibilities.find(r => r.type === type);
  if (!resp) return;

  const oldBalance = resp.fairness_balance;
  resp.self_pct = selfPct;
  resp.partner_pct = 100 - selfPct;
  resp.fairness_balance = resp.self_pct - resp.partner_pct; // 正值=自己多,负值=伴侣多

  logEvent('responsibility_changed', 'self',
    `${type}: 自己${selfPct}% 伴侣${100-selfPct}% (平衡${oldBalance.toFixed(0)}→${resp.fairness_balance.toFixed(0)})`);
}

/** 伴侣承担更多某个责任（负荷转移到自己身上以减轻伴侣负担） */
export function relievePartnerBurden(type: ResponsibilityType, amountPct: number): void {
  const resp = state.responsibilities.find(r => r.type === type);
  if (!resp) return;
  adjustResponsibility(type, clamp(resp.self_pct + amountPct, 0, 100));
}

/** 增强亲情温暖（给孩子/伴侣） */
export function expressWarmth(target: 'partner' | 'child', amount: number): void {
  if (target === 'partner') {
    state.triangle.self_partner_warmth = clamp(state.triangle.self_partner_warmth + amount, 0, 100);
    // 温暖增加减少家暴风险
    state.domestic_violence_risk = clamp(state.domestic_violence_risk - amount * 0.5, 0, 100);
  } else {
    state.triangle.self_child_warmth = clamp(state.triangle.self_child_warmth + amount, 0, 100);
  }
  state.family_cohesion = clamp(state.family_cohesion + amount * 0.3, 0, 100);
  log('C5', `对${target}表达温暖 +${amount}`);
}

/** 代际沟通 */
export function generationalCommunication(type: 'phone_call' | 'visit' | 'gift', quality: number): void {
  state.generation.support_provided = clamp(state.generation.support_provided + 5, 0, 100);
  state.generation.with_father = clamp(state.generation.with_father + quality * 0.3, 0, 100);
  state.generation.with_mother = clamp(state.generation.with_mother + quality * 0.3, 0, 100);
  state.generation.generational_conflict = clamp(state.generation.generational_conflict - quality * 0.5, 0, 100);
  logEvent('generational', 'self', `${type} (质量${quality})`);
}

/** 家庭会议/沟通 */
export function familyMeeting(quality: number): void {
  state.family_cohesion = clamp(state.family_cohesion + quality * 0.5, 0, 100);
  state.triangle.triangle_tension = clamp(state.triangle.triangle_tension - quality * 0.5, 0, 100);

  // 沟通后家庭成员压力下降
  for (const member of state.family_members) {
    member.stress = clamp(member.stress - quality * 0.3, 0, 100);
    member.happiness = clamp(member.happiness + quality * 0.2, 0, 100);
  }

  // 家暴风险下降
  state.domestic_violence_risk = clamp(state.domestic_violence_risk - quality * 0.8, 0, 100);
  logEvent('family_meeting', 'all', `家庭会议 (质量${quality})`);
}

function logEvent(type: string, member: string, detail: string, outcome?: string): void {
  getDb().prepare(`
    INSERT INTO family_event_log (tick, event_type, member, detail, outcome)
    VALUES (?, ?, ?, ?, ?)
  `).run(tickCount, type, member, detail, outcome || 'neutral');
}

// ============================================================
// 持久化
// ============================================================

function saveState(): void {
  getDb().prepare(`
    UPDATE family_state SET
      family_members_json = ?, self_roles_json = ?, partner_roles_json = ?,
      responsibilities_json = ?, triangle_json = ?, generation_json = ?,
      family_health = ?, family_stress = ?, family_cohesion = ?,
      domestic_violence_risk = ?,
      updated_at = datetime('now','localtime')
    WHERE id = 1
  `).run(
    JSON.stringify(state.family_members),
    JSON.stringify(state.self_roles),
    JSON.stringify(state.partner_roles),
    JSON.stringify(state.responsibilities),
    JSON.stringify(state.triangle),
    JSON.stringify(state.generation),
    state.family_health,
    state.family_stress,
    state.family_cohesion,
    state.domestic_violence_risk,
  );
}

// ============================================================
// 快照接口
// ============================================================

export function getFamilySnapshot(): object {
  const avgRoles = (roles: RoleProfile[]) => {
    if (roles.length === 0) return { competence: 0, satisfaction: 0, burnout: 0 };
    const c = roles.reduce((s, r) => s + r.competence, 0) / roles.length;
    const s = roles.reduce((sm, r) => sm + r.satisfaction, 0) / roles.length;
    const b = roles.reduce((sm, r) => sm + r.burnout, 0) / roles.length;
    return { competence: c, satisfaction: s, burnout: b };
  };

  return {
    family_health: state.family_health.toFixed(0),
    family_stress: state.family_stress.toFixed(0),
    family_cohesion: state.family_cohesion.toFixed(0),
    domestic_violence_risk: state.domestic_violence_risk.toFixed(0),
    members: state.family_members.map(m => ({
      name: m.name,
      role: m.role,
      age: m.age,
      health: m.health,
      happiness: m.happiness,
      stress: m.stress,
    })),
    self_roles: {
      profiles: state.self_roles.map(r => ({
        role: r.role, competence: r.competence.toFixed(0),
        satisfaction: r.satisfaction.toFixed(0), burnout: r.burnout.toFixed(0),
      })),
      average: avgRoles(state.self_roles),
    },
    partner_roles: {
      profiles: state.partner_roles.map(r => ({
        role: r.role, competence: r.competence.toFixed(0),
        satisfaction: r.satisfaction.toFixed(0), burnout: r.burnout.toFixed(0),
      })),
      average: avgRoles(state.partner_roles),
    },
    responsibilities: state.responsibilities.map(r => ({
      type: r.type,
      self_pct: r.self_pct,
      partner_pct: r.partner_pct,
      fairness_balance: r.fairness_balance,
      is_fair: Math.abs(r.fairness_balance) < 20,
    })),
    triangle: {
      self_partner_warmth: state.triangle.self_partner_warmth,
      self_child_warmth: state.triangle.self_child_warmth,
      partner_child_warmth: state.triangle.partner_child_warmth,
      tension: state.triangle.triangle_tension.toFixed(0),
      alliance: state.triangle.alliance_pattern,
      jealousy: state.triangle.jealousy_flag,
    },
    generation: {
      with_father: state.generation.with_father,
      with_mother: state.generation.with_mother,
      with_in_laws: (state.generation.with_father_in_law + state.generation.with_mother_in_law) / 2,
      conflict: state.generation.generational_conflict.toFixed(0),
      support_provided: state.generation.support_provided.toFixed(0),
      support_received: state.generation.support_received.toFixed(0),
    },
  };
}
