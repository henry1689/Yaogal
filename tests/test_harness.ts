/**
 * 瑶光 Yaogal — 轻量测试框架
 * 零外部依赖，直接 ts-node 运行
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

export function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${msg}`);
  }
}

export function assertEq<T>(actual: T, expected: T, msg: string): void {
  const ok = actual === expected;
  if (ok) passed++;
  else {
    failed++;
    failures.push(`  FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) passed++;
  else {
    failed++;
    failures.push(`  FAIL: ${msg} — expected ${expected}±${tolerance}, got ${actual}`);
  }
}

export function assertNotNull<T>(value: T | null | undefined, msg: string): T {
  if (value != null) {
    passed++;
    return value;
  }
  failed++;
  failures.push(`  FAIL: ${msg} — got null/undefined`);
  return null as any;
}

export function runSuite(name: string, fn: () => void): void {
  const suiteStart = { passed: passed, failed: failed };
  console.log(`\n📋 ${name}`);
  try {
    fn();
  } catch (e: any) {
    failed++;
    failures.push(`  ERROR: ${name} — ${e.message}`);
  }
  const sPassed = passed - suiteStart.passed;
  const sFailed = failed - suiteStart.failed;
  if (sFailed === 0) console.log(`  ✅ ${sPassed} passed`);
  else console.log(`  ⚠️ ${sPassed} passed, ${sFailed} failed`);
}

export function summarize(): void {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`总结果: ${passed} passed, ${failed} failed, ${passed+failed} total`);
  if (failures.length > 0) {
    console.log(`\n失败详情:`);
    failures.forEach(f => console.log(f));
    process.exit(1);
  } else {
    console.log('🎉 全部通过！');
    process.exit(0);
  }
}
