import assert from 'node:assert/strict';
import test from 'node:test';
import { localDateKey, shiftLocalDateKey } from '../src/workspace/dailyPreferences.ts';

test('按用户时区计算当地日期', () => {
  const instant = new Date('2026-08-19T01:00:00.000Z');
  assert.equal(localDateKey('America/Los_Angeles', instant), '2026-08-18');
  assert.equal(localDateKey('Asia/Shanghai', instant), '2026-08-19');
  assert.equal(shiftLocalDateKey('America/Los_Angeles', 1, instant), '2026-08-19');
});
