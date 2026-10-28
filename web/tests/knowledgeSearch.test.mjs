import test from 'node:test';
import assert from 'node:assert/strict';
import {citationText,highlightParts,submitSearch,synchronizeSearch} from '../src/learning/knowledgeSearch.ts';

test('own delayed query navigation keeps typing and back navigation restores the prior query',()=>{
  let draft=submitSearch({search:'old',text:'first',pending:[]});draft={...draft,text:'second'};
  draft=synchronizeSearch(draft,'first');assert.equal(draft.text,'second');
  draft=submitSearch(draft);draft=synchronizeSearch(draft,'second');assert.equal(draft.text,'second');
  draft=synchronizeSearch(draft,'first');assert.equal(draft.text,'first');assert.deepEqual(draft.pending,[]);
});
test('two rapid submitted searches keep the latest input even when the first URL arrives later',()=>{
  let draft=submitSearch({search:'old',text:'first',pending:[]});draft=submitSearch({...draft,text:'second'});
  draft=synchronizeSearch(draft,'first');assert.equal(draft.text,'second');assert.deepEqual(draft.pending,['second']);
  draft=synchronizeSearch(draft,'second');assert.equal(draft.text,'second');assert.deepEqual(draft.pending,[]);
});

test('highlights preserve emoji and Unicode character offsets in excerpt windows',()=>{
  const parts=highlightParts('📚 Straße 和 API',[{start:2,end:8,quote:'Straße',term:'STRASSE'},{start:11,end:14,quote:'API',term:'api'}]);
  assert.equal(parts.map(p=>p.text).join(''),'📚 Straße 和 API');assert.deepEqual(parts.filter(p=>p.marked).map(p=>p.text),['Straße','API']);
  assert.deepEqual(highlightParts('核对原文',[{start:103,end:105,quote:'核对',term:'核对'}],103).filter(p=>p.marked).map(p=>p.text),['核对']);
});
test('overlapping highlights merge without duplication or HTML interpretation',()=>{
  const text='<script>回忆核对</script>',parts=highlightParts(text,[{start:8,end:12},{start:10,end:12},{start:100,end:110}]);
  assert.equal(parts.map(p=>p.text).join(''),text);assert.equal(parts.filter(p=>p.marked).length,1);assert.equal(highlightParts(text,[])[0].text,text);
});
test('copied citations preserve exact excerpt with document revision and coordinates',()=>{
  const entry={key:'doc:learning:notes',title:'我的笔记',kind:'notes',source:{version:7},updated_at:'2026-10-09'};
  const citation=citationText(entry,{start:2,end:7,text:'📚原话引用',hits:[]});
  assert.match(citation,/📚原话引用/);assert.match(citation,/版本 7/);assert.match(citation,/原文字符 3–7/);assert.match(citation,/doc:learning:notes/);
});
test('materials retain full checksum and mutable cards identify the read version',()=>{
  const base={key:'material:id',title:'原资料',kind:'material',updated_at:'2026-10-09T01:00:00Z'},excerpt={start:0,end:2,text:'原话',hits:[]};
  assert.match(citationText({...base,source:{checksum:'a'.repeat(64)}},excerpt),new RegExp('SHA256 '+'a'.repeat(64)));
  assert.match(citationText({...base,source:{},kind:'card'},excerpt),/读取版本 2026-10-09T01:00:00Z/);
});
