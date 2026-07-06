/**
 * 事件总线测试
 */
import { assert, assertEq, assertNotNull, runSuite, summarize } from './test_harness';
import { worldBus, WorldEvents } from '../src/core_bus/event_bus';

// ==================== 事件总线 ====================

runSuite('事件总线 — 基础订阅与触发', () => {
  // 重置状态
  worldBus.clear();

  let called = false;
  let receivedPayload: any = null;

  worldBus.on('test:basic', (payload) => {
    called = true;
    receivedPayload = payload;
  });

  worldBus.emit('test:basic', { value: 42 });

  assert(called, '注册的 handler 应在 emit 后被调用');
  assertEq(receivedPayload?.value, 42, 'handler 收到的 payload.value 应为 42');
});

runSuite('事件总线 — 多 handler 同一事件', () => {
  worldBus.clear();

  let count = 0;
  const results: string[] = [];

  worldBus.on('test:multi', () => { count++; results.push('A'); });
  worldBus.on('test:multi', () => { count++; results.push('B'); });
  worldBus.on('test:multi', () => { count++; results.push('C'); });

  worldBus.emit('test:multi', {});

  assertEq(count, 3, '3 个 handler 都应被调用');
  assert(results.includes('A') && results.includes('B') && results.includes('C'), '3 个 handler 各自记录到 results');
});

runSuite('事件总线 — 移除 handler', () => {
  worldBus.clear();

  let count = 0;
  const handler = () => { count++; };

  const unsubscribe = worldBus.on('test:remove', handler);
  worldBus.emit('test:remove', {});
  assertEq(count, 1, '第一次 emit 后 count 应为 1');

  unsubscribe();
  worldBus.emit('test:remove', {});
  assertEq(count, 1, '移除 handler 后再 emit，count 仍为 1');
});

runSuite('事件总线 — 事件类型验证', () => {
  worldBus.clear();

  // 验证 WorldEvents 标准事件名格式
  const validEvents = Object.values(WorldEvents);
  const allMatchPattern = validEvents.every(e => /^[a-z]+:[a-z_]+$/.test(e));

  assert(allMatchPattern, '所有 WorldEvents 标准事件名符合 module:action 格式');

  // 验证不同事件类型互不干扰
  let timeCount = 0;
  let weatherCount = 0;
  let sceneCount = 0;

  worldBus.on(WorldEvents.TIME_TICK, () => { timeCount++; });
  worldBus.on(WorldEvents.WEATHER_UPDATED, () => { weatherCount++; });
  worldBus.on(WorldEvents.SCENE_CHANGED, () => { sceneCount++; });

  worldBus.emit(WorldEvents.TIME_TICK, {});
  worldBus.emit(WorldEvents.TIME_TICK, {});
  worldBus.emit(WorldEvents.WEATHER_UPDATED, {});
  worldBus.emit(WorldEvents.SCENE_CHANGED, {});

  assertEq(timeCount, 2, 'TIME_TICK 触发 2 次');
  assertEq(weatherCount, 1, 'WEATHER_UPDATED 触发 1 次');
  assertEq(sceneCount, 1, 'SCENE_CHANGED 触发 1 次');
});

runSuite('事件总线 — 事件日志', () => {
  worldBus.clear();

  worldBus.emit(WorldEvents.TIME_TICK, { t: 1 });
  worldBus.emit(WorldEvents.TIME_TICK, { t: 2 });
  worldBus.emit(WorldEvents.WEATHER_UPDATED, { t: 3 });

  const log = worldBus.getLog(10);
  assert(log.length >= 3, '事件日志至少包含 3 条记录');
  // 取最后3条，验证我们刚 emit 的事件
  const lastThree = log.slice(-3);
  assertEq(lastThree[0].event, WorldEvents.TIME_TICK, '倒数第3条日志事件类型为 TIME_TICK');
  assertEq(lastThree[1].event, WorldEvents.TIME_TICK, '倒数第2条日志事件类型为 TIME_TICK');
  assertEq(lastThree[2].event, WorldEvents.WEATHER_UPDATED, '最后一条日志事件类型为 WEATHER_UPDATED');
  assertNotNull(lastThree[0].timestamp, '日志条目包含 timestamp');
});

runSuite('事件总线 — handler 异常不影响其他 handler', () => {
  worldBus.clear();

  let normalCalled = false;

  worldBus.on('test:error', () => { throw new Error('模拟错误'); });
  worldBus.on('test:error', () => { normalCalled = true; });

  // 不应抛出异常
  worldBus.emit('test:error', {});

  assert(normalCalled, '即使前一个 handler 抛出异常，后续 handler 仍应被调用');
});

runSuite('事件总线 — 返回取消订阅函数', () => {
  worldBus.clear();

  let callCount = 0;
  const unsub = worldBus.on('test:unsub', () => { callCount++; });

  assertEq(typeof unsub, 'function', 'on() 应返回函数类型的取消订阅函数');
  unsub();

  worldBus.emit('test:unsub', {});
  assertEq(callCount, 0, '取消订阅后不应再被调用');
});

summarize();
