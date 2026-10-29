import type { Category, Priority } from './types';

/**
 * Parámetros configurables del MVP (NFR-006). Los valores por defecto viven aquí y
 * se sobrescriben con la tabla `app_config` de Supabase (editable desde /admin).
 * Las claves coinciden 1:1 con `app_config.key`.
 */
export interface AppConfig {
  ai_low_confidence_threshold: number;
  /** Desplazamiento horario fijo en minutos (America/Bogota = -300, sin horario de verano). */
  tz_offset_minutes: number;
  /** Hora local en que termina el día hábil (para SLA "mismo día hábil"). */
  business_day_end_hour: number;
  /** PRIORITY-03: fecha límite a <= N días hábiles -> urgent. */
  deadline_urgent_business_days: number;
  /** PRIORITY-04: fecha límite a <= N días hábiles -> high. */
  deadline_high_business_days: number;
  /** Fecha límite ya vencida -> revisión humana (cualquier alternativa es decisión académica). */
  review_on_expired_deadline: boolean;
  /** PRIORITY-01: prioridad mínima para casos sensibles con impacto alto. */
  sensitive_high_impact_min_priority: Priority;
  /** PRIORITY-08: prioridad conservadora ante información insuficiente. */
  insufficient_info_priority: Priority;
  /** ALERT-001: horas antes del vencimiento del SLA para alertar. */
  sla_warning_hours: number;
  /** ALERT-003: días hábiles sin gestión. */
  followup_business_days: number;
  /** ALERT-004: horas antes de la fecha límite académica. */
  deadline_alert_hours: number;
  /** FR-002: programas incluidos en el piloto. */
  pilot_programs: string[];
  /** Dominios de destinatario aceptados (vacío = cualquiera). */
  pilot_recipient_domains: string[];
  /** Determinar programa a partir del buzón destinatario. */
  program_by_recipient: Record<string, string>;
  /** Responsable sugerido por categoría (rol, no persona). */
  responsible_by_category: Record<Category, string>;
  /** Proveedor de IA por defecto en n8n: 'openai' | 'mock'. */
  ai_provider: string;
  openai_model: string;
  demo_mode: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  ai_low_confidence_threshold: 0.7,
  tz_offset_minutes: -300,
  business_day_end_hour: 18,
  deadline_urgent_business_days: 1,
  deadline_high_business_days: 2,
  review_on_expired_deadline: true,
  sensitive_high_impact_min_priority: 'high',
  insufficient_info_priority: 'medium',
  sla_warning_hours: 4,
  followup_business_days: 2,
  deadline_alert_hours: 24,
  pilot_programs: [
    'Ingeniería Informática',
    'Ingeniería Industrial',
    'Ingeniería Civil',
    'Ingeniería Química',
  ],
  pilot_recipient_domains: ['example.edu'],
  program_by_recipient: {
    'director.informatica@example.edu': 'Ingeniería Informática',
    'director.industrial@example.edu': 'Ingeniería Industrial',
    'director.civil@example.edu': 'Ingeniería Civil',
    'director.quimica@example.edu': 'Ingeniería Química',
  },
  responsible_by_category: {
    'Matrícula': 'Director de programa',
    'Asignaturas': 'Director de programa',
    'Requisitos académicos': 'Coordinación académica',
    'Prácticas profesionales': 'Coordinación de prácticas',
    'Fechas y plazos': 'Director de programa',
    'Situaciones académicas particulares': 'Director de programa',
    'Solicitudes generales': 'Asistente administrativo',
    'Otros': 'Asistente administrativo',
  },
  ai_provider: 'openai',
  openai_model: 'gpt-4o-mini',
  demo_mode: true,
};

export const RESPONSIBLE_ROLES = [
  'Director de programa',
  'Coordinación académica',
  'Coordinación de prácticas',
  'Asistente administrativo',
] as const;

/** Combina filas de `app_config` ({key, value}) o un objeto parcial con los valores por defecto. */
export function resolveConfig(
  input?: Partial<AppConfig> | Array<{ key: string; value: unknown }> | null,
): AppConfig {
  const cfg: AppConfig = structuredCloneSafe(DEFAULT_CONFIG);
  if (!input) return cfg;
  const entries: Array<[string, unknown]> = Array.isArray(input)
    ? input.map((r) => [r.key, r.value])
    : Object.entries(input);
  for (const [key, value] of entries) {
    if (value === undefined || value === null || !(key in cfg)) continue;
    (cfg as unknown as Record<string, unknown>)[key] = value;
  }
  return cfg;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

export function maxPriority(a: Priority | null, b: Priority): Priority {
  if (a === null) return b;
  return PRIORITY_RANK[b] > PRIORITY_RANK[a] ? b : a;
}
