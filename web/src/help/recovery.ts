import type {HelpPayload} from './useItemHelp';
export interface HelpJournal {payload: HelpPayload | null; fields: Record<string, string>}
export function restoreHelp(storage: Pick<Storage,'getItem'>, key: string): HelpJournal {
  const raw = storage.getItem(key);
  if (!raw) return {payload:null,fields:{}};
  const value = JSON.parse(raw) as HelpJournal;
  const p = value?.payload;
  if (!value?.fields || typeof value.fields !== 'object' || Array.isArray(value.fields)
    || Object.values(value.fields).some(v => typeof v !== 'string')
    || (p !== null && (!p || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(p.request_id)
      || !['fitness_extract','learning_explain','learning_practice','learning_feedback','learning_diagnose'].includes(p.kind)
      || (p.kind==='learning_diagnose'&&(!Array.isArray(p.evidence_keys)||!p.evidence_keys.length||p.evidence_keys.length>10||new Set(p.evidence_keys).size!==p.evidence_keys.length||p.evidence_keys.some(k=>typeof k!=='string'||!k||k.length>100)))
      || p.consent !== true || ['text','timezone','workspace_id','item_id','question','answer'].some(k => k in p && typeof p[k as keyof HelpPayload] !== 'string')
      || (p.kind === 'fitness_extract' ? !p.text?.trim() || !!p.workspace_id || !!p.item_id : !p.workspace_id || !p.item_id || !Number.isInteger(p.base_version) || p.base_version! < 1)))) {
    throw new Error('AI 草稿无法读取，原存储需要保留。');
  }
  return value;
}
