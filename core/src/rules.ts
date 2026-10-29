import { deadlineBusinessDays } from './businessDays';
import { maxPriority, type AppConfig } from './config';
import type { Priority, RuleInput, RuleResult, Urgency } from './types';

const URGENCY_BASELINE: Record<Urgency, Priority> = {
  critical: 'urgent',
  high: 'high',
  medium: 'medium',
  low: 'low',
  unknown: 'medium',
};

/**
 * Motor de reglas deterministas (07_BUSINESS_RULES_AND_SLA.md).
 * Convierte las señales extraídas por la IA en una prioridad SUGERIDA; nunca es una decisión final.
 *
 * Precedencia: sensibilidad -> fecha límite -> urgencia explícita -> impacto -> categoría -> fallback.
 * Las reglas de "elevación" se combinan tomando la prioridad más alta; la regla de categoría
 * (PRIORITY-07) sólo aplica si ninguna regla anterior se activó.
 */
export function evaluatePriority(input: RuleInput, cfg: AppConfig): RuleResult {
  const hits: string[] = [];
  let priority: Priority | null = null;
  let review = false;
  const raise = (p: Priority, rule: string) => {
    priority = maxPriority(priority, p);
    if (!hits.includes(rule)) hits.push(rule);
  };

  // 1. Seguridad / sensibilidad
  if (input.sensitive) {
    review = true;
    hits.push('PRIORITY-01');
    if (input.impact === 'high') raise(cfg.sensitive_high_impact_min_priority, 'PRIORITY-01');
  }

  // 2. Fecha límite
  const received = new Date(input.received_at);
  const deadline = input.deadline ? new Date(input.deadline) : null;
  let deadlineSignal = false;
  if (deadline && !Number.isNaN(deadline.getTime()) && !Number.isNaN(received.getTime())) {
    const days = deadlineBusinessDays(received, deadline, cfg.tz_offset_minutes);
    if (days <= 0) {
      raise('urgent', 'PRIORITY-02');
      deadlineSignal = true;
      if (days < 0 && cfg.review_on_expired_deadline) {
        review = true;
        hits.push('PRIORITY-02-EXPIRED');
      }
    } else if (days <= cfg.deadline_urgent_business_days) {
      raise('urgent', 'PRIORITY-03');
      deadlineSignal = true;
    } else if (days <= cfg.deadline_high_business_days) {
      raise('high', 'PRIORITY-04');
      deadlineSignal = true;
    }
  }

  // 3. Urgencia explícita
  if (input.urgency === 'critical') raise('urgent', 'PRIORITY-06');

  // 4. Impacto
  if (input.impact === 'high' && (input.urgency === 'critical' || input.urgency === 'high')) {
    raise('high', 'PRIORITY-05');
  }

  // Información insuficiente (fallo de IA o sin señales)
  const insufficient = Boolean(input.ai_failed) || (input.urgency === 'unknown' && input.impact === 'unknown');
  if (insufficient) {
    raise(cfg.insufficient_info_priority, 'PRIORITY-08');
    review = true;
  }

  // 5. Categoría: solicitudes generales sin señales críticas -> baja
  const criticalSignals =
    input.sensitive || deadlineSignal || input.urgency === 'critical' || input.urgency === 'high';
  if (priority === null && input.category === 'Solicitudes generales' && !criticalSignals) {
    raise('low', 'PRIORITY-07');
  }

  // 6. Fallback: línea base según urgencia extraída
  if (!hits.includes('PRIORITY-07') && !insufficient) {
    const baseline = URGENCY_BASELINE[input.urgency] ?? 'medium';
    if (priority === null || maxPriority(priority, baseline) !== priority) {
      raise(baseline, 'PRIORITY-10-BASELINE');
    }
  }

  // Confianza baja -> revisión humana, se mantiene la prioridad calculada
  if (input.confidence < cfg.ai_low_confidence_threshold) {
    review = true;
    hits.push('PRIORITY-09');
  }

  if (input.ai_needs_human_review) {
    review = true;
    hits.push('AI-REVIEW-FLAG');
  }

  return {
    suggested_priority: priority ?? cfg.insufficient_info_priority,
    needs_human_review: review,
    rule_hits: hits,
  };
}
