import {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {api} from '../api/client';
import {captureOwnerId} from '../workspace/captureSync';
import {useWorkspace} from '../workspace/useWorkspace';
import {mutationKey} from '../mutations/journal';
import ProjectForm from './ProjectForm';
import {PROJECT_STATUS, type ProjectRecord} from './types';
import './projects.css';

export function ProjectsPanel() {
  const {activeWorkspace, retryHydration} = useWorkspace();
  const [projects, setProjects] = useState<ProjectRecord[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [creating, setCreating] = useState(false), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  const owner = captureOwnerId(localStorage.getItem('gp_token')) ?? 'anonymous';
  const journalKey = mutationKey(owner, activeWorkspace.id, 'project-new');
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void api.get<ProjectRecord[]>(`/workspaces/${activeWorkspace.id}/projects`).then(rows => {if (active) setProjects(rows);})
      .catch(() => {if (active) setError('项目暂时无法读取，已有草稿仍保留。');}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [activeWorkspace.id, revision]);
  return <section className="workspace-panel"><div className="panel-header"><div><span className="section-kicker">PROJECTS</span><h3>项目与进行中内容</h3></div><button className="small-action" onClick={() => {setCreating(true); setNotice('');}}>＋ 新建或继续项目草稿</button></div>
    {creating && <ProjectForm journalKey={journalKey} workspaceId={activeWorkspace.id} onClose={() => setCreating(false)} onSubmit={pending => api.post<ProjectRecord>('/projects', {...pending.payload, request_id: pending.request_id})} onSaved={project => {setProjects(rows => [project, ...rows.filter(row => row.id !== project.id)]); setCreating(false); setNotice('项目已保存到服务器。'); retryHydration();}}/>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">正在读取项目…</p>}
    {error && <p role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>重新读取项目</button></p>}
    <div className="gp-project-list">{projects.map(project => <article key={project.id} className="gp-project-list-item"><div><h3><Link to={`/app/projects/${project.id}`}>{project.name}</Link></h3><p>{project.description}</p><small>{PROJECT_STATUS[project.status]} · 下一步：{project.next_action || '待补充'}</small></div><Link className="outline-action" to={`/app/projects/${project.id}`}>查看项目 →</Link></article>)}</div>
    {!loading && !error && !projects.length && <p className="inline-empty">还没有项目。创建一个，写清想完成的结果与下一步。</p>}
  </section>;
}

export function ProjectDetail() {
  const {projectId = ''} = useParams(), {activeWorkspace} = useWorkspace();
  return <ProjectDetailContent key={`${activeWorkspace.id}:${projectId}`} id={projectId}/>;
}
function ProjectDetailContent({id}: {id: string}) {
  const {activeWorkspace, activeTasks, activeLearning, activeKnowledgeCards, retryHydration} = useWorkspace();
  const [project, setProject] = useState<ProjectRecord | null>(null), [editing, setEditing] = useState(false), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [notice, setNotice] = useState('');
  const owner = captureOwnerId(localStorage.getItem('gp_token')) ?? 'anonymous';
  const read = () => api.get<ProjectRecord>(`/projects/${id}`, {workspace_id: activeWorkspace.id});
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void api.get<ProjectRecord>(`/projects/${id}`, {workspace_id: activeWorkspace.id}).then(value => {if (active) setProject(value);})
      .catch(() => {if (active) setError('当前空间的项目暂时无法读取。输入草稿仍保留，可重新读取。');})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [id, activeWorkspace.id, revision]);
  const tasks = activeTasks.filter(task => task.projectId === id), learning = activeLearning.filter(item => item.projectId === id), cards = activeKnowledgeCards.filter(card => card.projectId === id);
  return <div className="page-stack gp-project-detail"><Link to="/app/workspace">← 所有项目</Link>
    {loading && !project && <p role="status">正在读取项目…</p>}{error && <p role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>重新读取</button></p>}
    {project && <><header className="page-intro"><div><span className="section-kicker">PROJECT</span><h2>{project.name}</h2><p>{project.description}</p></div><button className="outline-action" onClick={() => {setEditing(true); setNotice('');}}>编辑或继续项目草稿</button></header>
      <section className="workspace-panel"><div className="gp-project-meta"><strong>{PROJECT_STATUS[project.status]}</strong><span>项目进度 {project.progress}%</span></div><h3>下一步</h3><p>{project.next_action || '还没有确认下一步。'}</p><small>最近保存 {new Date(project.updated_at).toLocaleString('zh-CN')}</small></section>
      {notice && <p role="status">{notice}</p>}
      {editing && <ProjectForm journalKey={mutationKey(owner, activeWorkspace.id, `project-${id}`)} workspaceId={activeWorkspace.id} project={project} readLatest={read} onClose={() => setEditing(false)} onSubmit={pending => api.patch<ProjectRecord>(`/projects/${id}`, {...pending.payload, request_id: pending.request_id})} onSaved={value => {setProject(value); setEditing(false); setNotice('项目修改已保存到服务器。'); retryHydration();}}/>}
      <section className="workspace-panel gp-project-related"><h3>关联工作 · {tasks.length}</h3>{tasks.map(task => <article key={task.id}><Link to={`/app/tasks/${task.id}`}>{task.title}</Link><p>{task.description}</p></article>)}{!tasks.length && <p>这个项目还没有关联工作。</p>}</section>
      <section className="workspace-panel gp-project-related"><h3>关联学习 · {learning.length}</h3>{learning.map(item => <article key={item.id}><Link to={`/app/learn/${item.id}`}>{item.title}</Link><p>{item.summary}</p></article>)}{!learning.length && <p>这个项目还没有关联学习。</p>}</section>
      <section className="workspace-panel gp-project-related"><h3>关联知识卡 · {cards.length}</h3>{cards.map(card => <article key={card.id}><h4>{card.title}</h4><p>{card.content || card.aiSummary || '可在知识卡管理中核对完整来源。'}</p></article>)}{!cards.length && <p>这个项目还没有关联知识卡。</p>}<Link to="/app/knowledge/cards">前往知识卡管理 →</Link></section>
    </>}
  </div>;
}
