export interface ProjectRecord {
  id: string; workspace_id: string; name: string; description: string;
  status: 'active' | 'paused' | 'completed'; priority: 'low' | 'medium' | 'high'; progress: number;
  next_action: string | null; due_at: string | null; updated_at: string; archived_at: string | null;
}
export interface ProjectDraft {
  name: string; description: string; status: ProjectRecord['status']; next_action: string; base: string | null;
}
export interface ProjectMutation {
  workspace_id?: string; name: string; description: string; status: ProjectRecord['status']; next_action: string | null;
  expected_updated_at?: string;
}
export const PROJECT_STATUS = {active: '进行中', paused: '已暂停', completed: '已完成'};
