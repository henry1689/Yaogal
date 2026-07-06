/**
 * 工作感知 — 任务压力/进展/掌控/意义 → 自我价值/疲惫/动力
 */
import { getWorldTime } from '../../natural_env/time_calendar/time_service';
import { clamp } from '../../common/utils';

export interface WorkPerception {
  /** 任务队列长度（活跃任务数） */
  active_task_count: number;
  /** 任务压力 0-100 */
  task_pressure: number;
  /** 进展感 0-100（0=停滞不前, 100=飞速推进） */
  progress_feel: number;
  /** 掌控感 0-100 */
  control_feel: number;
  /** 意义感 0-100 */
  meaning_feel: number;
  /** 自我价值感 0-100 */
  self_worth_feel: number;
  /** 工作疲惫度 0-100 */
  work_fatigue: number;
  /** 工作动力 0-100 */
  motivation: number;
}

let activeTaskCount = 3;
let progressFeel = 40;
let controlFeel = 50;
let meaningFeel = 55;

/** 外部可调用：更新工作状态 */
export function updateWorkState(tasks: number, progress: number, control: number, meaning: number): void {
  activeTaskCount = tasks;
  progressFeel = clamp(progress, 0, 100);
  controlFeel = clamp(control, 0, 100);
  meaningFeel = clamp(meaning, 0, 100);
}

export function getWorkPerception(): WorkPerception {
  const wt = getWorldTime() as any;
  const hour = wt?.hour || 12;

  // 任务压力：任务多 + 进展慢 = 高压
  const taskPressure = clamp(activeTaskCount * 15 + (100 - progressFeel) * 0.3, 0, 100);

  // 自我价值感：进展 + 意义 + 掌控的综合
  const selfWorth = clamp(progressFeel * 0.35 + meaningFeel * 0.35 + controlFeel * 0.3, 0, 100);

  // 工作疲惫：随工作时段累积
  let workFatigue = 20;
  if (hour >= 9 && hour < 18) {
    const hoursWorked = hour - 9;
    workFatigue = clamp(20 + hoursWorked * 6 + taskPressure * 0.2, 0, 100);
  }
  if (hour >= 18) workFatigue = clamp(70 + (hour - 18) * 3, 0, 100);

  // 动力：意义感 + 掌控感 - 疲惫
  const motivation = clamp(meaningFeel * 0.5 + controlFeel * 0.3 - workFatigue * 0.3 + 30, 0, 100);

  return {
    active_task_count: activeTaskCount,
    task_pressure: Math.round(taskPressure),
    progress_feel: Math.round(progressFeel),
    control_feel: Math.round(controlFeel),
    meaning_feel: Math.round(meaningFeel),
    self_worth_feel: Math.round(selfWorth),
    work_fatigue: Math.round(workFatigue),
    motivation: Math.round(motivation),
  };
}
