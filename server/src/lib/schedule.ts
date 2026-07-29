/** Slide/wallboard scheduling logic — pure functions, unit tested. */

export interface SlideScheduleFields {
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  daysOfWeek: number[] | null; // 0 = Sunday … 6 = Saturday; null/empty = every day
}

export function isSlideActive(slide: SlideScheduleFields, at: Date = new Date()): boolean {
  if (!slide.enabled) return false;
  if (slide.startAt && at.getTime() < new Date(slide.startAt).getTime()) return false;
  if (slide.endAt && at.getTime() > new Date(slide.endAt).getTime()) return false;
  if (slide.daysOfWeek && slide.daysOfWeek.length > 0 && !slide.daysOfWeek.includes(at.getDay())) {
    return false;
  }
  return true;
}

export interface WallboardSchedule {
  days: number[];
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

/** Whether a wallboard's optional on-air schedule is currently satisfied. */
export function isWallboardOnAir(schedule: WallboardSchedule | null, at: Date = new Date()): boolean {
  if (!schedule) return true;
  if (schedule.days.length > 0 && !schedule.days.includes(at.getDay())) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  const toMin = (s: string): number => {
    const [h = 0, m = 0] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMin(schedule.start);
  const end = toMin(schedule.end);
  if (start === end) return true;
  // Overnight window (e.g. 22:00–06:00)
  if (end < start) return minutes >= start || minutes < end;
  return minutes >= start && minutes < end;
}

/** Slides expiring within the given number of days (for notifications). */
export function expiresWithinDays(endAt: string | null, days: number, at: Date = new Date()): boolean {
  if (!endAt) return false;
  const end = new Date(endAt).getTime();
  if (Number.isNaN(end)) return false;
  const horizon = at.getTime() + days * 24 * 60 * 60 * 1000;
  return end > at.getTime() && end <= horizon;
}
