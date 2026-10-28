import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {api} from '../api/client';
import {useWorkspace} from '../workspace/useWorkspace';
import {citationText,highlightParts,submitSearch,synchronizeSearch,KNOWLEDGE_LABELS as LABELS} from './knowledgeSearch';
import type {SearchDraft} from './knowledgeSearch';
import type {Excerpt,Hit,KnowledgeEntryData as Entry} from './knowledgeSearch';
import '../prototype/PersonalPlatformPrototype.css';
import '../personal/personal.css';
import './learning.css';

interface Library {items:Entry[];total:number;counts:Record<string,number>;page:number;page_size:number;terms:string[]}
interface Original {text:string;title:string;version?:number}
export default function PersonalKnowledge({embedded=false}:{embedded?:boolean}){
  const {activeWorkspace,hydrationStatus,retryHydration}=useWorkspace();
  if(embedded&&!/^[\da-f-]{36}$/i.test(activeWorkspace.id))return <section className="knowledge-empty"><h3>学习记录会汇集在这里</h3><p>{hydrationStatus==='loading'?'正在读取已保存的学习空间…':hydrationStatus==='error'?'学习空间暂时无法读取。个人资料与总结仍可继续使用。':'保存一份个人资料，就可以开始整理有出处的总结。学习空间建立后，你的学习内容、笔记和心得也会汇集到这里。'}</p><div><Link className="primary-action" to="/app/knowledge/sources">保存个人资料 →</Link>{hydrationStatus==='error'?<button className="outline-action" onClick={retryHydration}>重新读取学习空间</button>:hydrationStatus!=='loading'&&<Link className="outline-action" to="/app/onboarding">建立学习空间 →</Link>}</div></section>;
  return <LibraryView key={activeWorkspace.id} wid={activeWorkspace.id} embedded={embedded}/>;
}

function LibraryView({wid,embedded}:{wid:string;embedded:boolean}){
  const [params,setParams]=useSearchParams(),search=(params.get('q')||'').slice(0,120);
  const kind=params.get('kind')||'all',mode=params.get('mode')==='literal'?'literal':'keywords',order=params.get('order')==='newest'?'newest':'relevance';
  const requestedPage=Number(params.get('page')||'1'),page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
  const [draft,setDraft]=useState<SearchDraft>({search,text:search,pending:[]}),[library,setLibrary]=useState<Library|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
  // Synchronize before the next input event; a deferred effect can overwrite
  // typing that began while the preceding search navigation was rendering.
  const synchronized=synchronizeSearch(draft,search);
  if(synchronized!==draft)setDraft(synchronized);
  const query=synchronized.text;
  useEffect(()=>{let disposed=false;setLoading(true);setLibrary(null);setError('');void api.get<Library>(`/learning-knowledge/${wid}`,{q:search,kind,page,mode,order}).then(data=>{if(!disposed)setLibrary(data);}).catch(e=>{if(!disposed)setError(e.message);}).finally(()=>{if(!disposed)setLoading(false);});return()=>{disposed=true;};},[wid,search,kind,page,mode,order,retry]);
  function change(values:Record<string,string>){const next=new URLSearchParams(params);for(const [key,value] of Object.entries(values)){if(value)next.set(key,value);else next.delete(key);}setParams(next);}
  return <section className={`pp-platform gp-personal${embedded?' knowledge-records':''}`}><header className="lw-intro" hidden={embedded}><div><span>MY KNOWLEDGE</span><h1>我的知识库</h1><p>查找当前空间已保存的内容、笔记、心得与原资料，带着原文和出处继续使用。</p></div><div className="lw-actions"><Link className="pp-primary" to="/app/learning">继续学习与记录 →</Link><Link className="pp-secondary" to="/app/knowledge/sources">个人资料库：笔记、邮件、书本与链接 →</Link><Link className="pp-secondary" to="/app/knowledge/summaries">有出处的总结与已保存成果 →</Link><Link className="pp-secondary" to="/app/knowledge/bailian">百炼切片与检索测试 →</Link><Link className="pp-secondary" to="/app/knowledge/cards">知识卡与捕获入口 →</Link></div></header>
    <section className="lw-sheet"><form className="lw-search" onSubmit={e=>{e.preventDefault();const next=submitSearch(synchronized);setDraft(next);change({q:next.text,page:'1'});}}>
      <input aria-label="搜索我的知识库" value={query} maxLength={120} onChange={e=>{const text=e.target.value;setDraft(current=>({...current,text}));}} placeholder="例如：主动回忆 核对"/>
      <select aria-label="知识库检索方式" value={mode} onChange={e=>change({mode:e.target.value,page:'1'})}><option value="keywords">多个关键词</option><option value="literal">整段原话</option></select>
      <select aria-label="知识库类型" value={kind} onChange={e=>change({kind:e.target.value,page:'1'})}>{Object.entries(LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="知识库排序" value={order} onChange={e=>change({order:e.target.value,page:'1'})}><option value="relevance">相关度优先</option><option value="newest">最近保存优先</option></select>
      <button className="pp-primary">搜索</button><button type="button" className="pp-text-button" onClick={()=>setRetry(v=>v+1)}>刷新知识库</button>
    </form><p className="pp-caption">{mode==='keywords'?'用空格分开最多 12 个关键词，命中任一词即可找到记录。相关度先比较命中词的数量，再比较标题与原文命中；空查询按保存时间显示。':'整段原话按连续文字匹配，不区分英文大小写。'} 每条最多展示 3 处原文片段，可展开核对完整版本。</p>
    {loading?<p role="status">正在查找知识记录…</p>:error?<p className="pp-error" role="alert">{error}<button onClick={()=>setRetry(v=>v+1)}>重试读取</button></p>:<>
      <div className="lw-counts"><span><strong>{library?.total??0}</strong> 条{search?'匹配记录':'知识记录'}</span>{Object.entries(library?.counts??{}).map(([key,count])=><span key={key}>{LABELS[key]} {count}</span>)}</div>
      {library?.terms.length!==0&&library?.terms&&<p className="lw-query">本次查找：{library.terms.join(' · ')}</p>}
      {library?.items.map(entry=><KnowledgeEntry key={`${entry.key}:${entry.source.version??entry.updated_at}:${search}:${retry}`} wid={wid} entry={entry}/>)}
      {library?.total===0&&<p>{search?'没有找到匹配文字；试试较短的词，或更换类型。':'还没有已保存内容。进入学习页留下第一份内容、笔记或心得，它就会出现在这里。'}</p>}
      {library&&library.total>library.page_size&&<div className="lw-actions"><button disabled={page<=1} onClick={()=>change({page:String(page-1)})}>上一页</button><span>第 {page} 页 / 共 {Math.ceil(library.total/library.page_size)} 页</span><button disabled={page*library.page_size>=library.total} onClick={()=>change({page:String(page+1)})}>下一页</button></div>}
      {library&&library.total>0&&library.items.length===0&&<p>这一页已没有记录。<button onClick={()=>change({page:'1'})}>回到第一页</button></p>}
    </>}<details><summary>资料与检索范围</summary><p>仅查找本人当前空间已保存的记录，按实际文字匹配，未使用向量或同义词推断。可在学习页读取公开 HTTPS 网页，或导入 TXT、Markdown 和文字型 PDF。外部笔记服务的账号连接与持续同步后续按所需服务接入。</p></details></section></section>;
}

function Highlight({text,hits,offset=0}:{text:string;hits:Hit[];offset?:number}){return <>{highlightParts(text,hits,offset).map((part,index)=>part.marked?<mark key={index}>{part.text}</mark>:<span key={index}>{part.text}</span>)}</>;}
function KnowledgeEntry({wid,entry}:{wid:string;entry:Entry}){
  const [full,setFull]=useState<Original|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[citation,setCitation]=useState(''),[copyStatus,setCopyStatus]=useState('');
  const detail=useRef<HTMLDetailsElement>(null),original=useRef<HTMLDivElement>(null),flight=useRef(false),active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const read=async():Promise<Original>=>{const data=await api.get<Original>(`/learning-knowledge/${wid}/entry`,{key:entry.key,version:entry.source.version,expected_updated_at:entry.source.kind==='card'?entry.updated_at:undefined});if(!active.current)throw Error('检索页面已切换，请在当前空间重新选择来源。');setFull(data);setError('');return data;};
  const verify=async(excerpt?:Excerpt)=>{if(flight.current)return;flight.current=true;setBusy(true);setError('');setCitation('');setCopyStatus('');try{const data=await read();if(excerpt){if(Array.from(data.text).slice(excerpt.start,excerpt.end).join('')!==excerpt.text)throw Error('来源已变化，请刷新检索后重新核对。');const text=citationText(entry,excerpt);setCitation(text);try{await navigator.clipboard.writeText(text);setCopyStatus('引用与出处已复制。');}catch{setCopyStatus('暂时无法自动复制，可选择下面的引用文字复制。');}}else{if(detail.current)detail.current.open=true;requestAnimationFrame(()=>original.current?.querySelector('mark')?.scrollIntoView({block:'center'}));}}catch(e){setFull(null);setError((e as Error).message);}finally{flight.current=false;setBusy(false);}};
  return <article className="lw-library-row"><span>{LABELS[entry.kind]} · {entry.characters} 字 · {entry.source.version?`版本 ${entry.source.version}`:'保留原始来源'} · {new Date(entry.updated_at).toLocaleDateString()}</span>
    <h3><Highlight text={entry.title} hits={entry.title_hits??[]}/></h3>
    {!!entry.matched_terms?.length&&<p className="lw-match-label">命中 {entry.matched_terms.length} 个词：{entry.matched_terms.join('、')}{entry.title_hits?.length?' · 标题有匹配':''}</p>}
    {entry.excerpts?.length?entry.excerpts.map((excerpt,index)=><div className="lw-match" key={`${excerpt.start}:${excerpt.end}`}><p><Highlight text={excerpt.text} hits={excerpt.hits} offset={excerpt.start}/></p><div className="lw-actions"><small>原文字符 {excerpt.start+1}–{excerpt.end}</small><button className="pp-text-button" disabled={busy} onClick={()=>void verify(excerpt)}>复制引用与出处{entry.excerpts!.length>1?` ${index+1}`:''}</button></div></div>):<p>{entry.preview}</p>}
    <div className="lw-actions"><button className="pp-secondary" disabled={busy} onClick={()=>void verify()}>{busy?'正在核对来源…':'定位并核对原文'}</button>{entry.item_id?<Link className="pp-secondary" to={`/app/learn/${entry.item_id}${entry.kind==='material'?'#learning-materials':'#learning-records'}`}>回到学习来源 →</Link>:<Link to="/app/knowledge/cards">打开知识卡 →</Link>}</div>
    {error&&<p role="alert" className="pp-error">{error}<button disabled={busy} onClick={()=>void verify()}>重试核对来源</button></p>}
    {citation&&<div className="lw-citation"><p role="status">{copyStatus}</p><label>引用文字与出处<textarea aria-label={`引用文字与出处 ${entry.title}`} value={citation} readOnly onFocus={e=>e.target.select()}/></label></div>}
    <details ref={detail} onToggle={e=>{if(e.currentTarget.open&&!full&&!busy)void read().catch(e=>setError(e.message));}}><summary>展开原记录{entry.source.version?` · 版本 ${entry.source.version}`:''}</summary>{full?<div className="lw-preview" ref={original}><Highlight text={full.text} hits={entry.excerpts?.flatMap(e=>e.hits)??[]}/></div>:<p role={error?'alert':'status'}>{error||'正在读取来源…'}</p>}</details>
  </article>;
}
