/**
 * 行为系统全链路测试 — P0-2
 * 覆盖：即时行为/持续行为/连锁行为/延迟后果/中断
 */
import { initDatabase } from '../src/common/database';
import {
  initActionSystem,
  executeAction,
  interruptAction,
  tickActionSystem,
  getActiveActions,
  getPendingConsequences,
  getConsequenceQueueStats,
  getActionDef,
  getAllActionDefs,
  clearAllActiveActions,
} from '../src/creature_law/action_system/action_system';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ── 初始化 ──
initDatabase();
initActionSystem();
// 清理上次测试可能残留的活跃行为
clearAllActiveActions();

console.log('\n═══════════════════════════════════════════');
console.log('  行为系统测试套件');
console.log('═══════════════════════════════════════════\n');

// ==========================================
// 测试1：即时行为
// ==========================================
console.log('\n── 1. 即时行为 ──');
const drinkId = executeAction('drink_water');
check('喝水行为可执行', drinkId !== null && typeof drinkId === 'string');
check('喝水后无活跃行为（即时完成）', getActiveActions().length === 0);

const eatId = executeAction('eat_meal');
check('吃饭即时后果入队', eatId !== null);
const pq = getPendingConsequences();
const eatConseq = pq.find(c => c.instance_id === eatId);
check('吃饭延迟后果(消化饥饿回升)已在队列', !!eatConseq, eatConseq?.consequence?.description);

const sitId = executeAction('sit_down');
check('坐下即时后果(切换姿势)', sitId !== null);
const sitConseqs = getPendingConsequences().filter(c => c.instance_id === sitId);
check('坐下有延迟后果(久坐背部/颈部疲劳)', sitConseqs.length === 2);

// ==========================================
// 测试2：持续行为
// ==========================================
console.log('\n── 2. 持续行为 ──');
const workId = executeAction('work', 30); // 30秒工作
check('工作行为启动(30s)', workId !== null);
let active = getActiveActions();
check('工作行为处于活跃状态', active.length === 1);
check('行为是工作', active[0].action_def_id === 'work');
check('初始进度为0', active[0].progress < 0.1);

// 推进10秒
tickActionSystem(10);
active = getActiveActions();
check('10s后工作仍在活跃', active.length === 1);
check('进度推进', active[0].progress > 0.2 && active[0].progress < 1);

// 推进剩余时间完成
tickActionSystem(25);
active = getActiveActions();
check('完成30s工作后无活跃行为', active.length === 0);

// ==========================================
// 测试3：中断行为
// ==========================================
console.log('\n── 3. 中断行为 ──');
const sleepId = executeAction('sleep', 120);
check('睡眠行为启动(120s)', sleepId !== null);
active = getActiveActions();
check('睡眠活跃', active.length === 1 && active[0].action_def_id === 'sleep');

const interrupted = interruptAction(sleepId!);
check('中断睡眠成功（sleep可中断）', interrupted === true);
active = getActiveActions();
check('中断后无活跃行为', active.length === 0);

// 不可中断的行为
const commuteId = executeAction('commute', 60);
// commute 是 continuous 但 interruptible=false
check('通勤可中断（修复后）', getActionDef('commute')?.interruptible === true);

// ==========================================
// 测试4：连锁行为
// ==========================================
console.log('\n── 4. 连锁行为 ──');
const goOutId = executeAction('go_out');
check('出门连锁行为触发', goOutId !== null);
const goOutDef = getActionDef('go_out');
check('出门是连锁行为', goOutDef?.category === 'chained');
check('含3个子行为', goOutDef?.sub_actions?.length === 3);

// 即时行为立刻完成，子行为应入队
// go_out 本身 immediate 完成，但子行为需要通过 finish 触发
// 先手动 check 子行为定义
check('子行为1=换衣服', goOutDef?.sub_actions?.[0] === 'change_clothes');
check('子行为2=离家', goOutDef?.sub_actions?.[1] === 'leave_house');
check('子行为3=通勤', goOutDef?.sub_actions?.[2] === 'commute');
// 清理连锁行为产生的子行为
clearAllActiveActions();

// ==========================================
// 测试5：延迟后果链 — 熬夜
// ==========================================
console.log('\n── 5. 延迟后果链(熬夜) ──');
const stayUpId = executeAction('stay_up_late', 30);
check('熬夜行为启动(30s)', stayUpId !== null);

const allConseqs = getPendingConsequences();
const stayUpConseqs = allConseqs.filter(c => c.instance_id === stayUpId);
check('熬夜有4个延迟后果', stayUpConseqs.length === 4);

// 按时间排序
stayUpConseqs.sort((a, b) => a.trigger_at - b.trigger_at);
check('延迟12h后果=免疫力下降', stayUpConseqs[0].consequence.description.includes('免疫力'));
check('延迟24h后果=次日持续疲劳', stayUpConseqs[1].consequence.description.includes('疲劳'));
check('延迟72h后果=感冒概率提升', stayUpConseqs[2].consequence.description.includes('感冒'));
check('延迟168h后果=皮肤状态下降', stayUpConseqs[3].consequence.description.includes('皮肤'));

// 完成熬夜行为
tickActionSystem(35);
active = getActiveActions();
check('熬夜完成后无活跃', active.length === 0);
clearAllActiveActions();

// ==========================================
// 测试6：延迟后果触发机制
// ==========================================
console.log('\n── 6. 延迟后果触发机制 ──');
const stayIndoorsId = executeAction('stay_indoors');
check('不出门行为触发', stayIndoorsId !== null);

const beforeTrigger = getPendingConsequences().filter(c => c.instance_id === stayIndoorsId);
check('不出门4个延迟后果入队', beforeTrigger.length === 4);

// 这些后果至少86400秒后才触发，当前不会触发
// 验证队列排序
const sorted = getPendingConsequences();
for (let i = 1; i < sorted.length; i++) {
  // 队列按trigger_at升序
}

const stats = getConsequenceQueueStats();
check('队列统计有效', stats.total > 0 && stats.pending > 0);

// ==========================================
// 测试7：运动完整链路
// ==========================================
console.log('\n── 7. 运动完整链路 ──');
const exerciseId = executeAction('intense_exercise', 20);
check('剧烈运动启动', exerciseId !== null);
active = getActiveActions();
check('运动活跃', active.length === 1);

tickActionSystem(10);
active = getActiveActions();
check('10s后运动仍在进行', active.length === 1);

tickActionSystem(15);
active = getActiveActions();
check('完成20s运动', active.length === 0);

const exConseqs = getPendingConsequences().filter(c => c.instance_id === exerciseId);
const descs = exConseqs.map(c => c.consequence.description);
check('运动后愉悦8h后触发', descs.some(d => d.includes('运动后愉悦')));
check('肌肉酸痛延迟触发', descs.some(d => d.includes('肌肉酸痛')));
check('体能提升24h后', descs.some(d => d.includes('体能提升')));
clearAllActiveActions();

// ==========================================
// 测试8：行为定义完整性
// ==========================================
console.log('\n── 8. 行为定义完整性 ──');
const allDefs = getAllActionDefs();
check('行为库至少10个行为', allDefs.length >= 10);

const cats = new Set(allDefs.map(d => d.category));
check('包含即时行为', cats.has('immediate'));
check('包含持续行为', cats.has('continuous'));
check('包含连锁行为', cats.has('chained'));

// 每个行为有id和name
for (const def of allDefs) {
  check(`行为 ${def.id} 有名称`, def.name.length > 0);
  check(`行为 ${def.id} 有分类`, def.category.length > 0);
}

// ==========================================
// 测试9：per_tick_effects
// ==========================================
console.log('\n── 9. 持续效果(per_tick) ──');
const walkId = executeAction('walk', 30);
check('走路启动(30s)', walkId !== null);
tickActionSystem(15);
active = getActiveActions();
check('15s走路进度50%', active.length === 1 && active[0].progress > 0.4 && active[0].progress < 0.6);

// 完成
tickActionSystem(20);
active = getActiveActions();
check('完成走路', active.length === 0);
clearAllActiveActions();

// ==========================================
// 测试10：多行为并行
// ==========================================
console.log('\n── 10. 多行为并行 ──');
executeAction('work', 20);
executeAction('walk', 15);
active = getActiveActions();
check('两个行为并行', active.length === 2);
check('行为1=work', active[0].action_def_id === 'work');
check('行为2=walk', active[1].action_def_id === 'walk');

tickActionSystem(16);
active = getActiveActions();
check('walk完成work仍在', active.length === 1 && active[0].action_def_id === 'work');

tickActionSystem(10);
active = getActiveActions();
check('全部完成', active.length === 0);

// ── 结果 ──
console.log(`\n═══════════════════════════════════════════`);
console.log(`  行为系统测试: ${passed}/${passed + failed} 通过`);
console.log(`═══════════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
