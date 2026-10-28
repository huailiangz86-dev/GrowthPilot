import type {Exercise} from './store';
export interface RecordSummary {id: string; version: number; title: string; occurred_on: string; timezone: string; outcome: 'completed' | 'skipped'; actual_minutes: number | null; exercises: Exercise[]}
export interface Trend {exercise: string; unit: 'kg'; points: {date: string; weight: number; sources: {id: string; version: number; title: string}[]}[]}
export interface FitnessReport {start: string; end: string; total: number; records: RecordSummary[]; completed_records: number; completed_days: number; skipped_records: number; known_minutes: number; unknown_minutes_records: number; days: {date: string; records: RecordSummary[]; planned: boolean; habit_version: number | null; time: string | null; timezone: string | null}[]; trends: Trend[]}
export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('请选择有效月份');
  const [year, n] = month.split('-').map(Number);
  if (year < 1900 || year > 9998 || n < 1 || n > 12) throw new Error('请选择有效月份');
  return {start: `${month}-01`, end: `${month}-${new Date(Date.UTC(year, n, 0)).getUTCDate()}`};
}
export function shiftMonth(month: string, offset: number) {
  const {start} = monthRange(month), d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7);
}
export function trendCoordinates(points: Trend['points']) {
  if (points.length < 2) return [];
  const first = Date.parse(points[0].date), duration = Date.parse(points.at(-1)!.date) - first;
  const max = Math.max(1, ...points.map(p => p.weight));
  return points.map(p => ({...p, x: 40 + (Date.parse(p.date) - first) / duration * 520, y: 170 - p.weight / max * 140}));
}
