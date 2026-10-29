export const CATEGORIES = [
  'Matrícula',
  'Asignaturas',
  'Requisitos académicos',
  'Prácticas profesionales',
  'Fechas y plazos',
  'Situaciones académicas particulares',
  'Solicitudes generales',
  'Otros',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const URGENCIES = ['critical', 'high', 'medium', 'low', 'unknown'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const IMPACTS = ['high', 'medium', 'low', 'unknown'] as const;
export type Impact = (typeof IMPACTS)[number];

export const STATUSES = [
  'received',
  'classified',
  'under_review',
  'in_progress',
  'waiting_information',
  'resolved',
  'closed',
] as const;
export type CaseStatus = (typeof STATUSES)[number];

export const ALERT_TYPES = [
  'ALERT-001', // SLA de primera revisión próximo a vencer
  'ALERT-002', // SLA de primera revisión vencido
  'ALERT-003', // Sin gestión por N días hábiles
  'ALERT-004', // Fecha límite académica dentro de 24 h
  'ALERT-005', // Caso sensible pendiente de revisión
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Payload de ingesta (webhook demo u Outlook normalizado). Ver 10_API_AND_PAYLOAD_CONTRACTS.md */
export interface IngestionPayload {
  source_message_id?: string | null;
  source_channel?: string | null;
  sender_email?: string | null;
  recipient_email?: string | null;
  academic_program?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at?: string | null;
  /** Opcional: fuerza proveedor de IA para esta solicitud ('mock' | 'openai'). */
  ai_provider?: string | null;
}

export interface NormalizedMessage {
  source_message_id: string;
  source_channel: string;
  sender_email: string | null;
  recipient_email: string | null;
  academic_program: string | null;
  subject: string;
  body: string;
  received_at: string;
}

/** Contrato estricto de salida de IA. Ver 06_AI_ANALYSIS_SPEC.md */
export interface AiResult {
  category: Category;
  summary: string;
  urgency: Urgency;
  impact: Impact;
  deadline: string | null;
  deadline_explicit: boolean;
  suggested_responsible: string | null;
  sensitive: boolean;
  sensitive_reason: string | null;
  confidence: number;
  needs_human_review: boolean;
  reasoning_summary: string;
}

export interface AiRunMeta {
  provider: string;
  model: string | null;
  success: boolean;
  error_message: string | null;
  latency_ms: number | null;
  /** Problemas de validación encontrados (campos coaccionados, categoría desconocida, etc.). */
  validation_issues: string[];
}

export interface RuleInput {
  received_at: string;
  category: Category;
  urgency: Urgency;
  impact: Impact;
  deadline: string | null;
  confidence: number;
  sensitive: boolean;
  ai_needs_human_review?: boolean;
  ai_failed?: boolean;
}

export interface RuleResult {
  suggested_priority: Priority;
  needs_human_review: boolean;
  rule_hits: string[];
}

export interface AlertCandidate {
  case_id: string;
  alert_type: AlertType;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

/** Subconjunto de columnas de `cases` necesario para evaluar alertas. */
export interface CaseForAlerts {
  id: string;
  case_number?: string;
  status: CaseStatus;
  current_priority: Priority | null;
  sensitive: boolean;
  needs_human_review: boolean;
  received_at: string;
  first_reviewed_at: string | null;
  sla_due_at: string | null;
  detected_deadline: string | null;
  last_activity_at: string | null;
}
