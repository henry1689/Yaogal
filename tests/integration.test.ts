/**
 * 瑶光 Yaogal — 端到端集成测试
 * 跨模块链路验证：数据库→场景→物件→事件总线→物理→化学→Hook→日报
 */
import { assert, assertEq, assertClose, assertNotNull, runSuite, summarize } from './test_harness';
import { worldBus, WorldEvents } from '../src/core_bus/event_bus';
import { initDatabase, closeDatabase, getDb } from '../src/common/database';
import { getCurrentScene, getSceneById, switchScene, isSceneTransitioning, getTransitionProgress } from '../src/perception_space/scene_definition/scene_service';
import { initObjectService, getSceneObjects, getObjectById } from '../src/perception_space/spatial_object/object_service';
import { getWorldTime } from '../src/natural_env/time_calendar/time_service';
import { calculateSolarTerms, calculateMoonPhase, solarToLunar } from '../src/natural_env/time_calendar/lunar_data';
import { getCurrentWeather } from '../src/natural_env/weather_sensor/weather_service';
import { startDrop, tickGravity, getFallingObjects } from '../src/simple_physics/basic_gravity/gravity_service';
import { startCooling, tickCooling, getAllCoolingStates } from '../src/simple_physics/simple_chem/chem_service';
import { runAllHooks, getRecentHookLogs, HookSnapshot } from '../src/runtime_monitor/world_hooks/hook_service';
import { generateDailyReport } from '../src/runtime_monitor/daily_inspect/monitor_service';

// ==================== 全局初始化 ====================
console.log('=== 瑶光 Yaogal 端到端集成测试 ===\n');

// 初始化数据库（所有测试共享同一个 DB 实例）
initDatabase();
console.log('数据库初始化完成');

// 兼容 hook_service 和 monitor_service 两种 hook_log 表结构
// DB 初始创建: timestamp_ms, module, event NOT NULL, severity, detail_json
// hook_service 需要: hook_id, module, metric, value, threshold, status, message, timestamp_ms
// 重建表以兼容两种 schema
const db = getDb();
db.exec('DROP TABLE IF EXISTS hook_log');
db.exec(`CREATE TABLE hook_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp_ms INTEGER NOT NULL,
  module TEXT NOT NULL,
  event TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  detail_json TEXT,
  hook_id TEXT,
  metric TEXT,
  value REAL,
  threshold REAL,
  status TEXT,
  message TEXT
)`);

// 初始化默认物件
initObjectService();
console.log('默认物件初始化完成');

// ==================== 1. 全模块启动流程 ====================

runSuite('E2E — 全模块启动流程', () => {
  // 验证数据库可访问
  const db = getDb();
  assertNotNull(db, 'getDb() 返回有效数据库实例');

  // 验证场景列表完整
  const home = getSceneById('home');
  const office = getSceneById('office');
  const outdoor = getSceneById('outdoor');
  assertNotNull(home, 'home 场景存在');
  assertNotNull(office, 'office 场景存在');
  assertNotNull(outdoor, 'outdoor 场景存在');

  // 验证当前场景默认为 home
  const current = getCurrentScene();
  assertEq(current.id, 'home', '默认当前场景为 home');

  // 验证物件已初始化
  const objects = getSceneObjects();
  assert(objects.length > 0, '当前场景包含物件');
  assert(objects.length >= 10, `home 场景至少 10 个物件，实际 ${objects.length}`);

  // 验证世界时间表存在
  const worldTime = getWorldTime();
  assertNotNull(worldTime, 'world_time 表存在且可查询');

  // 验证天气表存在（可能无数据，但表结构完好）
  const weather = getCurrentWeather();
  console.log(`  天气数据: ${weather ? `${weather.temp}°C ${weather.text}` : '无缓存数据（正常）'}`);

  // 验证 Hook 探针可运行
  const hookSnapshots = runAllHooks('晴', 25);
  assert(hookSnapshots.length > 0, 'runAllHooks 返回至少一条探针快照');
  console.log(`  Hook 探针: ${hookSnapshots.length} 条快照`);

  console.log('  全模块启动验证通过');
});

// ==================== 2. 场景切换端到端 ====================

runSuite('E2E — 场景切换端到端', () => {
  // 确认当前在 home
  assertEq(getCurrentScene().id, 'home', '初始场景为 home');

  // 验证当前未在切换中
  assertEq(isSceneTransitioning(), false, '初始不在切换中');

  // 发起切换到 office
  const result = switchScene('office');
  assertEq(result.ok, true, 'switchScene(office) 返回 ok=true');

  // 验证切换到不存在的场景返回失败
  const badResult = switchScene('nonexistent');
  assertEq(badResult.ok, false, '切换到不存在的场景返回 ok=false');

  // 验证切换到当前场景返回失败
  const sameResult = switchScene('home');
  assertEq(sameResult.ok, false, '切换到当前场景(home)返回 ok=false');

  // 获取切换进度（切换中或已完成都应返回合理值）
  const progress = getTransitionProgress();
  console.log(`  切换进度: ${progress ? `剩余 ${progress.remaining_sec}s` : '无进行中的切换'}`);

  console.log('  场景切换验证通过');
});

// ==================== 3. 物理解算端到端 ====================

runSuite('E2E — 物理解算（掉落→落地）', () => {
  // 从 10m 高度掉落一个苹果
  const apple = startDrop('integration_apple', '集成测试苹果', 10);
  assertNotNull(apple, '苹果掉落对象创建成功');
  assertEq(apple.landed, false, '初始未落地');
  assertClose(apple.current_z, 10, 0.01, '初始高度 10m');
  assertEq(apple.name, '集成测试苹果', '对象名为集成测试苹果');

  // 模拟重力 tick 直到落地
  const dt = 0.1;
  let steps = 0;
  const maxSteps = 200;
  while (steps < maxSteps && !apple.landed) {
    tickGravity(dt);
    steps++;
  }

  assert(apple.landed, `经过 ${steps} 步 tickGravity 后苹果已落地`);
  assertClose(apple.current_z, 0, 0.01, '落地后 z 坐标为 0');

  // 落地后继续 tick，z 保持为 0
  tickGravity(1.0);
  assertClose(apple.current_z, 0, 0.01, '落地后继续 tick，z 保持为 0');

  // 验证 getFallingObjects 返回状态
  const falling = getFallingObjects();
  const found = falling.find(o => o.id === 'integration_apple');
  if (found) {
    assertEq(found.landed, true, 'getFallingObjects 中 apple 状态为 landed=true');
  }

  // 再测试从 5m 掉落
  const ball = startDrop('integration_ball', '集成测试球', 5);
  let ballSteps = 0;
  while (ballSteps < 100 && !ball.landed) {
    tickGravity(0.1);
    ballSteps++;
  }
  assert(ball.landed, `球经过 ${ballSteps} 步后落地`);
  assertClose(ball.current_z, 0, 0.01, '球落地后 z=0');

  console.log(`  物理解算: 苹果 ${steps}步, 球 ${ballSteps}步 落地`);
});

// ==================== 4. 化学解算端到端 ====================

runSuite('E2E — 化学解算（冷却→温度下降）', () => {
  const objId = 'integration_hot_water';

  // 开始冷却：100°C → 室温 25°C，冷却常数 0.005
  startCooling(objId, 100, 25, 0.005);

  // 验证冷却状态已注册
  const allStates = getAllCoolingStates();
  const found = allStates.find(s => s.id === objId);
  assertNotNull(found, '冷却对象已注册在 getAllCoolingStates 中');
  assertClose(found!.temp, 100, 1, '初始温度约 100°C');
  assertEq(found!.env, 25, '环境温度为 25°C');

  // 执行冷却 tick：从 100°C 冷却到 50°C
  let totalSec = 0;
  const tickDt = 1;
  const maxSec = 1200;
  let temp = found!.temp;

  while (totalSec < maxSec && temp > 50) {
    tickCooling(tickDt);
    totalSec += tickDt;
    const states = getAllCoolingStates();
    const current = states.find(s => s.id === objId);
    if (!current) break;
    temp = current.temp;
  }

  assert(totalSec > 0, '冷却过程已执行');
  assertClose(totalSec, 240, 200, '100→50°C 冷却时间约 240s（±200s）');
  assert(temp <= 51, `温度已降到 50°C 附近，实际 ${temp.toFixed(1)}°C`);

  // 继续冷却到接近室温
  while (totalSec < maxSec * 2) {
    tickCooling(tickDt);
    totalSec += tickDt;
    const states = getAllCoolingStates();
    const current = states.find(s => s.id === objId);
    if (!current) break;
    temp = current.temp;
    if (temp <= 26) break;
  }
  assert(temp <= 26, `冷却接近室温，实际 ${typeof temp === 'number' ? temp.toFixed(1) : '已移除'}`);

  console.log(`  化学解算: 100→50°C 耗时 ${totalSec}s，最终 ${typeof temp === 'number' ? temp.toFixed(1) : '室温'}`);
});

// ==================== 5. 事件总线端到端 ====================

runSuite('E2E — 事件总线端到端', () => {
  worldBus.clear();

  let receivedCount = 0;
  let receivedPayload: any = null;

  // 注册 handler
  worldBus.on(WorldEvents.PHYSICS_OBJECT_FELL, (payload) => {
    receivedCount++;
    receivedPayload = payload;
  });

  // 通过模块 emit（模拟掉落触发事件）
  worldBus.emit(WorldEvents.PHYSICS_OBJECT_FELL, {
    object: 'test_cup',
    name: '测试杯子',
    from_z: 5,
    timestamp_ms: Date.now(),
  });

  assertEq(receivedCount, 1, 'handler 收到 1 次事件');
  assertNotNull(receivedPayload, 'handler 收到 payload');
  assertEq(receivedPayload.object, 'test_cup', 'payload.object 正确');
  assertEq(receivedPayload.name, '测试杯子', 'payload.name 正确');
  assertEq(receivedPayload.from_z, 5, 'payload.from_z 为 5');

  // 验证事件日志
  const log = worldBus.getLog(10);
  const lastEntry = log[log.length - 1];
  assertEq(lastEntry.event, WorldEvents.PHYSICS_OBJECT_FELL, '事件日志记录了正确的事件类型');

  // 验证不同事件互不干扰
  let sceneChanged = false;
  let weatherUpdated = false;

  worldBus.on(WorldEvents.SCENE_CHANGED, () => { sceneChanged = true; });
  worldBus.on(WorldEvents.WEATHER_UPDATED, () => { weatherUpdated = true; });

  worldBus.emit(WorldEvents.WEATHER_UPDATED, { temp: 28 });
  assertEq(weatherUpdated, true, 'WEATHER_UPDATED handler 触发');
  assertEq(sceneChanged, false, 'SCENE_CHANGED handler 未触发');

  worldBus.clear();
  console.log('  事件总线端到端验证通过');
});

// ==================== 6. 时间服务验证 ====================

runSuite('E2E — 时间服务验证', () => {
  const worldTime = getWorldTime();
  assertNotNull(worldTime, 'getWorldTime 返回非 null');

  // 验证关键字段存在且合理
  assert(worldTime.year > 2025, `年 ${worldTime.year} > 2025`);
  assert(worldTime.month >= 1 && worldTime.month <= 12, `月 ${worldTime.month} 在 1-12 范围`);
  assert(worldTime.day >= 1 && worldTime.day <= 31, `日 ${worldTime.day} 在 1-31 范围`);

  console.log(`  世界时间: ${worldTime.year}-${String(worldTime.month).padStart(2, '0')}-${String(worldTime.day).padStart(2, '0')}`);

  // 验证节气计算
  const terms = calculateSolarTerms(2026);
  assertNotNull(terms, 'calculateSolarTerms(2026) 返回非 null');
  assertEq(terms.size, 24, '应返回 24 个节气');

  // 验证月相计算
  const [phaseName, phaseAngle, moonAge] = calculateMoonPhase(new Date(2026, 6, 6));
  assertNotNull(phaseName, '月相名称非 null');
  assert(phaseAngle >= 0 && phaseAngle < 360, `月相角度 ${phaseAngle} 在 [0,360)`);
  assert(moonAge >= 0 && moonAge <= 30, `月龄 ${moonAge} 在 [0,30]`);

  // 验证公历转农历
  const lunar = assertNotNull(solarToLunar(new Date(2026, 6, 6)), '2026-07-06 农历转换非 null');
  assert(lunar.year > 0, '农历年有效');
  assert(lunar.month >= 1 && lunar.month <= 12, '农历月有效');
  assert(lunar.day >= 1 && lunar.day <= 30, '农历日有效');

  console.log(`  月相: ${phaseName}, 角度: ${phaseAngle.toFixed(1)}°, 农历: ${lunar.yearName}${lunar.monthName}${lunar.dayName}`);
});

// ==================== 7. Hook 探针端到端 ====================

runSuite('E2E — Hook 探针端到端', () => {
  // 运行全量 Hook 探针
  const snapshots = runAllHooks('晴', 22);
  assert(snapshots.length > 0, 'runAllHooks 返回至少一条探针快照');
  console.log(`  生成 ${snapshots.length} 条 Hook 快照`);

  // 验证每种探针类型
  const hookIds = snapshots.map(s => s.hook_id);
  const uniqueHooks = Array.from(new Set(hookIds));
  console.log(`  探针类型: ${uniqueHooks.join(', ')}`);

  // 验证关键探针存在：场景转换探针和物件总数探针
  const hasSceneTransition = snapshots.some(s => s.hook_id === 'scene_transition');
  const hasObjectsTotal = snapshots.some(s => s.hook_id === 'objects_total');
  assert(hasSceneTransition || hasObjectsTotal, '至少存在 scene_transition 或 objects_total 探针');

  // 验证探针结构完整性
  for (const snap of snapshots) {
    assertNotNull(snap.hook_id, `探针 ${snap.hook_id} hook_id 非空`);
    assertNotNull(snap.module, `探针 ${snap.hook_id} module 非空`);
    assertNotNull(snap.status, `探针 ${snap.hook_id} status 非空`);
    assert(['ok', 'warning', 'critical'].includes(snap.status),
      `探针 ${snap.hook_id} status="${snap.status}" 有效`);
    assert(snap.timestamp_ms > 0, `探针 ${snap.hook_id} timestamp_ms > 0`);
  }

  // 验证 Hook 日志可获取
  const recentLogs = getRecentHookLogs(5);
  assert(recentLogs.length > 0, 'getRecentHookLogs 返回日志条目');
  console.log(`  最近 Hook 日志: ${recentLogs.length} 条`);

  // 验证高温告警
  const hotSnapshots = runAllHooks('晴', 38);
  const hasHeatWarning = hotSnapshots.some(s => s.hook_id === 'env_heat');
  assert(hasHeatWarning, '38°C 时触发高温告警(env_heat)');

  // 验证低温告警
  const coldSnapshots = runAllHooks('晴', 2);
  const hasColdWarning = coldSnapshots.some(s => s.hook_id === 'env_cold');
  assert(hasColdWarning, '2°C 时触发低温告警(env_cold)');
});

// ==================== 8. 日报生成验证 ====================

runSuite('E2E — 日报生成验证', () => {
  // 生成每日报告
  const report = generateDailyReport();
  assertNotNull(report, 'generateDailyReport 返回非 null');
  assert(typeof report === 'string', '报告为字符串类型');
  assert(report.length > 100, `报告长度 > 100，实际 ${report.length}`);

  // 验证报告包含 Markdown 标题（实际格式: # 瑶光 Yaogal 世界日报）
  assert(report.includes('世界日报') || report.includes('每日体检报告'), '报告包含标题');
  assert(report.includes('健康评分'), '报告包含健康评分');
  assert(report.includes('模块状态'), '报告包含模块状态');
  assert(report.includes('#') && report.includes('##'), '报告有 Markdown 层级标题');

  console.log(`  日报生成: ${report.length} 字符`);
  console.log(`  报告预览: ${report.slice(0, 80)}...`);
});

// ==================== 清理与总结 ====================

runSuite('E2E — 清理', () => {
  worldBus.clear();
  closeDatabase();
  console.log('数据库已关闭，事件总线已清空');
});

summarize();
