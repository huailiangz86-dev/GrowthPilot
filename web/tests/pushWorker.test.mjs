import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';

test('push retries are deduplicated across worker restarts and click ignores foreign URLs',async()=>{
  const persisted=new Map(),shown=[],opened=[];
  function runtime(){
    const events={};
    const indexedDB={open(){const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={objectStore(){return {get(id){const r={};queueMicrotask(()=>{r.result=persisted.get(id);r.onsuccess();});return r;},put(v,id){persisted.set(id,v);},delete(id){persisted.delete(id);},openCursor(){const r={};queueMicrotask(()=>{r.result=null;r.onsuccess();});return r;}};}};setTimeout(()=>tx.oncomplete(),0);return tx;}};req.onsuccess();});return req;}};
    const context={indexedDB,URL,Date,Promise,self:{location:{origin:'https://growthpilot.example'},registration:{showNotification:async(title,options)=>shown.push({title,...options})},addEventListener:(name,fn)=>events[name]=fn},clients:{openWindow:async url=>opened.push(url)}};
    vm.runInNewContext(fs.readFileSync(new URL('../public/reminder-sw.js',import.meta.url),'utf8'),context);
    return events;
  }
  const id='11111111-1111-4111-8111-111111111111';
  async function deliver(events,data){let done;events.push({data:{json:()=>data},waitUntil:p=>done=p});await done;}
  await deliver(runtime(),{id,body:'到期提醒',url:'https://evil.example/'});
  await deliver(runtime(),{id,body:'重复消息'});
  assert.equal(shown.length,1);
  assert.equal(shown[0].tag,`growthpilot:${id}`);
  assert.equal(shown[0].renotify,false);
  let done;runtime().notificationclick({notification:{close(){},data:{url:'https://evil.example'}},waitUntil:p=>done=p});await done;
  assert.deepEqual(opened,['https://growthpilot.example/app/execution']);
});
