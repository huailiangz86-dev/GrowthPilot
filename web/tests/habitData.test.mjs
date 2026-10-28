import assert from 'node:assert/strict';
import test from 'node:test';
import { blankDraft, candidateFromText, commitWorkout, createReview, draftOf, freezeWorkout, habitDates,
  loadHabitDemo, movementTrend, rangeSummary, recordsInRange, reuseWorkout, reviewIsCurrent, seedHabitDemo } from '../src/prototype/habitData.ts';

test('未知分钟不补零，明确未执行即使带旧动作也不计训练', () => {
  const draft = { ...blankDraft(), title: '一次活动', minutes: '' };
  const record = freezeWorkout(draft, []);
  assert.equal(record.minutes, null);
  const skip = freezeWorkout({ ...draft, outcome: 'skipped', minutes: '35', exercises: [{ name: '深蹲', kg: '40', sets: '3', reps: '8' }] }, []);
  assert.equal(skip.minutes, null); assert.deepEqual(skip.exercises, []);
  assert.deepEqual(rangeSummary([record, skip]), { count: 1, skipped: 1, minutes: 0, knownMinutes: 0 });
});
test('实际日期、整数次数和未知动作字段必须核对，不能变成 NaN 或未来结果', () => {
  const draft = { ...blankDraft(), title: '训练', exercises: [{ name: '深蹲', kg: '', sets: '3', reps: '8' }] };
  assert.throws(() => freezeWorkout(draft, []), /重量/);
  assert.throws(() => freezeWorkout({ ...draft, exercises: [], date: '2026-02-30' }, []), /日期/);
  assert.throws(() => freezeWorkout({ ...draft, exercises: [], date: '2026-10-09' }, []), /日期/);
  assert.throws(() => freezeWorkout({ ...draft, exercises: [{ name: '深蹲', kg: '40', sets: '1.5', reps: '8' }] }, []), /组数/);
});
test('回执丢失后的同条重放无副本；同一安排只允许一条实际反馈', () => {
  const state = seedHabitDemo(true);
  const record = freezeWorkout({ ...blankDraft(), title: '活动', planId: 'adopted-plan' }, []);
  const once = commitWorkout(state, record), twice = commitWorkout(once, record);
  assert.equal(twice.records.length, 1); assert.equal(twice.records[0].id, record.id);
  const duplicate = freezeWorkout({ ...blankDraft(), title: '另一次', planId: 'adopted-plan' }, []);
  assert.throws(() => commitWorkout(twice, duplicate), /已有实际反馈/);
});
test('纠正保留原话与旧版本，并使基于旧事实的专家结果失效', () => {
  const state = seedHabitDemo(), range = { from: '2026-09-01', to: '2026-10-08' };
  const review = createReview(state.records, range);
  const source = state.records.find(r => r.outcome === 'completed');
  const updated = freezeWorkout({ ...draftOf(source), note: '纠正实际感受', minutes: '15' }, state.records);
  assert.equal(updated.original, source.original); assert.equal(updated.revisions[0].minutes, source.minutes);
  assert.equal(reviewIsCurrent(review, state.records), true);
  assert.equal(reviewIsCurrent(review, commitWorkout(state, updated).records), false);
  assert.throws(() => freezeWorkout(draftOf(source), commitWorkout(state, updated).records), /已有更新/);
});
test('复用只有结构，不继承上次分钟、感受、原话和已完成身份', () => {
  const source = seedHabitDemo().records[0], draft = reuseWorkout(source);
  assert.notEqual(draft.id, source.id); assert.equal(draft.baseVersion, 0);
  assert.equal(draft.minutes, ''); assert.equal(draft.note, ''); assert.equal(draft.original, '');
  assert.equal(draft.exercises[0].kg, String(source.exercises[0].kg));
});
test('有限候选只提取显式完整字段，不推断时长或不存在的动作', () => {
  const known = candidateFromText('2026-10-05 训练35分钟，深蹲40kg 3组8次');
  assert.equal(known.date, '2026-10-05'); assert.equal(known.minutes, '35'); assert.equal(known.exercises[0].kg, '40');
  const unknown = candidateFromText('今天训练了一会儿，深蹲三组');
  assert.equal(unknown.minutes, ''); assert.deepEqual(unknown.exercises, []); assert.equal(unknown.original, '今天训练了一会儿，深蹲三组');
});
test('同动作趋势按不同实际日期聚合并返回每条依据，未执行和其他动作不混入', () => {
  const source = seedHabitDemo().records[0];
  const records = [source, { ...source, id: 'second', exercises: [{ name: '深蹲', kg: 45, sets: 2, reps: 5 }] },
    { ...source, id: 'skip', outcome: 'skipped', exercises: [{ name: '深蹲', kg: 90, sets: 1, reps: 1 }] },
    { ...source, id: 'other', date: '2026-09-22', exercises: [{ name: '卧推', kg: 100, sets: 1, reps: 1 }] }];
  const points = movementTrend(records, '深蹲');
  assert.equal(points.length, 1); assert.equal(points[0].kg, 45); assert.deepEqual(points[0].recordIds, [source.id, 'second']);
});
test('范围继承原样冻结；未来、安排与空样本不生成专家结论', () => {
  const state = seedHabitDemo(true), range = { from: '2026-10-01', to: '2026-10-08' };
  assert.throws(() => createReview(state.records, range), /没有已完成/);
  assert.deepEqual(habitDates({ enabled: true, days: [1, 4], time: '18:30' }, { from: '2026-10-05', to: '2026-10-11' }), ['2026-10-05', '2026-10-08']);
  const populated = seedHabitDemo();
  assert.deepEqual(recordsInRange(populated.records, range).map(r => r.date), ['2026-10-05', '2026-10-01']);
  const review = createReview(populated.records, range); populated.records[4].note = '后来改变';
  assert.notEqual(review.records.find(r => r.date === '2026-10-05').note, '后来改变');
});
test('冻结提交、草稿和原话刷新恢复；损坏数据明确报错，不混入示例', () => {
  const state = seedHabitDemo(true); state.draft = { ...blankDraft(), title: '待保存的训练' };
  state.pending = freezeWorkout(state.draft, []); state.raw = '我的原话';
  const loaded = loadHabitDemo({ getItem: () => JSON.stringify(state) });
  assert.equal(loaded.state.pending.id, state.pending.id); assert.equal(loaded.state.raw, '我的原话'); assert.equal(loaded.error, '');
  const broken = loadHabitDemo({ getItem: () => '{' });
  assert.ok(broken.error); assert.equal(broken.state.records.length, 0);
});
