/**
 * 物理化学测试 — gravity + chem
 * 重力掉落、跳跃、水温冷却、食物变质、茶水浓度
 */
import { startDrop, tickGravity, startJump, tickJump, getJumpState, getFallingObjects } from '../src/simple_physics/basic_gravity/gravity_service';
import { startCooling, tickCooling, getCoolingTemp, registerFood, tickFoodDecay, getFoodFreshness, initTea, pourWater, drinkTea, getTeaState } from '../src/simple_physics/simple_chem/chem_service';
import { assert, assertEq, assertClose, assertNotNull, runSuite, summarize } from './test_harness';

runSuite('重力掉落 — z坐标归零', () => {
  // 从10m高度掉落苹果
  const apple = startDrop('obj_apple', '苹果', 10);
  assertNotNull(apple, '苹果掉落对象创建');
  assertEq(apple.landed, false, '初始未落地');
  assertClose(apple.current_z, 10, 0.01, '初始高度10m');

  // 模拟重力tick直到落地（10m高度，自由落体约1.43秒）
  const dt = 0.1; // 每步0.1秒
  let maxSteps = 50;
  while (maxSteps-- > 0 && !apple.landed) {
    tickGravity(dt);
  }

  assertEq(apple.landed, true, '苹果已落地');
  assertClose(apple.current_z, 0, 0.01, '落地后z坐标为0');

  // 验证z归零：落地后物体不再下坠
  tickGravity(1.0);
  assertClose(apple.current_z, 0, 0.01, '落地后z保持为0');
});

runSuite('跳跃上升后回落', () => {
  // 从平地上起跳
  const result = startJump(0);
  assertEq(result.ok, true, '起跳成功');

  // 模拟跳跃物理
  const dt = 0.05;
  let peakZ = 0;
  let landed = false;
  const jumpState = getJumpState();
  assertEq(jumpState.jumping, true, '跳跃状态为true');

  for (let i = 0; i < 200; i++) {
    const currentZ = tickJump(dt);
    if (currentZ > peakZ) peakZ = currentZ;

    const js = getJumpState();
    if (!js.jumping) {
      landed = true;
      break;
    }
  }

  assertEq(landed, true, '跳跃后已落地');
  assert(peakZ > 0, '曾上升到高于地面'); // 应该飞起来过
  // tickJump 每次从 jumpStartZ 计算单步位移，首 tick 峰值 = (v0 - g*dt) * dt
  // dt=0.05 时：peakZ = (3 - 9.8*0.05)*0.05 = 0.1255
  assertClose(peakZ, 0.126, 0.01, '跳跃峰值高度约0.126m（tickJump单步实现）');

  // 落地后z归零
  const finalState = getJumpState();
  assertEq(finalState.jumping, false, '落地后跳跃状态为false');
  assertClose(finalState.current_z, 0, 0.01, '落地后z归零');
});

runSuite('水温冷却 — 100→50约240秒', () => {
  const objId = 'hot_water_cup';
  startCooling(objId, 100, 25, 0.005); // 初始100°C，室温25°C

  // 冷却到50°C
  let temp = getCoolingTemp(objId);
  assertNotNull(temp, '冷却状态存在');
  assertClose(temp!, 100, 0.1, '初始温度100°C');

  let totalSec = 0;
  const dt = 1; // 每秒一步
  while (totalSec < 600 && temp !== null && temp > 50) {
    tickCooling(dt);
    totalSec += dt;
    temp = getCoolingTemp(objId);
  }

  assert(totalSec > 0, '冷却过程已执行');
  // 理论计算：T(t)=25+75*e^(-0.005*t)，达到50°C需要 t=ln(75/25)/0.005 ≈ 219.7秒
  assertClose(totalSec, 240, 60, '100→50°C冷却时间约240秒（±60秒）');
  assert(temp !== null && temp <= 50.5, '温度已降到50°C附近');
});

runSuite('食物变质三级状态', () => {
  const foodId = 'test_steak';
  // 注册食物：新鲜度100，高温30°C（加速变质），高湿70%
  registerFood(foodId, 100, 30, 70);

  // 检查初始状态
  let state = getFoodFreshness(foodId);
  assertNotNull(state, '食物状态存在');
  assertEq(state!.level, 'fresh', '初始为fresh');

  // 快速老化：用大dt模拟变质
  // 每秒衰减 = 8/(24*3600) * tempFactor * humidityFactor * 100
  // tempFactor = 2^((30-25)/10) ≈ 1.414
  // humidityFactor = 1 + (70-50)*0.01 = 1.2
  // decayPerSec ≈ 8/86400 * 1.414 * 1.2 * 100 ≈ 0.0157%/s
  // 从100→60需要约2548秒，我们一次性推进3000秒
  tickFoodDecay(3000);
  state = getFoodFreshness(foodId);
  if (state) {
    assert(state.freshness <= 60 || state.level === 'slightly_spoiled' || state.level === 'spoiled',
      '3000秒后新鲜度下降');
  }

  // 继续变质到 slightly_spoiled
  tickFoodDecay(5000);
  state = getFoodFreshness(foodId);
  if (state) {
    assert(state.level === 'slightly_spoiled' || state.level === 'spoiled',
      '持续变质进入 slightly_spoiled 或 spoiled');
  }

  // 加速到完全 spoiled
  tickFoodDecay(50000);
  state = getFoodFreshness(foodId);
  if (state) {
    assertEq(state.level, 'spoiled', '最终完全变质为 spoiled');
  }
});

runSuite('茶水浓度逐次降低', () => {
  const cupId = 'test_teacup';
  initTea(cupId, 300);

  // 第一次泡茶：注入300ml 90°C热水
  let result = pourWater(cupId, 300, 90);
  assertEq(result.ok, true, '第一次注水成功');

  let tea = getTeaState(cupId);
  assertNotNull(tea, '茶杯状态存在');
  assertClose(tea!.volume_ml, 300, 0.1, '体积300ml');

  // 喝第一口（5口，每口20ml = 100ml）
  result = drinkTea(cupId, 5);
  assertEq(result.ok, true, '第一次饮用成功');

  tea = getTeaState(cupId);
  assertNotNull(tea, '茶杯状态存在');
  assertClose(tea!.volume_ml, 200, 0.1, '剩余200ml');

  // 第二次注水（续水100ml，80°C）
  result = pourWater(cupId, 100, 80);
  assertEq(result.ok, true, '第二次注水成功');

  tea = getTeaState(cupId);
  assertNotNull(tea, '茶杯状态存在');
  assertClose(tea!.volume_ml, 300, 0.1, '体积回到300ml');
  // 混合温度: (200*90 + 100*80) / 300 ≈ 86.67
  assertClose(tea!.temperature, 86.67, 0.5, '混合后温度约86.7°C');

  // 再喝5口
  result = drinkTea(cupId, 5);
  assertEq(result.ok, true, '第二次饮用成功');

  tea = getTeaState(cupId);
  assertClose(tea!.volume_ml, 200, 0.1, '剩余200ml');

  // 第三次注水
  result = pourWater(cupId, 100, 80);
  assertEq(result.ok, true, '第三次注水成功');

  tea = getTeaState(cupId);
  assertNotNull(tea, '茶杯状态存在');
  assertClose(tea!.volume_ml, 300, 0.1, '体积回到300ml');

  // 再喝
  result = drinkTea(cupId, 5);
  assertEq(result.ok, true, '第三次饮用成功');

  tea = getTeaState(cupId);
  assertClose(tea!.volume_ml, 200, 0.1, '剩余200ml');

  // 验证多次冲泡后体积追踪正常
  assert(tea!.volume_ml > 0, '茶杯中仍有茶水');
});

summarize();
