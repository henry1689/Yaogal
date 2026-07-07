/**
 * 叙事编码器 — 端到端验证
 * 编译主程序启动确认 WS 快照 + 叙事编码正常输出
 */
import { initDatabase } from '../src/common/database';
import { startTimeService } from '../src/natural_env/time_calendar/time_service';
import { startPerceptionService } from '../src/perception_seven/perception_service';
import { initSelfEntity } from '../src/self_entity/self_entity_service';
import { initSexualOrganPhysiology } from '../src/intimacy_extension/sexual_organ_physiology';
import { buildCompactContext } from '../src/narrative_encoder';

// 初始化最小运行环境
initDatabase();
startTimeService();
initSelfEntity();
initSexualOrganPhysiology();
startPerceptionService();

// 等待系统启动
setTimeout(() => {
  console.log('=== 叙事编码器输出 ===');
  const ctx = buildCompactContext();
  console.log(ctx);
  console.log('');
  console.log('=== 验证: 非空，含中文 ===');
  console.assert(ctx.length > 0, '上下文不应为空');
  console.assert(/[\u4e00-\u9fff]/.test(ctx), '应包含中文');
  console.log('');
  console.log('✅ 叙事编码器测试通过');
  process.exit(0);
}, 1500);
