import {useState, type FormEvent} from 'react';
import {useMutationDraft} from '../mutations/useMutationDraft';
import type {FrozenMutation} from '../mutations/journal';
import {PROJECT_STATUS, type ProjectDraft, type ProjectMutation, type ProjectRecord} from './types';

export default function ProjectForm({journalKey, workspaceId, project, onSubmit, onSaved, onClose, readLatest}: {
  journalKey: string; workspaceId: string; project?: ProjectRecord;
  onSubmit: (pending: FrozenMutation<ProjectMutation>) => Promise<ProjectRecord>;
  onSaved: (project: ProjectRecord) => void; onClose: () => void; readLatest?: () => Promise<ProjectRecord>;
}) {
  const form = useMutationDraft<ProjectDraft, ProjectMutation>(journalKey, {
    name: project?.name ?? '', description: project?.description ?? '', status: project?.status ?? 'active',
    next_action: project?.next_action ?? '', base: project?.updated_at ?? null,
  });
  const [latest, setLatest] = useState<ProjectRecord | null>(null), [readError, setReadError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await form.submit(data => ({name: data.name.trim(), description: data.description.trim(), status: data.status,
      next_action: data.next_action.trim() || null, ...(project ? {expected_updated_at: data.base!} : {workspace_id: workspaceId})}), onSubmit);
    if (result) onSaved(result);
  }
  const locked = form.busy || Boolean(form.pending);
  return <section className="gp-project-form" aria-label={project ? '编辑项目' : '新建项目'}>
    <header><h3>{project ? '编辑项目' : '新建项目'}</h3><button type="button" disabled={form.busy} onClick={onClose}>收起，保留草稿</button></header>
    <p className="muted-note">{form.pending ? '正在核对同一次提交，原内容暂时锁定。' : '输入会保留为恢复草稿，服务器确认后才算保存。'}</p>
    <form onSubmit={save}><fieldset disabled={locked}>
      <label>项目名称<input aria-label="项目名称" required maxLength={160} value={form.data.name} onChange={e => form.change({name: e.target.value})}/></label>
      <label>项目说明<textarea aria-label="项目说明" maxLength={4000} rows={4} value={form.data.description} onChange={e => form.change({description: e.target.value})}/></label>
      <label>项目状态<select aria-label="项目状态" value={form.data.status} onChange={e => form.change({status: e.target.value as ProjectDraft['status']})}>{Object.entries(PROJECT_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>下一步<textarea aria-label="项目下一步" maxLength={1000} rows={2} value={form.data.next_action} onChange={e => form.change({next_action: e.target.value})}/></label>
    </fieldset>
    {form.protectedDraft && <p><button type="button" disabled={form.busy} onClick={form.recover}>保留原稿备份并恢复当前输入</button><small>原始草稿会另存备份，恢复后请核对内容再保存。</small></p>}
    {form.error && <p role="alert" className="execution-error">{form.error}</p>}
    <div className="gp-project-actions"><button className="primary-action" disabled={form.busy || !form.data.name.trim()}>{form.busy ? '正在保存…' : form.pending ? '核对并重试这次保存' : '确认保存项目'}</button>
      <button type="button" className="text-button" disabled={form.busy} onClick={form.exportDraft}>导出草稿</button>
      <button type="button" className="text-button" disabled={form.busy} onClick={form.reload}>重新读取草稿</button></div>
    </form>
    {form.backup && <details><summary>重新读取前的输入</summary><p>{form.backup.name}</p><pre>{[form.backup.description, form.backup.next_action].join('\n')}</pre></details>}
    {form.failureCode === 'PROJECT_EDIT_CONFLICT' && readLatest && <section className="gp-project-conflict"><h4>先核对其他页面的修改</h4><p>你的输入仍在上方。重新读取不会覆盖它。</p><button className="outline-action" onClick={() => {void readLatest().then(value => {setLatest(value); setReadError('');}).catch(() => setReadError('最新项目暂时无法读取，请稍后重试。'));}}>读取最新项目</button>
      {readError && <p role="alert">{readError}</p>}{latest && <><h4>{latest.name} · {PROJECT_STATUS[latest.status]}</h4><p>{latest.description}</p><p>{latest.next_action}</p><button className="outline-action" onClick={() => {form.change({base: latest.updated_at}); setLatest(null);}}>已核对，以这个版本为基础保留我的修改</button></>}</section>}
  </section>;
}
