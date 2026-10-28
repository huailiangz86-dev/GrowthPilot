export interface ExpertSkill {
  id: string; version: string; name: string; reviewed_on: string;
  sources: {id: string; title: string; url: string; role: string}[];
  limits: string[];
  tools: {training_volume?: {movements: {name: string; recorded_sets: number; recorded_reps: number; external_volume_kg_reps: number;
    comparisons: {previous: {date: string; weight_kg: number}; current: {date: string; weight_kg: number}; weight_change_kg: number}[]}[]};
    record_comparison?: {recorded_days: string[]; comparison_count: number}; saved_rubric?: {id: string; criterion: string}[]};
}
export interface Teaching {
  method: string; questions: string[]; hints: string[];
  criteria: {id: string; criterion: string; source_quote: string; status: 'target' | 'supported' | 'needs_revision' | 'missing' | 'uncertain'; answer_quote: string; feedback: string}[];
}
export interface LearningResult {text: string; quotes: string[]; teaching?: Teaching; skill?: ExpertSkill}
export function exerciseWithRubric(result: LearningResult, version: number) {
  const lines = [`AI 提供的练习 · 本人采用 · 依据笔记版本 ${version}`, result.text,
    ...(result.teaching?.criteria.map(c => `检查项 ${c.id}：${c.criterion}`) ?? [])];
  return result.teaching ? ['【当前练习】', ...lines, '【练习结束】'].join('\n') : lines.join('\n');
}
