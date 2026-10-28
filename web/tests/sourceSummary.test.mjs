import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySummaryDraft,freezeSummary,readSummaryDraft,summaryEvidence,summaryMarkdown} from '../src/sources/sourceSummary.ts';
const selection={source_id:'source',version:2,checksum:'hash',chunk_id:'c1'};
const draft={...emptySummaryDraft(),question:'如何复用',selections:[selection]};
test('freezing a summary requires consent and freezes a separate source selection',()=>{
  assert.throws(()=>freezeSummary(draft,'id',false),/允许/);
  const request=freezeSummary(draft,'id',true);request.selections[0].version=3;assert.equal(draft.selections[0].version,2);
  assert.throws(()=>freezeSummary({...draft,selections:[selection,selection]},'id',true),/一次/);
  assert.throws(()=>freezeSummary(emptySummaryDraft(),'id',true),/1–10/);
});
test('reload restores the exact generation and save payload without restoring the UI consent checkbox',()=>{
  const pending=freezeSummary(draft,'stable-id',true),d={...draft,pending,save_pending:{title:'标题',notes:'本人补充'}};
  assert.deepEqual(readSummaryDraft(JSON.stringify(d)),d);assert.equal('consent' in readSummaryDraft(JSON.stringify({...d,consent:true})),false);
  assert.deepEqual(readSummaryDraft(null),emptySummaryDraft());
});
test('malformed journal is reported instead of silently destroying earlier input',()=>{
  for(const value of ['{',JSON.stringify({...draft,selections:[{...selection,version:true}]}),JSON.stringify({...draft,notes:null})])assert.throws(()=>readSummaryDraft(value));
  const pending=freezeSummary(draft,'id',true);
  assert.throws(()=>readSummaryDraft(JSON.stringify({...draft,pending:{...pending,question:'已改变的范围'}})));
  assert.throws(()=>readSummaryDraft(JSON.stringify({...draft,pending:{...pending,selections:Array(11).fill(selection)}})));
});
const version={source_id:'source',version:2,title:'原文',category:'book',source_url:'https://example.com/book',checksum:'hash',kind:'pdf',status:'ready',extraction:{text:'😀原话\n下一行',chunks:[{id:'c1',text:'原话',start:1,end:3,page:4}]}};
test('evidence uses Unicode character positions and rejects pointers and failed extraction',()=>{
  const s=summaryEvidence(version,'c1',0);assert.equal(s.page,4);assert.equal(s.start,1);assert.equal(s.key,'S1');
  for(const v of [{...version,kind:'link'},{...version,status:'failed'},{...version,extraction:{...version.extraction,text:'改变'}}])assert.throws(()=>summaryEvidence(v,'c1',0));
});
const run={request_id:'run',source:[summaryEvidence(version,'c1',0)],saved:{title:'整理',notes:'我的看法'},saved_at:'time',prompt_version:'v1',result:{points:[{text:'原文的要点',kind:'inference',evidence:[{key:'S1',quote:'原话',start:1,end:3}]}],limitations:'上下文有限'}};
test('reuse retains exact quotes, original version, PDF page, checksum and personal authorship',()=>{
  const text=summaryMarkdown(run);for(const part of ['待验证的解释','原话','版本 2','第 4 页','字符 2–3','SHA256 hash','https://example.com/book','本人填写','我的看法'])assert.ok(text.includes(part),part);
});
test('unsaved and mismatched results cannot be exported as adopted summaries',()=>{
  assert.throws(()=>summaryMarkdown({...run,saved:null}),/先确认保存/);
  assert.throws(()=>summaryMarkdown({...run,result:{...run.result,points:[{...run.result.points[0],evidence:[{key:'S1',quote:'改写',start:1,end:3}]}]}}),/引用无法核对/);
});
