import type { CaseStatus, Priority } from '@core';

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const STATUS_LABEL: Record<CaseStatus, string> = {
  received: 'Recibido',
  classified: 'Clasificado',
  under_review: 'En revisión',
  in_progress: 'En gestión',
  waiting_information: 'Pendiente de información',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

export const LEVEL_LABEL: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  unknown: 'Desconocida',
};

export const ALERT_LABEL: Record<string, string> = {
  'ALERT-001': 'SLA próximo a vencer',
  'ALERT-002': 'SLA vencido',
  'ALERT-003': 'Sin gestión',
  'ALERT-004': 'Fecha límite < 24 h',
  'ALERT-005': 'Sensible sin revisar',
};

export const EVENT_LABEL: Record<string, string> = {
  case_created: 'Caso creado',
  classification_completed: 'Clasificación IA completada',
  classification_failed: 'Clasificación IA fallida (revisión manual)',
  priority_override: 'Prioridad modificada',
  category_override: 'Categoría modificada',
  reassignment: 'Reasignación',
  status_change: 'Cambio de estado',
  review_flag_change: 'Bandera de revisión',
  sensitivity_change: 'Sensibilidad modificada',
  suggestion_accepted: 'Sugerencia aceptada',
  note_added: 'Nota de gestión',
  alert_triggered: 'Alerta generada',
  alert_acknowledged: 'Alerta reconocida',
};

const TZ = 'America/Bogota';
const dateTimeFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });

export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}
export function fmtDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : '—';
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return (PRIORITY_LABEL as Record<string, string>)[v] ?? (STATUS_LABEL as Record<string, string>)[v] ?? v;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return JSON.stringify(v);
}

/** Convierte errores de PostgREST/RPC a un mensaje legible. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; details?: string };
  return e.message ?? e.details ?? JSON.stringify(err);
}
