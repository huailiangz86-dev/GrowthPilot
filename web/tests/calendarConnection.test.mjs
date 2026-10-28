import assert from 'node:assert/strict';
import test from 'node:test';
import {calendarSubscriptionUrl} from '../src/execution/calendarConnection.ts';

test('calendar subscriptions use the server-provided deployment URL without a browser-origin fallback', () => {
  const url = 'https://calendar.example.test/api/v1/execution/calendar.ics?token=synthetic';
  assert.equal(calendarSubscriptionUrl(url), url);
  for (const value of [undefined, '/api/v1/execution/calendar.ics?token=synthetic', 'http://calendar.example.test/api/v1/execution/calendar.ics?token=synthetic']) {
    assert.throws(() => calendarSubscriptionUrl(value), /部署域名/);
  }
});

test('calendar subscriptions reject local addresses and unexpected credential URLs', () => {
  for (const origin of ['https://localhost', 'https://127.1', 'https://[::1]', 'https://0.0.0.0', 'https://user:password@calendar.example.test']) {
    assert.throws(() => calendarSubscriptionUrl(`${origin}/api/v1/execution/calendar.ics?token=synthetic`));
  }
  assert.throws(() => calendarSubscriptionUrl('https://calendar.example.test/login?token=synthetic'));
  assert.throws(() => calendarSubscriptionUrl('https://calendar.example.test/api/v1/execution/calendar.ics'));
});
