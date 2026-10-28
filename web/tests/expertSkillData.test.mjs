import assert from 'node:assert/strict';
import test from 'node:test';
import {exerciseWithRubric} from '../src/help/expertSkillData.ts';

test('adopting a generated exercise keeps its exact check criteria for later feedback without revealing hidden hints', () => {
  const result = {text:'合上原文，用自己的话描述步骤。', quotes:['先回忆'], teaching:{method:'retrieval_practice',questions:['描述步骤'],hints:['方向','步骤','位置'],
    criteria:[{id:'C1',criterion:'说明先回忆再核对'},{id:'C2',criterion:'给一个应用例子'}]}};
  const exercise=exerciseWithRubric(result,3);
  assert.equal(exercise,'【当前练习】\nAI 提供的练习 · 本人采用 · 依据笔记版本 3\n合上原文，用自己的话描述步骤。\n检查项 C1：说明先回忆再核对\n检查项 C2：给一个应用例子\n【练习结束】');
  assert(!exercise.includes('位置'));
  assert.deepEqual(result.teaching.hints,['方向','步骤','位置']);
});

test('old generated exercises can still be adopted without fabricated teaching checks', () => {
  assert.equal(exerciseWithRubric({text:'旧练习',quotes:['原文']},1),'AI 提供的练习 · 本人采用 · 依据笔记版本 1\n旧练习');
});
