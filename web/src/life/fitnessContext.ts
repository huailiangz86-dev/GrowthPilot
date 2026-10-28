export const EQUIPMENT = {bodyweight:'自重', dumbbell:'哑铃', barbell:'杠铃', machine:'固定器械', band:'弹力带'};
export type Equipment = keyof typeof EQUIPMENT;
export const GOALS = {consistency:'养成规律', strength:'力量', muscle:'肌肉增长', general:'日常体能'};
export const EXPERIENCE = {beginner:'刚开始', returning:'恢复训练', experienced:'有持续训练经验'};
export interface FitnessProfile {
  goal: keyof typeof GOALS | null; experience: keyof typeof EXPERIENCE | null; equipment: Equipment[];
  days_per_week: number | null; session_minutes: number | null;
  population: 'unknown' | 'healthy_adult' | 'needs_guidance';
  limitations: 'unknown' | 'none' | 'reported'; limitation_notes: string;
  share_with_expert: boolean; confirmed: boolean;
}
export const blankProfile = (): FitnessProfile => ({goal:null,experience:null,equipment:[],days_per_week:null,
  session_minutes:null,population:'unknown',limitations:'unknown',limitation_notes:'',share_with_expert:false,confirmed:false});
export function validProfile(p: FitnessProfile, draft = false): boolean {
  return !!p && (p.goal === null || Object.hasOwn(GOALS,p.goal)) && (p.experience === null || Object.hasOwn(EXPERIENCE,p.experience))
    && Array.isArray(p.equipment) && p.equipment.every(k=>Object.hasOwn(EQUIPMENT,k)) && new Set(p.equipment).size === p.equipment.length
    && (p.days_per_week === null || (typeof p.days_per_week === 'number' && Number.isFinite(p.days_per_week) && (draft || Number.isInteger(p.days_per_week) && p.days_per_week >= 1 && p.days_per_week <= 7)))
    && (p.session_minutes === null || (typeof p.session_minutes === 'number' && Number.isFinite(p.session_minutes) && (draft || Number.isInteger(p.session_minutes) && p.session_minutes >= 5 && p.session_minutes <= 240)))
    && ['unknown','healthy_adult','needs_guidance'].includes(p.population) && ['unknown','none','reported'].includes(p.limitations)
    && typeof p.limitation_notes === 'string' && p.limitation_notes.length <= 2000
    && typeof p.share_with_expert === 'boolean' && typeof p.confirmed === 'boolean';
}
export const RECOVERY = {ready:'当时感觉可正常活动', tired:'当时疲劳或恢复不足', pain_or_unwell:'当时疼痛或不适'};
export interface FitnessContext {
  mode: 'gather_context' | 'review_limits' | 'repeat_logged_structure'; reasons: string[];
  profile_version: number; record_id: string | null; record_version: number | null;
  session: {title: string; exercises: {name:string;weight:number;sets:number;reps:number;equipment:Equipment}[];
    conditions:string[]; feedback_prompts:string[]} | null;
}
