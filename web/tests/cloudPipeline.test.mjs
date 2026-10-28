import test from 'node:test';
import assert from 'node:assert/strict';
import {readPipelineDraft,savePipelineDraft,pipelineCitation,emptyPipelineDraft} from '../src/sources/cloudPipeline.ts';
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
test('pipeline selections and stable submissions survive reload per account',()=>{
  const draft={...emptyPipelineDraft(),source_id:'source',version:2,request_id:'stable',query:'问题'};
  assert.equal(savePipelineDraft(storage,'owner-a',draft),true);assert.deepEqual(readPipelineDraft(storage,'owner-a'),draft);assert.deepEqual(readPipelineDraft(storage,'owner-b'),emptyPipelineDraft());
});
test('malformed selection never restores consent or arbitrary properties',()=>{
  storage.setItem('gp_source_pipeline:bad',JSON.stringify({consent:true,version:true,mode:'invalid',query:'问'.repeat(700),source_id:3}));
  const d=readPipelineDraft(storage,'bad');assert.equal(d.version,1);assert.equal(d.mode,'original');assert.equal(d.source_id,'');assert.equal(d.query.length,500);assert.equal('consent'in d,false);
});
test('storage failures are explicit and do not destroy an in-memory draft',()=>{
  const broken={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};assert.equal(savePipelineDraft(broken,'a',emptyPipelineDraft()),false);assert.deepEqual(readPipelineDraft(broken,'a'),emptyPipelineDraft());
});
const row={title:'原邮件',source_id:'source',source_version:2,mode:'extracted',source_checksum:'original-hash',payload_checksum:'text-hash',workspace_id:'space',index_id:'personal'};
test('citations keep exact cloud text and both local and uploaded fingerprints',()=>{
  const text='  原话😀\n保留空格';const c={text,document_id:'file',chunk_id:'chunk',local_matches:[{start:2,end:16,page:4}]};const citation=pipelineCitation(row,c,'time');assert.ok(citation.startsWith(text));for(const value of ['source','版本 2','original-hash','text-hash','file','chunk','页 4','字符 3–16','time'])assert.ok(citation.includes(value));
});
test('unmatched cloud text does not invent local locations or PDF pages',()=>{
  const citation=pipelineCitation(row,{text:'云端改变的正文',document_id:'file',chunk_id:'chunk',local_matches:[]},'time');assert.match(citation,/未在冻结正文中精确匹配/);assert.equal(citation.includes('字符 '),false);assert.equal(citation.includes('页 '),false);
});
