import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  businessDaysBetween,
  dayOfWeek,
  deadlineBusinessDays,
  localDayIndex,
  toLocalIso,
} from '../src/businessDays';

const OFF = -300; // America/Bogota
const d = (iso: string) => new Date(iso);

describe('business days', () => {
  it('computes local weekday (2026-10-09 is Friday)', () => {
    expect(dayOfWeek(localDayIndex(d('2026-10-09T09:00:00-05:00'), OFF))).toBe(5);
    // 23:30 local Friday is still Friday even though it is Saturday in UTC
    expect(dayOfWeek(localDayIndex(d('2026-10-09T23:30:00-05:00'), OFF))).toBe(5);
  });

  it('counts business days skipping weekends', () => {
    expect(businessDaysBetween(d('2026-10-09T09:00:00-05:00'), d('2026-10-12T10:00:00-05:00'), OFF)).toBe(1);
    expect(businessDaysBetween(d('2026-10-06T09:00:00-05:00'), d('2026-10-08T10:00:00-05:00'), OFF)).toBe(2);
    expect(businessDaysBetween(d('2026-10-09T09:00:00-05:00'), d('2026-10-11T10:00:00-05:00'), OFF)).toBe(0);
  });

  it('deadline business days: expired, same day, weekend', () => {
    const ref = d('2026-10-09T09:00:00-05:00');
    expect(deadlineBusinessDays(ref, d('2026-10-08T23:59:59-05:00'), OFF)).toBe(-1);
    expect(deadlineBusinessDays(ref, d('2026-10-09T23:59:59-05:00'), OFF)).toBe(0);
    expect(deadlineBusinessDays(ref, d('2026-10-10T23:59:59-05:00'), OFF)).toBe(0); // Saturday
    expect(deadlineBusinessDays(ref, d('2026-10-13T23:59:59-05:00'), OFF)).toBe(2);
  });

  it('SLA due: same business day, next days, weekend and after-hours rollover', () => {
    const fri = d('2026-10-09T09:00:00-05:00');
    expect(toLocalIso(addBusinessDays(fri, 0, OFF, 18), OFF)).toBe('2026-10-09T18:00:00-05:00');
    expect(toLocalIso(addBusinessDays(fri, 1, OFF, 18), OFF)).toBe('2026-10-12T18:00:00-05:00');
    expect(toLocalIso(addBusinessDays(fri, 5, OFF, 18), OFF)).toBe('2026-10-16T18:00:00-05:00');
    const sat = d('2026-10-10T10:00:00-05:00');
    expect(toLocalIso(addBusinessDays(sat, 0, OFF, 18), OFF)).toBe('2026-10-12T18:00:00-05:00');
    const friLate = d('2026-10-09T19:00:00-05:00');
    expect(toLocalIso(addBusinessDays(friLate, 0, OFF, 18), OFF)).toBe('2026-10-12T18:00:00-05:00');
  });
});
