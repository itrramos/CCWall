import { describe, expect, it } from 'vitest';
import { expiresWithinDays, isSlideActive, isWallboardOnAir } from '../src/lib/schedule.js';

describe('scheduling logic', () => {
  const base = { enabled: true, startAt: null, endAt: null, daysOfWeek: null };
  // A Wednesday at 12:00 local time.
  const wednesdayNoon = new Date(2026, 6, 15, 12, 0, 0);

  it('disabled slides are never active', () => {
    expect(isSlideActive({ ...base, enabled: false }, wednesdayNoon)).toBe(false);
  });

  it('respects start and end datetimes', () => {
    expect(isSlideActive({ ...base, startAt: new Date(2026, 6, 16).toISOString() }, wednesdayNoon)).toBe(false);
    expect(isSlideActive({ ...base, startAt: new Date(2026, 6, 14).toISOString() }, wednesdayNoon)).toBe(true);
    expect(isSlideActive({ ...base, endAt: new Date(2026, 6, 14).toISOString() }, wednesdayNoon)).toBe(false);
    expect(isSlideActive({ ...base, endAt: new Date(2026, 6, 16).toISOString() }, wednesdayNoon)).toBe(true);
  });

  it('respects day-of-week restrictions (Wednesday = 3)', () => {
    expect(isSlideActive({ ...base, daysOfWeek: [3] }, wednesdayNoon)).toBe(true);
    expect(isSlideActive({ ...base, daysOfWeek: [0, 6] }, wednesdayNoon)).toBe(false);
    expect(isSlideActive({ ...base, daysOfWeek: [] }, wednesdayNoon)).toBe(true);
  });

  it('wallboard schedule: null means always on air', () => {
    expect(isWallboardOnAir(null, wednesdayNoon)).toBe(true);
  });

  it('wallboard schedule: within and outside the daily window', () => {
    const office = { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' };
    expect(isWallboardOnAir(office, wednesdayNoon)).toBe(true);
    expect(isWallboardOnAir(office, new Date(2026, 6, 15, 19, 0))).toBe(false);
    expect(isWallboardOnAir(office, new Date(2026, 6, 19, 12, 0))).toBe(false); // Sunday
  });

  it('wallboard schedule: overnight windows span midnight', () => {
    const night = { days: [], start: '22:00', end: '06:00' };
    expect(isWallboardOnAir(night, new Date(2026, 6, 15, 23, 0))).toBe(true);
    expect(isWallboardOnAir(night, new Date(2026, 6, 15, 5, 0))).toBe(true);
    expect(isWallboardOnAir(night, new Date(2026, 6, 15, 12, 0))).toBe(false);
  });

  it('expiresWithinDays flags upcoming expirations only', () => {
    const at = new Date(2026, 6, 15);
    expect(expiresWithinDays(new Date(2026, 6, 18).toISOString(), 7, at)).toBe(true);
    expect(expiresWithinDays(new Date(2026, 6, 30).toISOString(), 7, at)).toBe(false);
    expect(expiresWithinDays(new Date(2026, 6, 10).toISOString(), 7, at)).toBe(false);
    expect(expiresWithinDays(null, 7, at)).toBe(false);
  });
});
