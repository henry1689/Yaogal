/**
 * 性器官生理模块测试
 * 验证：解剖初始化 → 每秒衰减 → 刺激响应 → 高潮触发 → 双向增益
 */
import {
  initSexualOrganPhysiology,
  sexualOrganTick,
  getFemaleOrganState,
  getMaleOrganState,
  getSexualOrganSnapshot,
  applyIntercourseStimulus,
  applyManualStimulus,
  startIntercourse,
  endIntercourse,
  resetSexualOrgans,
  IntercourseStimulus,
} from '../src/intimacy_extension/sexual_organ_physiology';

import {
  advanceThrustCycle,
  computeMechanics,
  thrustForce,
  recommendPosition,
  ThrustCycle,
} from '../src/intimacy_extension/intercourse_mechanics';

import {
  computeBidirectionalGain,
  applyGainToPhysiology,
  executeClosedLoopStep,
} from '../src/intimacy_extension/pleasure_amplifier';

import { initDatabase } from '../src/common/database';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, name: string): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name} (${actual} ≈ ${expected})`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: got ${actual}, expected ${expected}±${tolerance}`);
  }
}

async function main() {
  console.log('\n═══════════════════════════════════');
  console.log('  性器官生理模块 — 测试套件');
  console.log('═══════════════════════════════════\n');

  // ============================================================
  // 1. 初始化测试
  // ============================================================
  console.log('[1] 初始化与默认状态');
  initDatabase();
  initSexualOrganPhysiology();

  const female = getFemaleOrganState();
  const male = getMaleOrganState();

  assert(female !== null && male !== null, '初始化成功返回非空状态');

  // 验证女性默认值
  assert(female.clitoral.glans_sensitivity === 100, '阴蒂头敏感度默认100');
  assert(female.vaginal.length_cm === 7.5, '阴道静息长度7.5cm');
  assert(female.vaginal.lubrication === 15, '阴道静息润滑度15');
  assert(female.uterine.estrogen_level >= 50, '雌激素默认≥50');
  assert(female.multi_orgasmic_capable === true, '女性可多重高潮');
  assert(female.orgasm_phase === 'none', '初始高潮阶段为none');
  assert(female.orgasm_count === 0, '初始高潮次数为0');

  // 验证男性默认值
  assert(male.penile.flaccid_length_cm === 8, '疲软长度8cm');
  assert(male.penile.erect_length_cm === 14.5, '勃起长度14.5cm');
  assert(male.penile.erection_firmness === 0, '初始硬度为0');
  assert(male.testicular.sperm_reserve === 100, '初始精子储备100');
  assert(male.orgasm_phase === 'none', '男性初始高潮阶段为none');

  // 验证快照
  const snap = getSexualOrganSnapshot();
  assert(snap.female.overall.orgasm_count === 0, '快照中高潮次数为0');
  assert(snap.male.penile.erection_firmness === 0, '快照中硬度为0');

  console.log();

  // ============================================================
  // 2. 每秒衰减测试
  // ============================================================
  console.log('[2] 静息衰减');

  // 手动注入唤起状态
  const fState = getFemaleOrganState();
  fState.vaginal.lubrication = 80;
  fState.clitoral.nerve_excitation = 50;

  // 100秒衰减
  for (let i = 0; i < 100; i++) {
    sexualOrganTick(1);
  }

  const fAfter = getFemaleOrganState();
  assert(fAfter.vaginal.lubrication < 80, '润滑度衰减（<80）');
  assert(fAfter.vaginal.lubrication > 10, '润滑度未衰减到0（>10）');
  assert(fAfter.clitoral.nerve_excitation < 50, '阴蒂兴奋度衰减');

  // 不应期测试
  assert(fAfter.refractory_remaining_sec === 0, '不应期已消耗完');

  console.log();

  // ============================================================
  // 3. 性交刺激测试
  // ============================================================
  console.log('[3] 性交刺激');

  resetSexualOrgans();
  startIntercourse();

  const afterStartF = getFemaleOrganState();
  const afterStartM = getMaleOrganState();

  assert(afterStartF.vaginal.lubrication > 15, '插入后润滑度上升');
  assert(afterStartM.penile.erection_firmness >= 70, '插入后硬度≥70');
  assert(afterStartF.vaginal.length_cm > 7.5, '阴道长度延展');

  // 连续刺激10步（模拟抽插）
  for (let i = 0; i < 10; i++) {
    const stim: IntercourseStimulus = {
      penetration_depth_cm: 8 + Math.random() * 4,
      thrust_speed_cm_s: 5 + Math.random() * 15,
      thrust_force: 0.3 + Math.random() * 0.5,
      contact_type: i % 3 === 0 ? 'grind' : 'thrust',
      clitoral_stimulus: 0.1 + Math.random() * 0.3,
      gspot_pressure: 0.2 + Math.random() * 0.4,
      cervix_pressure: 0.05 + Math.random() * 0.15,
    };
    const resp = applyIntercourseStimulus(stim);
    assert(resp.female_response !== undefined, `刺激${i}: 女性有响应`);
    assert(resp.male_response !== undefined, `刺激${i}: 男性有响应`);
    sexualOrganTick(1);
  }

  const afterStimF = getFemaleOrganState();
  const afterStimM = getMaleOrganState();

  assert(afterStimF.vaginal.nerve_excitation > 5, '阴道神经兴奋度>5');
  assert(afterStimF.clitoral.nerve_excitation > 5, '阴蒂神经兴奋度>5');
  assert(afterStimM.penile.nerve_excitation > 5, '阴茎神经兴奋度>5');
  assert(afterStimM.penile.ejaculation_buildup > 0, '射精累积>0');

  console.log();

  // ============================================================
  // 4. 高潮触发测试
  // ============================================================
  console.log('[4] 高潮触发');

  resetSexualOrgans();
  startIntercourse();

  // 高强度持续刺激触发阴蒂高潮
  for (let i = 0; i < 30; i++) {
    const stim: IntercourseStimulus = {
      penetration_depth_cm: 10,
      thrust_speed_cm_s: 20,
      thrust_force: 0.9,
      contact_type: 'thrust',
      clitoral_stimulus: 0.8,  // 高阴蒂刺激
      gspot_pressure: 0.6,
      cervix_pressure: 0.3,
    };
    applyIntercourseStimulus(stim);
    sexualOrganTick(1);
  }

  const orgasmF = getFemaleOrganState();
  assert(orgasmF.orgasm_count >= 1, '女性达到至少1次高潮');

  // 极高强度刺激触发男性射精
  for (let i = 0; i < 30; i++) {
    const stim: IntercourseStimulus = {
      penetration_depth_cm: 12,
      thrust_speed_cm_s: 25,
      thrust_force: 1.0,
      contact_type: 'thrust',
      clitoral_stimulus: 0.5,
      gspot_pressure: 0.8,
      cervix_pressure: 0.5,
    };
    applyIntercourseStimulus(stim);
    sexualOrganTick(1);
  }

  const orgasmM = getMaleOrganState();
  assert(orgasmM.ejaculation_count >= 1, '男性达到至少1次射精');

  // 射精后精子储备下降
  assert(orgasmM.testicular.sperm_reserve < 100, '射精后精子储备下降');

  // 男性不应期
  assert(orgasmM.refractory_remaining_sec > 0, '射精后男性进入不应期');

  console.log();

  // ============================================================
  // 5. 手动刺激测试
  // ============================================================
  console.log('[5] 手动刺激');

  resetSexualOrgans();

  // 口交刺激阴蒂 10秒
  for (let i = 0; i < 10; i++) {
    applyManualStimulus('clitoris', 0.7, 1, 'lick');
    sexualOrganTick(1);
  }

  const afterManual = getFemaleOrganState();
  assert(afterManual.clitoral.nerve_excitation > 10, '口交刺激后阴蒂兴奋度>10');
  assert(afterManual.clitoral.orgasm_buildup > 5, '口交刺激后高潮累积>5');

  // 持续刺激触发阴蒂高潮
  for (let i = 0; i < 20; i++) {
    applyManualStimulus('clitoris', 0.9, 1, 'suck');
    sexualOrganTick(1);
  }

  const afterSuck = getFemaleOrganState();
  assert(afterSuck.orgasm_count >= 1, '口交刺激达到阴蒂高潮');

  console.log();

  // ============================================================
  // 6. 力学模块测试
  // ============================================================
  console.log('[6] 性交力学');

  const cycle: ThrustCycle = {
    phase: 0.25,
    frequency_hz: 1.5,
    stroke_length_cm: 8,
    current_depth_cm: 6,
    current_speed_cm_s: 10,
    accelerating: true,
  };

  // 推进一个时间步
  const advanced = advanceThrustCycle(cycle, 1);
  assert(advanced.phase !== cycle.phase, '相位推进');
  assert(advanced.current_depth_cm > 0, '深度>0');
  assert(advanced.current_speed_cm_s >= 0, '速度≥0');

  // 力度计算
  const force = thrustForce(advanced);
  assert(force > 0 && force <= 1, `力度在合理范围: ${force}`);

  // 完整力学计算
  const femaleForMech = getFemaleOrganState();
  const maleForMech = getMaleOrganState();
  femaleForMech.vaginal.lubrication = 60;
  maleForMech.penile.erection_firmness = 90;

  const mech = computeMechanics('missionary', advanced, femaleForMech, maleForMech);
  assert(mech.penetration_depth_cm > 0, '穿透深度>0');
  assert(mech.wall_pressure_kpa > 0, '壁压力>0');
  assert(mech.stimulus.thrust_speed_cm_s > 0, '刺激向量速度>0');

  // 体位推荐
  const recs = recommendPosition(femaleForMech, maleForMech);
  assert(recs.length === 6, '返回6个体位');
  assert(recs[0].score > 0, '最高分>0');

  console.log();

  // ============================================================
  // 7. 双向增益测试
  // ============================================================
  console.log('[7] 双向愉悦放大器');

  const femAmp = getFemaleOrganState();
  const maleAmp = getMaleOrganState();

  // 双方向唤起
  femAmp.vaginal.nerve_excitation = 40;
  femAmp.clitoral.nerve_excitation = 50;
  femAmp.vaginal.lubrication = 60;
  maleAmp.penile.erection_firmness = 85;
  maleAmp.penile.nerve_excitation = 50;

  const amp = computeBidirectionalGain(
    femAmp, maleAmp,
    70, 65,   // 双方向唤起度
    50, 30,   // 音量
    80,       // 情感亲密
  );

  assert(amp.her_gain_from_him > 1.0, `她对他的增益>1: ${amp.her_gain_from_him}`);
  assert(amp.his_gain_from_her > 1.0, `他对她的增益>1: ${amp.his_gain_from_her}`);
  assert(amp.total_loop_gain > 1.0, `总闭环增益>1: ${amp.total_loop_gain}`);
  assert(amp.channels.visual_her > 0, '视觉通道>0');
  assert(amp.channels.auditory_him > 0, '听觉通道>0');
  assert(amp.channels.tactile_her > 0, '触觉通道>0');
  assert(amp.channels.emotional_resonance > 0, '情感共鸣>0');

  // 共振态
  const validStates = ['cold', 'neutral', 'warm', 'hot', 'blazing'];
  assert(validStates.includes(amp.resonance_state), `共振态有效: ${amp.resonance_state}`);

  // 增益应用
  const gain = applyGainToPhysiology(amp, 'plateau', 'building');
  assert(gain.her_arousal_multiplier > 0, '她唤起乘数>0');
  assert(gain.his_arousal_multiplier > 0, '他唤起乘数>0');

  // 闭环步骤
  const step = executeClosedLoopStep(
    femAmp, maleAmp, 70, 65, 50, 30, 80, 1,
  );
  assert(step.step === 1, '步骤号正确');
  assert(step.orgasm_proximity.her_pct >= 0, '她高潮距离≥0');
  assert(step.orgasm_proximity.his_pct >= 0, '他高潮距离≥0');

  console.log();

  // ============================================================
  // 8. 边界测试
  // ============================================================
  console.log('[8] 边界条件');

  resetSexualOrgans();

  // 空刺激
  const emptyStim: IntercourseStimulus = {
    penetration_depth_cm: 0, thrust_speed_cm_s: 0, thrust_force: 0,
    contact_type: 'thrust', clitoral_stimulus: 0, gspot_pressure: 0, cervix_pressure: 0,
  };
  const emptyResp = applyIntercourseStimulus(emptyStim);
  assert(emptyResp.female_response !== undefined, '空刺激仍有响应');

  // 极端润滑度
  const wetF = getFemaleOrganState();
  wetF.vaginal.lubrication = 100;  // 完全湿润时摩擦降低
  const wetGain = computeBidirectionalGain(
    wetF, getMaleOrganState(), 50, 50, 20, 20, 60,
  );
  assert(wetGain.his_gain_from_her > 0, '高润滑下他的增益正常');

  // 不应期拒绝刺激
  const refractoryF = getFemaleOrganState();
  refractoryF.refractory_remaining_sec = 30;
  // tick应该减少不应期
  for (let i = 0; i < 15; i++) sexualOrganTick(1);
  const afterRefract = getFemaleOrganState();
  assert(afterRefract.refractory_remaining_sec < 30, '不应期在tick中减少');

  // endIntercourse清理
  endIntercourse();
  const endedF = getFemaleOrganState();
  const endedM = getMaleOrganState();
  assert(endedF.orgasm_phase === 'resolution', '结束性交后女性进入消退期');
  assert(endedM.orgasm_phase === 'resolution', '结束性交后男性进入消退期');

  console.log();

  // ============================================================
  // 总结
  // ============================================================
  console.log('═══════════════════════════════════');
  console.log(`  通过: ${passed}  失败: ${failed}`);
  console.log(`  总计: ${passed + failed}`);
  console.log('═══════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('测试崩溃:', err);
  process.exit(1);
});
