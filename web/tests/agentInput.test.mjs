import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSendOnEnter } from '../src/agent/input.ts';

test('Enter sends only after IME selection ends; Shift+Enter keeps the newline', () => {
  assert.equal(shouldSendOnEnter('Enter', false, false, 13), true);
  assert.equal(shouldSendOnEnter('Enter', true, false, 13), false);
  assert.equal(shouldSendOnEnter('Enter', false, true, 13), false);
  assert.equal(shouldSendOnEnter('Enter', false, false, 229), false);
  assert.equal(shouldSendOnEnter('Process', false, true, 229), false);
});
