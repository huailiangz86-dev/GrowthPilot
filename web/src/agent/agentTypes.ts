export interface AgentCitation { key: string; title: string; source: string; available: boolean }
export interface AgentSuggestion { title: string; description: string; priority: 'low' | 'medium' | 'high'; time_block: number | null }
export interface AgentTurn {
  id: string; client_request_id: string; question: string; status: 'processing' | 'failed' | 'completed';
  reply: string | null; error: string | null; citations: AgentCitation[]; suggestion: AgentSuggestion | null;
  confirmed_task_id: string | null; created_at: string; redacted?: boolean;
  confirmed_task_title?: string | null;
}
export interface AgentConversation { id: string; workspace_id: string; title: string; updated_at: string; turns?: AgentTurn[]; analysis?:{start:string;end:string;period:string;anchor:string;generated_at:string;excluded_sources:string[];available:boolean} }
export interface AgentSource { available: boolean; title: string; content: string; reason?: string }
export interface AgentPending { ownerId: string; workspaceId: string; conversationId: string; requestId: string; question: string }
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function pendingKey(ownerId: string, workspaceId: string) { return `growthpilot.agent.pending.v1:${ownerId}:${workspaceId}`; }
export function readPending(storage: Pick<Storage, 'getItem'>, ownerId: string, workspaceId: string): AgentPending | null {
  try {
    const value = JSON.parse(storage.getItem(pendingKey(ownerId, workspaceId)) ?? 'null') as AgentPending | null;
    return value && value.ownerId === ownerId && value.workspaceId === workspaceId && UUID.test(value.conversationId) && UUID.test(value.requestId) && typeof value.question === 'string' && value.question.trim() && value.question.length <= 2000 ? value : null;
  } catch { return null; }
}
export function pendingTurn(pending: AgentPending, processing = false): AgentTurn {
  return {id: pending.requestId, client_request_id: pending.requestId, question: pending.question, status: processing ? 'processing' : 'failed', reply: null, error: processing ? null : '这次提问尚未收到结果。原文已保留，可以重试。', citations: [], suggestion: null, confirmed_task_id: null, created_at: new Date().toISOString()};
}
export function reconcilePending(turns: AgentTurn[], pending: AgentPending | null): AgentTurn[] {
  if (!pending || turns.some(turn => turn.client_request_id === pending.requestId)) return turns;
  return [...turns, pendingTurn(pending)];
}
