import type { CaseStatus, Priority } from '@core';

export type AppRole = 'director' | 'administrative' | 'admin' | 'it';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  academic_program: string | null;
  responsible_label: string | null;
}

export interface CaseRow {
  id: string;
  case_number: string;
  source_message_id: string | null;
  source_channel: string;
  sender_email: string | null;
  recipient_email: string | null;
  academic_program: string | null;
  subject: string;
  message_body: string;
  suggested_category: string | null;
  suggested_priority: Priority | null;
  suggested_responsible: string | null;
  rule_hits: string[];
  category: string | null;
  current_priority: Priority | null;
  assigned_to: string | null;
  status: CaseStatus;
  ai_confidence: number | null;
  ai_summary: string | null;
  ai_urgency: string | null;
  ai_impact: string | null;
  ai_reasoning_summary: string | null;
  ai_deadline_explicit: boolean;
  detected_deadline: string | null;
  sensitive: boolean;
  sensitive_reason: string | null;
  needs_human_review: boolean;
  received_at: string;
  sla_due_at: string | null;
  first_reviewed_at: string | null;
  last_activity_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  actor_label: string;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AlertRow {
  id: string;
  case_id: string;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  active: boolean;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
}

export interface ClassificationRun {
  id: string;
  case_id: string;
  provider: string;
  model: string | null;
  success: boolean;
  error_message: string | null;
  latency_ms: number | null;
  confidence: number | null;
  validation_issues: string[];
  created_at: string;
}

export interface CaseMetrics {
  total_received: number;
  pending: number;
  resolved: number;
  closed: number;
  urgent_open: number;
  review_pending: number;
  sensitive_open: number;
  overdue: number;
  due_soon: number;
  sla_compliance_percent: number | null;
  overridden_cases: number;
  override_rate_percent: number | null;
  avg_first_review_hours: number | null;
}

export interface ClassificationMetrics {
  runs: number;
  successful_runs: number;
  failed_runs: number;
  avg_latency_ms: number | null;
  avg_confidence: number | null;
  openai_runs: number;
  mock_runs: number;
}

export interface Category {
  id: string;
  name: string;
  default_responsible: string | null;
  sort_order: number;
  active: boolean;
}

export interface Responsible {
  id: string;
  label: string;
  role_label: string;
  academic_program: string | null;
  email: string | null;
  active: boolean;
}

export interface SlaConfig {
  priority: Priority;
  first_review_business_days: number;
  enabled: boolean;
}

export interface Transition {
  from_status: CaseStatus;
  to_status: CaseStatus;
  admin_only: boolean;
}

export interface ConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}
