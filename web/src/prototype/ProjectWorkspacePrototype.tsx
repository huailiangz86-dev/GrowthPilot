import {useState} from 'react';
import {Link} from 'react-router-dom';
import {ApiError} from '../api/client';
import {mutationKey, type FrozenMutation} from '../mutations/journal';
import ProjectForm from '../projects/ProjectForm';
import {PROJECT_STATUS, type ProjectMutation, type ProjectRecord} from '../projects/types';
import '../pages/app/workspace.css';
import '../projects/projects.css';

const STORE = 'gp_project_workspace_prototype_v1';
const WORKSPACE = 'project-prototype';
interface MockState {projects: ProjectRecord[]; receipts: Record<string, {fingerprint: string; project: ProjectRecord}>}
function read(): MockState {
  const raw = localStorage.getItem(STORE);
  if (raw) return JSON.parse(raw);
  return {projects: [{id: '11111111-1111-4111-8111-111111111111', workspace_id: WORKSPACE, name: '验证资料整理方案', description: '独立示例：整理资料，完成一次实际应用。', status: 'active', priority: 'medium', progress: 0, next_action: '选一份资料并核对关键段落', due_at: null, updated_at: '2026-10-26T00:00:00Z', archived_at: null}], receipts: {}};
}
export default function ProjectWorkspacePrototype() {
  const [projects, setProjects] = useState(() => read().projects), [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null), [scenario, setScenario] = useState('success'), [notice, setNotice] = useState('');
  const project = projects.find(item => item.id === selected);
  async function submit(pending: FrozenMutation<ProjectMutation>) {
    await new Promise(resolve => setTimeout(resolve, 450));
    const state = read(), fingerprint = JSON.stringify({action: editor, id: editor === 'edit' ? selected : null, data: pending.payload});
    const prior = state.receipts[pending.request_id];
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ApiError('同一保存标识对应不同内容，原提交仍保留。', 409, 'CREATE_REQUEST_CONFLICT');
      return prior.project;
    }
    if (scenario === 'failure') throw new TypeError('模拟连接失败。原提交与输入已保留，可以重试。');
    if (editor === 'edit' && scenario === 'conflict') {
      const original = state.projects.find(item => item.id === selected)!;
      original.name += ' · 另一页面已更新'; original.updated_at = new Date(Date.now() + 1000).toISOString();
      localStorage.setItem(STORE, JSON.stringify(state)); setScenario('success');
      throw new ApiError('其他页面已有更新，当前输入仍保留，请先核对。', 409, 'PROJECT_EDIT_CONFLICT');
    }
    const original = state.projects.find(item => item.id === selected);
    if (editor === 'edit' && original?.updated_at !== pending.payload.expected_updated_at) throw new ApiError('其他页面已有更新，当前输入仍保留，请先核对。', 409, 'PROJECT_EDIT_CONFLICT');
    const result: ProjectRecord = {...(original ?? {}), id: editor === 'edit' ? selected! : crypto.randomUUID(), workspace_id: WORKSPACE,
      name: pending.payload.name, description: pending.payload.description, status: pending.payload.status,
      next_action: pending.payload.next_action, priority: original?.priority ?? 'medium', progress: original?.progress ?? 0,
      due_at: original?.due_at ?? null, archived_at: null, updated_at: new Date().toISOString()};
    state.projects = [result, ...state.projects.filter(item => item.id !== result.id)];
    state.receipts[pending.request_id] = {fingerprint, project: result};
    localStorage.setItem(STORE, JSON.stringify(state));
    if (scenario === 'lost') throw new TypeError('模拟：服务端已保存，但回执丢失。请核对并重试同一次提交。');
    return result;
  }
  return <main className="gp-project-prototype page-stack"><header><Link to="/prototype">← 原型首页</Link><h1>项目与保存恢复</h1><p>独立示例与模拟服务，仅在本浏览器保存，不访问真实账户或服务器。</p></header>
    <section className="gp-project-prototype-controls"><label>模拟条件<select aria-label="项目原型模拟条件" value={scenario} onChange={e => setScenario(e.target.value)}><option value="success">成功</option><option value="failure">保存失败</option><option value="lost">保存成功但回执丢失</option><option value="conflict">另一页修改后发生冲突</option></select></label>
      <button onClick={() => {localStorage.setItem(STORE, JSON.stringify({projects: [], receipts: {}})); setProjects([]); setSelected(null); setEditor(null);}}>从空项目开始（仅示例）</button><button className="primary-action" onClick={() => {setEditor('new'); setNotice('');}}>新建项目</button></section>
    {notice && <p role="status">{notice}</p>}
    {editor && <ProjectForm key={editor === 'new' ? 'new' : selected} journalKey={mutationKey('prototype', WORKSPACE, editor === 'new' ? 'project-new' : `project-${selected}`)} workspaceId={WORKSPACE} project={editor === 'edit' ? project : undefined} onSubmit={submit} onClose={() => setEditor(null)} onSaved={result => {setProjects(read().projects); setSelected(result.id); setEditor(null); setNotice('模拟保存已确认，同一提交只保留一份项目。');}} readLatest={async () => read().projects.find(item => item.id === selected)!}/>}
    <section className="workspace-panel"><h2>项目 · {projects.length}</h2><div className="gp-project-list">{projects.map(item => <article className="gp-project-list-item" key={item.id}><div><h3>{item.name}</h3><p>{PROJECT_STATUS[item.status]} · {item.next_action || '尚无下一步'}</p></div><button onClick={() => {setSelected(item.id); setEditor(null);}}>查看项目</button></article>)}{!projects.length && <p>还没有项目。新建一个，写下想完成的结果。</p>}</div></section>
    {project && !editor && <section className="workspace-panel"><h2>{project.name}</h2><p>{project.description}</p><p>{PROJECT_STATUS[project.status]} · 下一步：{project.next_action || '待补充'}</p><button className="outline-action" onClick={() => setEditor('edit')}>编辑项目</button><p className="muted-note">本原型不虚构项目任务和资料；正式页按实际关联读取。</p></section>}
  </main>;
}
