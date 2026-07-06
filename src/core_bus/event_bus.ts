/**
 * PersonalWorld 项目内部事件总线
 * 模块间解耦通信的唯一通道
 */
type EventHandler = (payload: any) => void;

class WorldEventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private eventLog: Array<{ event: string; timestamp: number; payload: any }> = [];

  /** 订阅事件 */
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    // 返回取消订阅函数
    return () => this.off(event, handler);
  }

  /** 取消订阅 */
  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  /** 发送事件 */
  emit(event: string, payload: any): void {
    this.eventLog.push({ event, timestamp: Date.now(), payload });
    // 限制日志长度
    if (this.eventLog.length > 10000) {
      this.eventLog = this.eventLog.slice(-5000);
    }
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[EventBus] 事件 ${event} 处理器异常:`, err);
        }
      }
    }
  }

  /** 获取事件日志 */
  getLog(limit = 100): Array<{ event: string; timestamp: number; payload: any }> {
    return this.eventLog.slice(-limit);
  }

  /** 清空所有监听器 */
  clear(): void {
    this.listeners.clear();
  }
}

export const worldBus = new WorldEventBus();

// ===== 标准事件名常量 =====
export const WorldEvents = {
  // 时间事件
  TIME_TICK: 'time:tick',
  TIME_HOUR: 'time:hour',
  TIME_DAY: 'time:day',
  TIME_SEASON_CHANGE: 'time:season_change',
  TIME_SOLAR_TERM: 'time:solar_term',

  // 天气事件
  WEATHER_UPDATED: 'weather:updated',
  WEATHER_WARNING: 'weather:warning',

  // 场景事件
  SCENE_CHANGED: 'scene:changed',
  OBJECT_STATE_CHANGED: 'object:state_changed',

  // 生理事件
  PHYSIO_TICK: 'physio:tick',
  HEALTH_STATE_CHANGED: 'health:state_changed',
  FATIGUE_CHANGED: 'fatigue:changed',
  PREGNANCY_STAGE: 'pregnancy:stage',
  PREGNANCY_BIRTH: 'pregnancy:birth',

  // 理化事件
  PHYSICS_OBJECT_FELL: 'physics:object_fell',
  CHEM_TEMP_CHANGED: 'chem:temp_changed',
  FOOD_SPOILED: 'food:spoiled',

  // 七维感知事件
  PERCEPTION_SNAPSHOT: 'perception:snapshot',
  INTIMACY_STATE_CHANGED: 'intimacy:state_changed',
  INTIMACY_CHEMISTRY_CHANGED: 'intimacy:chemistry_changed',

  // 监控事件
  HOOK_TRIGGERED: 'hook:triggered',
  DAILY_REPORT_READY: 'monitor:daily_report_ready',
  MODULE_ERROR: 'monitor:module_error',
};
