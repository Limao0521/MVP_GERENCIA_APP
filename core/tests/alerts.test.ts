import { describe, expect, it } from 'vitest';
import { evaluateAlerts } from '../src/alerts';
import { DEFAULT_CONFIG } from '../src/config';
import type { CaseForAlerts } from '../src/types';

const cfg = DEFAULT_CONFIG;
const base: CaseForAlerts = {
  id: 'c1',
  case_number: 'CASE-0001',
  status: 'classified',
  current_priority: 'high',
  sensitive: false,
  needs_human_review: false,
  received_at: '2026-10-06T09:00:00-05:00',
  first_reviewed_at: null,
  sla_due_at: '2026-10-07T18:00:00-05:00',
  detected_deadline: null,
  last_activity_at: null,
};
const types = (now: string, c: Partial<CaseForAlerts> = {}) =>
  evaluateAlerts([{ ...base, ...c }], cfg, new Date(now)).map((a) => a.alert_type).sort();

describe('SLA / follow-up alerts', () => {
  it('no alerts while SLA is comfortable', () => {
    expect(types('2026-10-06T10:00:00-05:00')).toEqual([]);
  });

  it('ALERT-001: SLA close to due', () => {
    expect(types('2026-10-07T15:00:00-05:00')).toEqual(['ALERT-001']);
  });

  it('ALERT-002 (AT-009): SLA overdue', () => {
    expect(types('2026-10-07T18:30:00-05:00')).toEqual(['ALERT-002']);
  });

  it('reviewed case has no SLA alert', () => {
    expect(types('2026-10-07T18:30:00-05:00', { first_reviewed_at: '2026-10-06T11:00:00-05:00', last_activity_at: '2026-10-06T11:00:00-05:00' })).toEqual([]);
  });

  it('ALERT-003 (AT-010): no management for 2 business days', () => {
    expect(types('2026-10-08T10:00:00-05:00', { first_reviewed_at: '2026-10-06T10:00:00-05:00', last_activity_at: '2026-10-06T10:00:00-05:00' })).toEqual(['ALERT-003']);
    // Friday -> Monday is only 1 business day
    expect(types('2026-10-12T10:00:00-05:00', { first_reviewed_at: 'x', last_activity_at: '2026-10-09T10:00:00-05:00' })).toEqual([]);
  });

  it('ALERT-004: academic deadline within 24h', () => {
    expect(types('2026-10-06T10:00:00-05:00', { detected_deadline: '2026-10-06T23:59:59-05:00' })).toEqual(['ALERT-004']);
    expect(types('2026-10-06T10:00:00-05:00', { detected_deadline: '2026-10-09T23:59:59-05:00' })).toEqual([]);
  });

  it('ALERT-005: sensitive case pending review', () => {
    expect(types('2026-10-06T10:00:00-05:00', { sensitive: true, needs_human_review: true })).toEqual(['ALERT-005']);
  });

  it('closed and resolved cases produce no alerts', () => {
    expect(types('2026-10-20T10:00:00-05:00', { status: 'closed' })).toEqual([]);
    expect(types('2026-10-20T10:00:00-05:00', { status: 'resolved' })).toEqual([]);
  });
});
