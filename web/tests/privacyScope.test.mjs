import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRIVACY_SCOPE, normalizePrivacySources } from '../src/workspace/workspaceData.ts';

test('privacy scope defaults to every supported source', () => {
  assert.deepEqual(normalizePrivacySources(undefined), DEFAULT_PRIVACY_SCOPE.enabledSources);
});

test('privacy scope keeps supported sources once and drops unknown values', () => {
  assert.deepEqual(
    normalizePrivacySources(['tasks', 'tasks', 'future_source', 'memories']),
    ['tasks', 'memories'],
  );
});
