import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, resolveConfig } from '../src/config';
import { evaluatePriority } from '../src/rules';
import type { RuleInput } from '../src/types';

const cfg = DEFAULT_CONFIG;
const TUE = '2026-10-06T09:00:00-05:00';

function input(over: Partial<RuleInput> = {}): RuleInput {
  return {
    received_at: TUE,
    category: 'Asignaturas',
    urgency: 'medium',
    impact: 'medium',
    deadline: null,
    confidence: 0.9,
    sensitive: false,
    ...over,
  };
}

describe('priority rules engine', () => {
  it('PRIORITY-02: deadline today -> urgent', () => {
    const r = evaluatePriority(input({ deadline: '2026-10-06T23:59:59-05:00' }), cfg);
    expect(r.suggested_priority).toBe('urgent');
    expect(r.rule_hits).toContain('PRIORITY-02');
  });

  it('PRIORITY-02: expired deadline -> urgent + human review', () => {
    const r = evaluatePriority(input({ deadline: '2026-10-05T23:59:59-05:00' }), cfg);
    expect(r.suggested_priority).toBe('urgent');
    expect(r.needs_human_review).toBe(true);
  });

  it('PRIORITY-03 (AT-003): deadline <= 1 business day -> urgent', () => {
    const r = evaluatePriority(input({ deadline: '2026-10-07T23:59:59-05:00' }), cfg);
    expect(r.suggested_priority).toBe('urgent');
    expect(r.rule_hits).toContain('PRIORITY-03');
  });

  it('PRIORITY-04: deadline <= 2 business days -> high', () => {
    const r = evaluatePriority(input({ deadline: '2026-10-08T23:59:59-05:00' }), cfg);
    expect(r.suggested_priority).toBe('high');
    expect(r.rule_hits).toContain('PRIORITY-04');
  });

  it('far deadline does not raise priority by itself', () => {
    const r = evaluatePriority(input({ deadline: '2026-10-20T23:59:59-05:00' }), cfg);
    expect(r.suggested_priority).toBe('medium');
  });

  it('PRIORITY-05: high impact + high urgency -> at least high', () => {
    const r = evaluatePriority(input({ impact: 'high', urgency: 'high' }), cfg);
    expect(r.suggested_priority).toBe('high');
    expect(r.rule_hits).toContain('PRIORITY-05');
  });

  it('PRIORITY-06: critical urgency -> urgent', () => {
    const r = evaluatePriority(input({ urgency: 'critical' }), cfg);
    expect(r.suggested_priority).toBe('urgent');
    expect(r.rule_hits).toContain('PRIORITY-06');
  });

  it('PRIORITY-07: general request without signals -> low', () => {
    const r = evaluatePriority(input({ category: 'Solicitudes generales', urgency: 'low', impact: 'low' }), cfg);
    expect(r.suggested_priority).toBe('low');
    expect(r.rule_hits).toEqual(['PRIORITY-07']);
  });

  it('PRIORITY-07 does not apply with contrary signals', () => {
    const r = evaluatePriority(
      input({ category: 'Solicitudes generales', urgency: 'low', deadline: '2026-10-06T23:00:00-05:00' }),
      cfg,
    );
    expect(r.suggested_priority).toBe('urgent');
  });

  it('PRIORITY-01: sensitive -> human review; high impact -> min high', () => {
    const r = evaluatePriority(input({ sensitive: true, impact: 'high', urgency: 'medium' }), cfg);
    expect(r.needs_human_review).toBe(true);
    expect(r.suggested_priority).toBe('high');
    const r2 = evaluatePriority(input({ sensitive: true, impact: 'medium', urgency: 'medium' }), cfg);
    expect(r2.suggested_priority).toBe('medium');
    expect(r2.needs_human_review).toBe(true);
  });

  it('PRIORITY-08: insufficient info -> medium + review', () => {
    const r = evaluatePriority(input({ urgency: 'unknown', impact: 'unknown', category: 'Otros' }), cfg);
    expect(r.suggested_priority).toBe('medium');
    expect(r.needs_human_review).toBe(true);
    expect(r.rule_hits).toContain('PRIORITY-08');
  });

  it('PRIORITY-08: AI failure -> medium + review', () => {
    const r = evaluatePriority(input({ ai_failed: true, confidence: 0, category: 'Otros', urgency: 'unknown', impact: 'unknown' }), cfg);
    expect(r.suggested_priority).toBe('medium');
    expect(r.needs_human_review).toBe(true);
  });

  it('PRIORITY-09: low confidence keeps priority but forces review', () => {
    const r = evaluatePriority(input({ urgency: 'critical', confidence: 0.4 }), cfg);
    expect(r.suggested_priority).toBe('urgent');
    expect(r.needs_human_review).toBe(true);
    expect(r.rule_hits).toContain('PRIORITY-09');
  });

  it('threshold is configurable', () => {
    const strict = resolveConfig({ ai_low_confidence_threshold: 0.95 });
    expect(evaluatePriority(input({ confidence: 0.9 }), strict).needs_human_review).toBe(true);
    expect(evaluatePriority(input({ confidence: 0.9 }), cfg).needs_human_review).toBe(false);
  });

  it('deadline windows are configurable', () => {
    const wide = resolveConfig({ deadline_urgent_business_days: 2 });
    const r = evaluatePriority(input({ deadline: '2026-10-08T23:59:59-05:00' }), wide);
    expect(r.suggested_priority).toBe('urgent');
  });

  it('demo critical case (spec sample) -> urgent', () => {
    const r = evaluatePriority(
      {
        received_at: '2026-10-09T09:00:00-05:00',
        category: 'Matrícula',
        urgency: 'high',
        impact: 'high',
        deadline: '2026-10-10T23:59:59-05:00',
        confidence: 0.92,
        sensitive: false,
      },
      cfg,
    );
    expect(r.suggested_priority).toBe('urgent');
    expect(r.needs_human_review).toBe(false);
    expect(r.rule_hits).toContain('PRIORITY-05');
  });
});
