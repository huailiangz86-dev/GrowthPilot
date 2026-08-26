export interface DailyPreferences {
  timezone: string;
  morningTime: string;
  eveningTime: string;
  notificationEnabled: boolean;
}

export const DEFAULT_DAILY_PREFERENCES: DailyPreferences = {
  timezone: 'Asia/Shanghai',
  morningTime: '08:30',
  eveningTime: '21:30',
  notificationEnabled: false,
};

export function localDateKey(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

export function shiftLocalDateKey(timezone: string, days: number, date = new Date()) {
  const current = localDateKey(timezone, date);
  const shifted = new Date(`${current}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
