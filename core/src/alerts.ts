import { businessDaysBetween } from './businessDays';
import type { AppConfig } from './config';
import type { AlertCandidate, CaseForAlerts } from './types';

const HOUR = 3_600_000;
const CLOSED_STATUSES = new Set(['resolved', 'closed']);

/**
 * Evalúa las alertas que DEBEN estar activas para cada caso (ALERT-001..005).
 * La sincronización (crear nuevas / desactivar las que ya no aplican, sin duplicar)
 * la hace la función SQL `sync_alerts`.
 */
export function evaluateAlerts(cases: CaseForAlerts[], cfg: AppConfig, now = new Date()): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const nowMs = now.getTime();

  for (const c of cases) {
    if (CLOSED_STATUSES.has(c.status)) continue;
    const label = c.case_number ?? c.id;
    const pendingFirstReview = !c.first_reviewed_at;

    if (pendingFirstReview && c.sla_due_at) {
      const due = new Date(c.sla_due_at).getTime();
      if (nowMs > due) {
        out.push({
          case_id: c.id,
          alert_type: 'ALERT-002',
          severity: 'critical',
          message: `${label}: SLA de primera revisión vencido (prioridad ${c.current_priority ?? 'n/d'}).`,
        });
      } else if (due - nowMs <= cfg.sla_warning_hours * HOUR) {
        const hours = Math.max(0, Math.round((due - nowMs) / HOUR));
        out.push({
          case_id: c.id,
          alert_type: 'ALERT-001',
          severity: 'warning',
          message: `${label}: SLA de primera revisión vence en ~${hours} h.`,
        });
      }
    }

    const lastActivity = new Date(c.last_activity_at ?? c.received_at);
    const idleDays = businessDaysBetween(lastActivity, now, cfg.tz_offset_minutes);
    if (idleDays >= cfg.followup_business_days) {
      out.push({
        case_id: c.id,
        alert_type: 'ALERT-003',
        severity: 'warning',
        message: `${label}: sin gestión durante ${idleDays} días hábiles.`,
      });
    }

    if (c.detected_deadline) {
      const deadline = new Date(c.detected_deadline).getTime();
      if (deadline >= nowMs && deadline - nowMs <= cfg.deadline_alert_hours * HOUR) {
        out.push({
          case_id: c.id,
          alert_type: 'ALERT-004',
          severity: 'critical',
          message: `${label}: fecha límite académica dentro de las próximas ${cfg.deadline_alert_hours} h.`,
        });
      }
    }

    if (c.sensitive && c.needs_human_review && pendingFirstReview) {
      out.push({
        case_id: c.id,
        alert_type: 'ALERT-005',
        severity: 'warning',
        message: `${label}: caso sensible pendiente de revisión humana.`,
      });
    }
  }
  return out;
}
