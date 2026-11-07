import { asyncStore } from '@/lib/asyncStore';
import type { TripDirection } from '@/data/domain';

const KEY = 'sms.trip.dayDone';

export interface DayDone {
  date: string;
  pickup: boolean;
  drop: boolean;
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emptyDay(date: string): DayDone {
  return { date, pickup: false, drop: false };
}

export async function loadDayDone(): Promise<DayDone> {
  const today = todayKey();
  const saved = await asyncStore.get<DayDone>(KEY);
  if (!saved || saved.date !== today) return emptyDay(today);
  return { date: today, pickup: !!saved.pickup, drop: !!saved.drop };
}

export async function markDayDone(direction: TripDirection): Promise<DayDone> {
  const current = await loadDayDone();
  const next: DayDone = { ...current, [direction]: true };
  await asyncStore.set(KEY, next);
  return next;
}
