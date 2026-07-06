/**
 * 亲密引擎测试 — intimacy_engine
 * 唤起度、触觉事件、化学递质、高潮转换、24部位属性
 * 不依赖数据库，直接测试模块级状态
 */
import { applyTouch, getIntimacyPerception, resetIntimacy } from '../src/perception_seven/intimacy_perception/intimacy_engine';
import { assert, assertEq, assertClose, assertNotNull, runSuite, summarize } from './test_harness';

// 每次 suite 前重置状态
function reset() {
  resetIntimacy();
}

runSuite('唤起度从初始值开始', () => {
  reset();
  const snap = getIntimacyPerception();
  assertNotNull(snap, 'getIntimacyPerception 返回快照');
  // 模块 resetState 将 arousalLevel 初始化为 5
  assertEq(snap.arousal, 5, '初始唤起度为5（模块默认值）');
});

runSuite('触觉事件增加唤起度', () => {
  reset();

  // 初始唤起度
  let snap = getIntimacyPerception();
  const initialArousal = snap.arousal;

  // 亲吻嘴唇 — 高敏感部位，应显著增加唤起度
  const result = applyTouch({
    type: 'kiss',
    target_part_id: 'lips',
    intensity: 0.7,
    speed: 0.6,
    duration_sec: 5,
    area: 0.3,
  });

  assertNotNull(result, 'applyTouch 返回结果');
  assert(result.arousal > initialArousal, '亲吻后唤起度上升');
  assert(result.arousal > 10, '唤起度超过10');

  // 再次检查快照
  snap = getIntimacyPerception();
  assert(snap.arousal > initialArousal, '快照中唤起度已上升');
  assert(snap.phase !== 'idle', '阶段已脱离 idle');
});

runSuite('化学递质初始值', () => {
  reset();

  const snap = getIntimacyPerception();
  assertNotNull(snap.chemistry, '化学递质数据存在');

  const chem = snap.chemistry;

  // 初始值应与 resetState 一致
  assertClose(chem.dopamine, 20, 1, '多巴胺初始值约20');
  assertClose(chem.oxytocin, 15, 1, '催产素初始值约15');
  assertClose(chem.serotonin, 30, 1, '血清素初始值约30');
  assertClose(chem.adrenaline, 5, 1, '肾上腺素初始值约5');
  assertClose(chem.endorphin, 10, 1, '内啡肽初始值约10');
  assert(chem.estrogen >= 0 && chem.estrogen <= 100, '雌激素在0-100范围内');

  // 触觉事件后化学递质应变化
  applyTouch({
    type: 'kiss',
    target_part_id: 'lips',
    intensity: 0.8,
    speed: 0.7,
    duration_sec: 10,
    area: 0.4,
  });

  const snap2 = getIntimacyPerception();
  const chem2 = snap2.chemistry;
  assert(chem2.dopamine > chem.dopamine, '多巴胺上升');
  assert(chem2.adrenaline > chem.adrenaline, '肾上腺素上升');
  assert(chem2.endorphin > chem.endorphin, '内啡肽上升');
});

runSuite('高潮状态转换', () => {
  reset();

  // 第一步：温和触摸进入兴奋期
  applyTouch({
    type: 'kiss',
    target_part_id: 'lips',
    intensity: 0.7,
    speed: 0.6,
    duration_sec: 5,
    area: 0.3,
  });

  let snap = getIntimacyPerception();
  assert(snap.phase !== 'idle', '温和触摸后阶段不再为idle');
  assert(snap.orgasm_phase === 'excitement', '进入兴奋期(excitement)');
  assertEq(snap.orgasm_count, 0, '初始高潮次数为0');

  // 第二步：多次强烈触摸阴蒂，累积到高潮
  const touchEvent = {
    type: 'enter' as const,
    target_part_id: 'clitoris',
    intensity: 1.0,
    speed: 1.0,
    duration_sec: 10,
    area: 0.5,
  };

  let orgasmReached = false;
  for (let i = 0; i < 20; i++) {
    const result = applyTouch(touchEvent);
    snap = getIntimacyPerception();

    if (snap.orgasm_phase === 'orgasm' || snap.orgasm_count > 0) {
      orgasmReached = true;
      break;
    }
  }

  assert(orgasmReached, '多次强烈刺激后达到高潮状态');

  // 高潮后化学递质爆发
  assert(snap.chemistry.dopamine >= 90, '高潮后多巴胺爆发（≥90）');
  assert(snap.chemistry.endorphin >= 90, '高潮后内啡肽爆发（≥90）');
  assert(snap.orgasm_count >= 1, '高潮次数≥1');
});

runSuite('24部位属性查询', () => {
  reset();

  // 对多个不同部位施加触摸，验证部位系统正常工作
  const testParts = [
    { id: 'lips', name: '嘴唇' },
    { id: 'neck', name: '脖颈' },
    { id: 'breasts', name: '乳房' },
    { id: 'nipples', name: '乳头' },
    { id: 'clitoris', name: '阴蒂' },
    { id: 'vagina', name: '阴道' },
    { id: 'g_spot', name: 'G点' },
    { id: 'inner_thigh', name: '大腿内侧' },
    { id: 'belly', name: '腹部' },
    { id: 'hands', name: '手' },
    { id: 'ears', name: '耳朵' },
    { id: 'lower_back', name: '后腰' },
    { id: 'buttocks', name: '臀部' },
  ];

  for (const part of testParts) {
    const result = applyTouch({
      type: 'light_stroke',
      target_part_id: part.id,
      intensity: 0.5,
      speed: 0.4,
      duration_sec: 3,
      area: 0.3,
    });

    assert(result.feedback !== undefined, `${part.name} 触摸有反馈`);
    assert(result.arousal >= 0 && result.arousal <= 100, `${part.name} 唤起度在有效范围`);
  }

  // 检查快照中的部位摘要
  const snap = getIntimacyPerception();
  assertNotNull(snap.body_summary, 'body_summary 存在');
  assert(Array.isArray(snap.body_summary), 'body_summary 是数组');
  assert(snap.body_summary.length > 0, '有活跃部位被记录');

  // 验证敏感部位有更高的兴奋度
  const clitorisPart = snap.body_summary.find((p: any) => p.name === '阴蒂');
  if (clitorisPart) {
    assert(clitorisPart.state !== 'idle', '阴蒂触觉状态已改变');
    assert(clitorisPart.excitation > 0, '阴蒂有神经兴奋');
  }

  // 快照结构完整性检查
  assert(snap.phase !== undefined, 'phase 字段存在');
  assert(snap.orgasm_phase !== undefined, 'orgasm_phase 字段存在');
  assert(snap.pleasure !== undefined, 'pleasure 字段存在');
  assert(snap.smell !== undefined, 'smell 字段存在');
  assert(snap.auditory !== undefined, 'auditory 字段存在');
  assert(snap.preferences !== undefined, 'preferences 字段存在');
});

summarize();
