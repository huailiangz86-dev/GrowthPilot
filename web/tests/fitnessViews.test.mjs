import assert from 'node:assert/strict';
import test from 'node:test';
import {monthRange, shiftMonth, trendCoordinates} from '../src/life/viewData.ts';
import {recordForm, recordContent, acknowledgeLife, emptyJournal, freezeLifeCommand} from '../src/life/store.ts';
test('D2 month boundaries handle leap years and year rollover', () => {
  assert.deepEqual(monthRange('2024-02'),{start:'2024-02-01',end:'2024-02-29'});
  assert.equal(monthRange('2026-02').end,'2026-02-28');
  assert.equal(shiftMonth('2026-12',1),'2027-01');
  for(const month of ['2026-13','2026-00','','invalid']) assert.throws(()=>monthRange(month));
});
test('D2 chart uses elapsed dates, retains original sources, and keeps zero explicit', () => {
  const points=[{date:'2026-10-01',weight:0,sources:[{id:'a',version:1}]},{date:'2026-10-02',weight:10,sources:[{id:'b',version:2}]},{date:'2026-10-11',weight:20,sources:[{id:'c',version:1}]}];
  assert.deepEqual(trendCoordinates(points.slice(0,1)),[]);
  const plotted=trendCoordinates(points);assert.equal(plotted[0].y,170);assert.equal(plotted[1].x,92);assert.equal(plotted[2].x,560);
  assert.deepEqual(plotted[1].sources,points[1].sources);
});
test('D2 AI candidates require explicit outcome correction and retain help provenance', () => {
  const form={...recordForm(),title:'候选',source:'ai',original:'今天活动原话',help_request_id:'help',aiOutcomeUnknown:true};
  assert.throws(()=>recordContent(form));
  const confirmed=recordContent({...form,aiOutcomeUnknown:false});assert.equal(confirmed.help_request_id,'help');assert.equal(confirmed.original,form.original);
});
test('D2 correcting a chart source outside the loaded page does not increase total', () => {
  const form={...recordForm(),title:'原记录'}, draft={id:'old',kind:'record',baseVersion:1,data:form},q=freezeLifeCommand(draft,'request');
  const snapshot={records:[],total:60,habit:{id:'habit',version:0,content:null},access:{id:'user',version:0,fitness_expert_enabled:false},references:[]};
  const next=acknowledgeLife({...emptyJournal(),snapshot,drafts:{old:draft},queue:[q]},q,{kind:'record',entity:{id:'old',version:2,content:recordContent(form)}});
  assert.equal(next.snapshot.total,60);
});
