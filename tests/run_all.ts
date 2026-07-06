#!/usr/bin/env ts-node
/**
 * 瑶光 Yaogal — 全部测试运行入口
 * 用法: ts-node tests/run_all.ts [--unit] [--integration]
 */
import { execSync } from 'child_process';
import * as path from 'path';

const args = process.argv.slice(2);
const unitOnly = args.includes('--unit');
const integrationOnly = args.includes('--integration');

const unitTests = [
  'tests/event_bus.test.ts',
  'tests/time_service.test.ts',
  'tests/scene_object.test.ts',
  'tests/physio_service.test.ts',
  'tests/gravity_chem.test.ts',
  'tests/intimacy_engine.test.ts',
];

const integrationTests = [
  'tests/integration.test.ts',
];

const testsToRun = integrationOnly ? integrationTests
  : unitOnly ? unitTests
  : [...unitTests, ...integrationTests];

let totalPassed = 0, totalFailed = 0;

for (const testFile of testsToRun) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`▶ 运行: ${testFile}`);
  console.log(`${'═'.repeat(60)}`);

  try {
    const output = execSync(`npx ts-node ${testFile}`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 60000,
    });
    console.log(output);

    // 解析结果
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    if (passedMatch) totalPassed += parseInt(passedMatch[1]);
    if (failedMatch) totalFailed += parseInt(failedMatch[1]);
  } catch (e: any) {
    console.log(e.stdout || '');
    console.log(e.stderr || '');
    totalFailed++;
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`🏁 全部测试完成: ${totalPassed} passed, ${totalFailed} failed`);
console.log(`${'═'.repeat(60)}`);

if (totalFailed > 0) process.exit(1);
