/**
 * 生命衰老模型 — 基于真实年龄的渐进老化
 * 年龄驱动体力上限/恢复速度/感知敏感度变化
 * 纯写实时序，不可逆
 */
import { log, clamp, nowMs } from '../../common/utils';
import { worldBus, WorldEvents } from '../../core_bus/event_bus';

// ============================================================
// 年龄模型
// ============================================================
export interface AgingState {
  /** 生物学年龄（岁） */
  age_years: number;
  /** 最大体力值（年轻时100，逐年递减） */
  max_energy: number;
  /** 体力恢复速率倍率（基础=1.0） */
  recovery_rate: number;
  /** 感官灵敏度倍率 */
  sensory_acuity: number;
  /** 代谢速率倍率 */
  metabolic_rate: number;
  /** 伤口愈合速率倍率 */
  healing_rate: number;
  /** 生命周期阶段 */
  life_stage: string;
}

/** 根据年龄计算衰老状态 */
export function calculateAging(ageYears: number): AgingState {
  // 基础：18-35岁 = 巅峰期
  // 35-50岁 = 渐进衰退
  // 50-65岁 = 显著衰退
  // 65+岁 = 老年期

  let stage: string;
  let maxEnergy: number;
  let recoveryRate: number;
  let sensoryAcuity: number;
  let metabolicRate: number;
  let healingRate: number;

  if (ageYears < 18) {
    stage = '青少年期';
    maxEnergy = 120;
    recoveryRate = 1.5;
    sensoryAcuity = 1.2;
    metabolicRate = 1.3;
    healingRate = 1.5;
  } else if (ageYears < 35) {
    stage = '青年期';
    maxEnergy = 100;
    recoveryRate = 1.0;
    sensoryAcuity = 1.0;
    metabolicRate = 1.0;
    healingRate = 1.0;
  } else if (ageYears < 50) {
    stage = '中年期';
    const t = (ageYears - 35) / 15;
    maxEnergy = 100 - t * 15;           // 100 → 85
    recoveryRate = 1.0 - t * 0.2;        // 1.0 → 0.8
    sensoryAcuity = 1.0 - t * 0.15;      // 1.0 → 0.85
    metabolicRate = 1.0 - t * 0.1;       // 1.0 → 0.9
    healingRate = 1.0 - t * 0.15;        // 1.0 → 0.85
  } else if (ageYears < 65) {
    stage = '中老年期';
    const t = (ageYears - 50) / 15;
    maxEnergy = 85 - t * 20;             // 85 → 65
    recoveryRate = 0.8 - t * 0.3;        // 0.8 → 0.5
    sensoryAcuity = 0.85 - t * 0.2;      // 0.85 → 0.65
    metabolicRate = 0.9 - t * 0.2;       // 0.9 → 0.7
    healingRate = 0.85 - t * 0.25;       // 0.85 → 0.6
  } else {
    stage = '老年期';
    const t = Math.min(1, (ageYears - 65) / 30);
    maxEnergy = 65 - t * 25;             // 65 → 40
    recoveryRate = 0.5 - t * 0.2;        // 0.5 → 0.3
    sensoryAcuity = 0.65 - t * 0.25;     // 0.65 → 0.4
    metabolicRate = 0.7 - t * 0.2;       // 0.7 → 0.5
    healingRate = 0.6 - t * 0.2;         // 0.6 → 0.4
  }

  return {
    age_years: ageYears,
    max_energy: Math.round(maxEnergy),
    recovery_rate: Math.round(recoveryRate * 100) / 100,
    sensory_acuity: Math.round(sensoryAcuity * 100) / 100,
    metabolic_rate: Math.round(metabolicRate * 100) / 100,
    healing_rate: Math.round(healingRate * 100) / 100,
    life_stage: stage,
  };
}

// ============================================================
// 衰老驱动的事件
// ============================================================
export interface AgingMilestone {
  age: number;
  event: string;
  description: string;
}

const MILESTONES: AgingMilestone[] = [
  { age: 18, event: '成年', description: '步入成年，身体机能达到峰值' },
  { age: 25, event: '身体巅峰', description: '身体各项指标处于最佳状态' },
  { age: 30, event: '初现衰老', description: '新陈代谢开始轻微放缓' },
  { age: 35, event: '中年起点', description: '体力和恢复力开始缓慢下降' },
  { age: 40, event: '不惑之年', description: '眼角出现细纹，体能不如从前' },
  { age: 45, event: '明显变化', description: '更容易疲劳，恢复时间变长' },
  { age: 50, event: '天命之年', description: '关节偶尔酸痛，感官灵敏度下降' },
  { age: 55, event: '更年过渡', description: '身体经历明显的激素变化' },
  { age: 60, event: '花甲之年', description: '行动速度变慢，伤口愈合变慢' },
  { age: 65, event: '老年起点', description: '正式进入老年阶段' },
  { age: 70, event: '古稀之年', description: '行动需更谨慎，感官衰退明显' },
  { age: 80, event: '耄耋之年', description: '身体各项机能显著下降' },
  { age: 90, event: '鲐背之年', description: '生命体验进入极晚期' },
  { age: 100, event: '期颐之年', description: '罕见的长寿里程碑' },
];

/** 获取指定年龄的里程碑 */
export function getMilestones(ageYears: number): AgingMilestone[] {
  return MILESTONES.filter(m => m.age <= ageYears);
}

/** 获取最近的下一个里程碑 */
export function getNextMilestone(ageYears: number): AgingMilestone | null {
  return MILESTONES.find(m => m.age > ageYears) || null;
}

/** 检查是否刚跨过某里程碑 */
export function checkMilestoneCross(oldAge: number, newAge: number): AgingMilestone | null {
  for (const m of MILESTONES) {
    if (m.age > oldAge && m.age <= newAge) {
      return m;
    }
  }
  return null;
}
