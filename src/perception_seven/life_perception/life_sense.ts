/**
 * 生活感知 — 饮食/睡眠/整洁/意外 → 稳定感/满意度/恢复力
 */
import { getWorldTime } from '../../natural_env/time_calendar/time_service';
import { clamp } from '../../common/utils';

export interface LifePerception {
  /** 饮食质量 0-100 */
  diet_quality: number;
  /** 睡眠质量 0-100 */
  sleep_quality: number;
  /** 空间整洁度 0-100 */
  tidyness: number;
  /** 意外打断次数（当日） */
  disruptions_today: number;
  /** 稳定感 0-100 */
  stability_feel: number;
  /** 生活满意度 0-100 */
  life_satisfaction: number;
  /** 恢复力 0-100 */
  resilience: number;
  /** 社交满足度 0-100 */
  social_fulfillment: number;
}

let dietQuality = 55;
let sleepQuality = 60;
let tidyness = 65;
let disruptionsToday = 0;
let socialFulfillment = 40;

export function updateLifeState(diet?: number, sleep?: number, tidy?: number, social?: number): void {
  if (diet !== undefined) dietQuality = clamp(diet, 0, 100);
  if (sleep !== undefined) sleepQuality = clamp(sleep, 0, 100);
  if (tidy !== undefined) tidyness = clamp(tidy, 0, 100);
  if (social !== undefined) socialFulfillment = clamp(social, 0, 100);
}

export function addDisruption(): void {
  disruptionsToday++;
}

export function getLifePerception(): LifePerception {
  const wt = getWorldTime() as any;
  const hour = wt?.hour || 12;

  // 稳定感：饮食 + 睡眠 + 整洁 - 意外打断
  const stability = clamp(
    dietQuality * 0.3 + sleepQuality * 0.35 + tidyness * 0.2 - disruptionsToday * 8 + 15,
    0, 100
  );

  // 生活满意度
  const satisfaction = clamp(stability * 0.5 + socialFulfillment * 0.3 + 20, 0, 100);

  // 恢复力：睡眠质量为核心 + 饮食辅助
  const resilience = clamp(sleepQuality * 0.5 + dietQuality * 0.25 + 20, 0, 100);

  return {
    diet_quality: Math.round(dietQuality),
    sleep_quality: Math.round(sleepQuality),
    tidyness: Math.round(tidyness),
    disruptions_today: disruptionsToday,
    stability_feel: Math.round(stability),
    life_satisfaction: Math.round(satisfaction),
    resilience: Math.round(resilience),
    social_fulfillment: Math.round(socialFulfillment),
  };
}
