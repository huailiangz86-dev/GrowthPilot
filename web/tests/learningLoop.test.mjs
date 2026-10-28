import test from 'node:test';
import assert from 'node:assert/strict';
import {freshLoop, readLoop, startAttempt, saveAnswer, finishAttempt, SOURCES} from '../src/prototype/learningLoopState.ts';
const start = () => startAttempt({...freshLoop('2026-10-20'), sourceSelected:true, goal:'完成一次实际应用'}, 'attempt-1');
test('a source update cannot rewrite the evidence frozen with the actual answer', () => {
  const first = start(); const next = {...first, sourceVersion:2};
  assert.equal(next.current.source.text, SOURCES[1].text);
  assert.notEqual(next.current.source.text, SOURCES[2].text);
});
test('blank answer is explicit insufficient evidence, never a fabricated response', () => {
  assert.throws(() => saveAnswer(start()));
  const state = start(); state.current.noRecall=true; state.current.answer='未提交的输入';
  const saved = saveAnswer(state); assert.equal(saved.current.answer, ''); assert.equal(saved.current.answerSaved,true);
});
test('completion requires an actual result and personal check; planned work is insufficient', () => {
  const s=start(); s.current.answer='我的回答'; const saved=saveAnswer(s);
  assert.throws(() => finishAttempt(saved)); saved.current.selfCheck='missing'; saved.current.result='准备下次做';
  assert.throws(() => finishAttempt(saved));
});
test('a second day creates a distinct attempt and question without replacing the first', () => {
  const s=start(); Object.assign(s.current,{answer:'第一次回答',answerSaved:true,selfCheck:'included',result:'实际建议',checked:true});
  const first=finishAttempt(s); assert.equal(first.attempts[0].nextDate,'2026-10-22');
  const second=startAttempt({...first,clock:'2026-10-22'},'attempt-2');
  assert.notEqual(second.current.question,first.attempts[0].question);
  assert.equal(second.attempts[0].answer,'第一次回答');
  assert.deepEqual(readLoop(JSON.stringify(second),'2026-10-24'),second);
});
test('invalid or corrupt stored content is refused so original bytes can be retained', () => {
  for(const raw of ['{bad','null',JSON.stringify({...freshLoop('2026-10-20'),stage:'recall'}),JSON.stringify({...freshLoop('2026-10-20'),clock:'2026-02-31'})]) assert.throws(() => readLoop(raw,'2026-10-20'));
});
test('manual past dates are rejected and explicit unscheduled review is preserved', () => {
  const s=start(); Object.assign(s.current,{answer:'本人答案',answerSaved:true,selfCheck:'included',result:'实际建议',checked:true,schedule:'manual',nextDate:'2026-10-19'});
  assert.throws(()=>finishAttempt(s));s.current.schedule='none';assert.equal(finishAttempt(s).attempts[0].nextDate,'');
});
