import {
  MockAIProvider,
  applyRules,
  buildIngestPayload,
  checkScope,
  evaluateAlerts,
  normalizeMessage,
  resolveConfig,
  runAnalysis,
  type AppConfig,
  type CaseForAlerts,
  type IngestionPayload,
} from '@core';
import type {
  AlertRow,
  CaseEvent,
  CaseMetrics,
  CaseRow,
  Category,
  ClassificationMetrics,
  ClassificationRun,
  ConfigRow,
  Responsible,
  SlaConfig,
  Transition,
} from '../types/db';
import { N8N_DEMO_WEBHOOK_URL, supabase } from './supabase';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------------------------------------------------------------- lectura
export async function fetchCases(): Promise<CaseRow[]> {
  return unwrap(await supabase.from('cases').select('*').order('received_at', { ascending: false }).limit(1000));
}

export async function fetchCase(id: string): Promise<CaseRow | null> {
  return unwrap(await supabase.from('cases').select('*').eq('id', id).maybeSingle());
}

export async function fetchEvents(caseId: string): Promise<CaseEvent[]> {
  return unwrap(await supabase.from('case_events').select('*').eq('case_id', caseId).order('created_at', { ascending: true }));
}

export async function fetchRuns(caseId: string): Promise<ClassificationRun[]> {
  return unwrap(await supabase.from('classification_runs').select('*').eq('case_id', caseId).order('created_at'));
}

export async function fetchAlerts(opts: { caseId?: string; activeOnly?: boolean } = {}): Promise<AlertRow[]> {
  let q = supabase.from('alerts').select('*').order('triggered_at', { ascending: false }).limit(500);
  if (opts.caseId) q = q.eq('case_id', opts.caseId);
  if (opts.activeOnly) q = q.eq('active', true);
  return unwrap(await q);
}

export async function fetchMetrics(): Promise<{ cases: CaseMetrics; classification: ClassificationMetrics }> {
  const [cases, classification] = await Promise.all([
    supabase.from('case_metrics').select('*').single(),
    supabase.from('classification_metrics').select('*').single(),
  ]);
  return { cases: unwrap(cases) as CaseMetrics, classification: unwrap(classification) as ClassificationMetrics };
}

export interface Catalogs {
  categories: Category[];
  responsibles: Responsible[];
  transitions: Transition[];
  sla: SlaConfig[];
  configRows: ConfigRow[];
  config: AppConfig;
}

export async function fetchCatalogs(): Promise<Catalogs> {
  const [categories, responsibles, transitions, sla, configRows] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('responsibles').select('*').order('label'),
    supabase.from('status_transitions').select('*'),
    supabase.from('sla_config').select('*'),
    supabase.from('app_config').select('*').order('key'),
  ]);
  const rows = unwrap(configRows) as ConfigRow[];
  return {
    categories: unwrap(categories) as Category[],
    responsibles: unwrap(responsibles) as Responsible[],
    transitions: unwrap(transitions) as Transition[],
    sla: unwrap(sla) as SlaConfig[],
    configRows: rows,
    config: resolveConfig(rows),
  };
}

// ---------------------------------------------------------------- acciones auditadas (RPC)
export type CaseChanges = Partial<Pick<CaseRow, 'category' | 'current_priority' | 'assigned_to' | 'status' | 'needs_human_review'>>;

export async function updateCase(caseId: string, changes: CaseChanges, note?: string): Promise<CaseRow> {
  return unwrap(await supabase.rpc('update_case', { p_case_id: caseId, p_changes: changes, p_note: note ?? null }));
}

export async function acceptSuggestion(caseId: string, note?: string): Promise<CaseRow> {
  return unwrap(await supabase.rpc('accept_suggestion', { p_case_id: caseId, p_note: note ?? null }));
}

export async function addNote(caseId: string, note: string): Promise<void> {
  unwrap(await supabase.rpc('add_case_note', { p_case_id: caseId, p_note: note }));
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  unwrap(await supabase.rpc('acknowledge_alert', { p_alert_id: alertId }));
}

/** Recalcula alertas con el mismo motor que usa n8n (core/src/alerts.ts) y las sincroniza. */
export async function recomputeAlerts(config: AppConfig): Promise<{ created: number; deactivated: number; active_total: number }> {
  const open = unwrap(
    await supabase
      .from('cases')
      .select('id,case_number,status,current_priority,sensitive,needs_human_review,received_at,first_reviewed_at,sla_due_at,detected_deadline,last_activity_at')
      .not('status', 'in', '(resolved,closed)'),
  ) as CaseForAlerts[];
  const alerts = evaluateAlerts(open, config, new Date());
  return unwrap(await supabase.rpc('sync_alerts', { p_alerts: alerts, p_case_ids: open.map((c) => c.id) }));
}

// ---------------------------------------------------------------- Demo Mode
export interface IngestResponse {
  accepted: boolean;
  duplicate?: boolean;
  case_id?: string;
  case_number?: string;
  status?: string;
  reason?: string;
  error?: { code: string; message: string; retryable: boolean };
}

/** Envía el mensaje al webhook de n8n (flujo real del MVP). */
export async function sendToN8n(payload: IngestionPayload): Promise<IngestResponse> {
  if (!N8N_DEMO_WEBHOOK_URL) throw new Error('VITE_N8N_DEMO_WEBHOOK_URL no está configurada');
  const res = await fetch(N8N_DEMO_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: IngestResponse;
  try {
    body = JSON.parse(text) as IngestResponse;
  } catch {
    throw new Error(`n8n respondió ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok && !body.error) throw new Error(`n8n respondió ${res.status}`);
  return body;
}

/**
 * Fallback sin n8n: mismo pipeline (core) ejecutado en el navegador con MockAIProvider,
 * persistido mediante la RPC demo_ingest_case (sólo con demo_mode=true).
 */
export async function ingestLocally(payload: IngestionPayload, config: AppConfig): Promise<IngestResponse> {
  const msg = normalizeMessage(payload, config);
  const scope = checkScope(msg, config);
  if (!scope.in_scope) return { accepted: false, reason: scope.reason ?? 'out of scope' };
  const analysis = await runAnalysis(new MockAIProvider(), msg, config);
  const rules = applyRules(msg, analysis, config);
  const result = unwrap(
    await supabase.rpc('demo_ingest_case', { p: buildIngestPayload(msg, analysis, rules) }),
  ) as IngestResponse & { case?: CaseForAlerts };
  if (result.case && !result.duplicate) {
    const alerts = evaluateAlerts([result.case], config, new Date());
    await supabase.rpc('sync_alerts', { p_alerts: alerts, p_case_ids: [result.case.id] });
  }
  return result;
}

export async function resetDemo(): Promise<{ deleted_cases: number }> {
  return unwrap(await supabase.rpc('reset_demo'));
}
