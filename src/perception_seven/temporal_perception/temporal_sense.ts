/**
 * 时间感知 — 昼夜/紧迫度/流速感 → 焦虑度/专注度
 */
import { getWorldTime } from '../../natural_env/time_calendar/time_service';
import { clamp } from '../../common/utils';

export interface TemporalPerception {
  /** 当前时段描述 */
  time_of_day: string;
  /** 星期几 */
  weekday_name: string;
  /** 是否工作日 */
  is_workday: boolean;
  /** 紧迫度 0-100（0=悠闲, 100=极度紧迫） */
  urgency: number;
  /** 时间流速感知 0-100（0=停滞, 50=正常, 100=飞逝） */
  flow_speed: number;
  /** 距最近截止日（小时），null=无截止日 */
  nearest_deadline_hours: number | null;
  /** 焦虑度 0-100 */
  anxiety_level: number;
  /** 专注度 0-100 */
  focus_level: number;
  /** 剩余可控时间感（小时） */
  remaining_controllable_hours: number;
}

export function getTemporalPerception(): TemporalPerception {
  const wt = getWorldTime() as any;
  if (!wt) {
    return {
      time_of_day: '未知', weekday_name: '未知', is_workday: false,
      urgency: 30, flow_speed: 50, nearest_deadline_hours: null,
      anxiety_level: 20, focus_level: 50, remaining_controllable_hours: 8,
    };
  }

  const hour = wt.hour;
  const weekday = wt.weekday;
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  const isWorkday = weekday >= 1 && weekday <= 5;

  // 时段
  let timeOfDay = '深夜';
  if (hour >= 5 && hour < 7) timeOfDay = '清晨';
  else if (hour >= 7 && hour < 9) timeOfDay = '早晨';
  else if (hour >= 9 && hour < 12) timeOfDay = '上午';
  else if (hour >= 12 && hour < 14) timeOfDay = '中午';
  else if (hour >= 14 && hour < 17) timeOfDay = '下午';
  else if (hour >= 17 && hour < 19) timeOfDay = '傍晚';
  else if (hour >= 19 && hour < 22) timeOfDay = '晚上';
  else if (hour >= 22 || hour < 2) timeOfDay = '深夜';

  // 紧迫度：工作时间越高
  let urgency = 30;
  if (isWorkday && hour >= 9 && hour < 18) urgency = 55 + Math.random() * 20;
  else if (isWorkday && hour >= 18 && hour < 21) urgency = 40 + Math.random() * 15;
  else urgency = 15 + Math.random() * 15;

  // 时间流速：愉快时段感觉时间快，无聊/焦虑时段感觉慢
  let flowSpeed = 50;
  if (hour >= 19 && hour < 22) flowSpeed = 65; // 晚间放松，时间过得快
  else if (hour >= 14 && hour < 17) flowSpeed = 35; // 下午犯困，时间慢
  else if (hour >= 0 && hour < 5) flowSpeed = 20; // 失眠时段，时间停滞

  // 距当日结束剩余可控小时
  const remainingHours = Math.max(0, 24 - hour);

  // 焦虑度 = 紧迫度 × 工作日系数
  const anxiety = clamp(urgency * (isWorkday ? 1.2 : 0.6), 0, 100);

  // 专注度：上午最高，下午降低，晚上回升
  let focus = 50;
  if (hour >= 7 && hour < 11) focus = 75;
  else if (hour >= 11 && hour < 14) focus = 45;
  else if (hour >= 14 && hour < 17) focus = 40;
  else if (hour >= 17 && hour < 22) focus = 55;
  else focus = 25;

  return {
    time_of_day: timeOfDay,
    weekday_name: weekdays[weekday] || '未知',
    is_workday: isWorkday,
    urgency: Math.round(urgency),
    flow_speed: Math.round(flowSpeed),
    nearest_deadline_hours: null,
    anxiety_level: Math.round(anxiety),
    focus_level: Math.round(focus),
    remaining_controllable_hours: remainingHours,
  };
}
