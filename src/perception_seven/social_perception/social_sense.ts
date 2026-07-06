/**
 * 社交感知 (Social Perception)
 * P1-2: 4类关系(朋友/家人/同事/熟人) × 温度/能量/社交债务
 * 每秒 tick 更新，支持 reach_out 行为
 */
import { getDb } from '../../common/database';
import { log, clamp } from '../../common/utils';

export interface SocialNode {
  id: string;
  name: string;
  type: 'friend' | 'family' | 'colleague' | 'acquaintance';
  warmth: number;           // 0-100 关系温度
  energy: number;           // 0-100 社交能量
  debt: number;             // 0-100 社交债务 (欠对方的)
  last_contact: number;     // 最后联系时间戳
  contact_frequency: number; // 预期联系频率(天)
  notes: string;
}

let nodes: Map<string, SocialNode> = new Map();
let socialEnergy = 80;       // 自身社交能量池
let socialBatteryDrain = 0;

export function initSocialSense(presetNodes?: SocialNode[]): void {
  const defaults: SocialNode[] = [
    { id: 'friend_01', name: '老友A', type: 'friend', warmth: 75, energy: 60, debt: 0, last_contact: Date.now() - 86400000 * 5, contact_frequency: 7, notes: '' },
    { id: 'family_01', name: '家人B', type: 'family', warmth: 90, energy: 70, debt: 10, last_contact: Date.now() - 86400000 * 3, contact_frequency: 3, notes: '' },
    { id: 'colleague_01', name: '同事C', type: 'colleague', warmth: 60, energy: 50, debt: 0, last_contact: Date.now() - 86400000, contact_frequency: 1, notes: '' },
    { id: 'friend_02', name: '好友D', type: 'friend', warmth: 80, energy: 55, debt: 20, last_contact: Date.now() - 86400000 * 14, contact_frequency: 14, notes: '很久没联系' },
  ];
  
  const initNodes = presetNodes || defaults;
  for (const n of initNodes) nodes.set(n.id, { ...n });
  
  // 从 DB 恢复
  const db = getDb();
  const rows = db.prepare('SELECT * FROM social_state').all() as any[];
  for (const row of rows) {
    if (!nodes.has(row.node_id)) {
      nodes.set(row.node_id, {
        id: row.node_id, name: row.name, type: row.type,
        warmth: row.warmth, energy: row.energy, debt: 0,
        last_contact: row.last_contact, contact_frequency: row.contact_frequency, notes: ''
      });
    }
  }
  
  log('SOCIAL', `社交感知初始化: ${nodes.size}个联系人`);
}

export function socialTick(): void {
  const now = Date.now();
  
  // 关系自然冷却 (每秒)
  for (const [id, node] of nodes) {
    const daysSinceContact = (now - node.last_contact) / 86400000;
    if (daysSinceContact > node.contact_frequency) {
      // 超过预期联系频率，关系温度下降
      const decay = 0.00001 * (daysSinceContact - node.contact_frequency) / node.contact_frequency;
      node.warmth = clamp(node.warmth - decay, 10, 100);
      // 社交债务随疏远增加
      node.debt = clamp(node.debt + decay * 2, 0, 100);
    }
  }
  
  // 社交能量自然恢复 (每秒微量)
  socialEnergy = clamp(socialEnergy + 0.0005 - socialBatteryDrain, 0, 100);
  socialBatteryDrain = clamp(socialBatteryDrain * 0.999, 0, 0.05);
  
  // 每小时持久化
  if (new Date().getMinutes() === 0 && new Date().getSeconds() < 5) {
    persistStates();
  }
}

export function socialReachOut(nodeId: string): { success: boolean; feedback: string } {
  const node = nodes.get(nodeId);
  if (!node) return { success: false, feedback: '未知联系人' };
  if (socialEnergy < 15) return { success: false, feedback: '社交能量不足，需要独处恢复' };
  
  // 消耗社交能量
  socialEnergy = clamp(socialEnergy - 10, 0, 100);
  socialBatteryDrain += 0.01;
  
  // 更新关系
  node.last_contact = Date.now();
  node.warmth = clamp(node.warmth + 5, 0, 100);
  node.debt = clamp(node.debt - 10, 0, 100);
  node.energy = clamp(node.energy + 10, 0, 100);
  
  log('SOCIAL', `联系 ${node.name}: 关系温度 +5 → ${Math.round(node.warmth)}`);
  return { success: true, feedback: `已联系${node.name}，关系温度升至${Math.round(node.warmth)}` };
}

export function getSocialSnapshot(): SocialPerception {
  const allNodes = Array.from(nodes.values());
  const avgWarmth = allNodes.reduce((s, n) => s + n.warmth, 0) / (allNodes.length || 1);
  const totalDebt = allNodes.reduce((s, n) => s + n.debt, 0);
  const overdueNodes = allNodes.filter(n => (Date.now() - n.last_contact) / 86400000 > n.contact_frequency * 1.5);
  
  return {
    timestamp: Date.now(),
    total_contacts: allNodes.length,
    avg_warmth: Math.round(avgWarmth),
    social_energy: Math.round(socialEnergy),
    total_debt: Math.round(totalDebt),
    overdue_count: overdueNodes.length,
    loneliness_index: clamp(100 - avgWarmth - socialEnergy * 0.3, 0, 100),
    top_overdue: overdueNodes.slice(0, 3).map(n => ({ name: n.name, days_since: Math.round((Date.now() - n.last_contact) / 86400000) })),
  };
}

function persistStates(): void {
  const db = getDb();
  const stmt = db.prepare(`INSERT OR REPLACE INTO social_state (node_id, name, type, warmth, energy, last_contact, contact_frequency, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [id, n] of nodes) {
    stmt.run(id, n.name, n.type, Math.round(n.warmth), Math.round(n.energy), n.last_contact, n.contact_frequency, Date.now());
  }
}

export interface SocialPerception {
  timestamp: number;
  total_contacts: number;
  avg_warmth: number;
  social_energy: number;
  total_debt: number;
  overdue_count: number;
  loneliness_index: number;
  top_overdue: Array<{ name: string; days_since: number }>;
}

export { nodes as _nodes, socialEnergy as _socialEnergy };
