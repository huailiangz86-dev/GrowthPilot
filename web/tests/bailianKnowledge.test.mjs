import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudCitation,readCloudQuery,saveCloudQuery} from '../src/learning/cloudKnowledge.ts';
const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
test('cloud questions recover per account',()=>{
  saveCloudQuery(storage,'a','问题甲');saveCloudQuery(storage,'b','问题乙');assert.equal(readCloudQuery(storage,'a'),'问题甲');assert.equal(readCloudQuery(storage,'b'),'问题乙');assert.equal(readCloudQuery(storage,'c'),'');
});
test('storage failure is explicit without throwing',()=>{
  const broken={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};assert.equal(readCloudQuery(broken,'a'),'');assert.equal(saveCloudQuery(broken,'a','问题'),false);
});
test('restored questions respect provider bound',()=>{
  saveCloudQuery(storage,'limit','甲'.repeat(600));assert.equal(readCloudQuery(storage,'limit').length,500);
});
test('citations preserve exact text, remote IDs, read time and real page',()=>{
  const c={text:'  📚 原话\n<script>原文</script>',document_id:'doc',chunk_id:'chunk',document_name:'书本',title:'标题',hierarchy:'第一章',page:2};const result=cloudCitation(c,{workspace_id:'ws',index_id:'kb'},'2026-10-09');assert.ok(result.startsWith(c.text));for(const text of ['doc','chunk','ws','kb','第一章','页 2','2026-10-09','云端资料更新后请重新核对'])assert.ok(result.includes(text));
});
test('citations never invent local offsets or pages',()=>{
  const result=cloudCitation({text:'原话',document_id:'doc',chunk_id:'chunk',document_name:'',title:'',hierarchy:'',page:null},{workspace_id:'ws',index_id:'kb'},'now');assert.equal(result.includes('页 '),false);assert.equal(result.includes('字符'),false);
});
