/**
 * Evaluación sobre data/synthetic_cases.csv (12_TEST_STRATEGY.md). Todas las métricas se calculan
 * a partir de la ejecución real; nada se escribe a mano.
 *
 *   npm run eval                      -> MockAIProvider + motor de reglas, en proceso (sin red)
 *   npm run eval:n8n [-- --provider openai|mock] [--url <webhook>]
 *                                     -> envía cada caso al webhook n8n (OpenAI real con créditos del trial)
 *                                        y lee el resultado persistido en Supabase (requiere service role)
 *
 * Split: SYN-001..016 = development (fixtures usados al construir el léxico Mock),
 *        SYN-017..032 = evaluation. Para el proveedor Mock el léxico fue escrito por el equipo con acceso
 *        al dataset completo, por lo que sus métricas NO son evidencia de calidad de NLP; la corrida con
 *        OpenAI vía n8n es la evidencia relevante.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AI_PROMPT_VERSION,
  DEFAULT_CONFIG,
  MockAIProvider,
  applyRules,
  normalizeMessage,
  runAnalysis,
  type AppConfig,
  type Priority,
} from '../core/src';
import { ROOT, loadAppConfig, parseCsv, serviceClient } from './lib/env';

const argv = process.argv.slice(2);
const opt = (n: string) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
const VIA_N8N = argv.includes('--via-n8n');
const PROVIDER = opt('provider') ?? (VIA_N8N ? 'openai' : 'mock');
const WEBHOOK = opt('url') || process.env.N8N_DEMO_WEBHOOK_URL || 'http://localhost:5678/webhook/student-request-demo';
/** Referencia fija (martes) para que los plazos relativos ("mañana", "antes del viernes") sean reproducibles. */
const RECEIVED_AT = '2026-10-06T09:00:00-05:00';
const RECIPIENT: Record<string, string> = {
  'Ingeniería Informática': 'director.informatica@example.edu',
  'Ingeniería Industrial': 'director.industrial@example.edu',
  'Ingeniería Civil': 'director.civil@example.edu',
  'Ingeniería Química': 'director.quimica@example.edu',
};

interface Row {
  id: string;
  split: 'development' | 'evaluation';
  subject: string;
  expected_category: string;
  expected_priority: Priority;
  expected_sensitive: boolean;
  expected_review: boolean;
  predicted_category: string;
  predicted_priority: Priority;
  predicted_sensitive: boolean;
  predicted_review: boolean;
  confidence: number;
  deadline: string | null;
  rule_hits: string;
  ai_success: boolean;
  latency_ms: number | null;
  traceable?: boolean;
}

async function main() {
  const dataset = parseCsv(readFileSync(path.join(ROOT, 'data', 'synthetic_cases.csv'), 'utf8'));
  const rows: Row[] = [];
  const extra: Record<string, unknown> = {};
  let cfg: AppConfig = DEFAULT_CONFIG;

  if (!VIA_N8N) {
    try {
      cfg = await loadAppConfig(serviceClient());
    } catch {
      /* sin DB: usa DEFAULT_CONFIG */
    }
    const provider = new MockAIProvider();
    for (const r of dataset) {
      const msg = normalizeMessage({ ...base(r), source_message_id: r.source_message_id }, cfg);
      const a = await runAnalysis(provider, msg, cfg);
      const rules = applyRules(msg, a, cfg);
      rows.push(toRow(r, a.ai.category, rules.suggested_priority, a.ai.sensitive, rules.needs_human_review, a.ai.confidence, a.ai.deadline, rules.rule_hits, a.meta.success, a.meta.latency_ms));
    }
  } else {
    const sb = serviceClient();
    const runId = `EVAL-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;
    extra.run_id = runId;
    extra.webhook = WEBHOOK;
    for (const r of dataset) {
      const sid = `${runId}-${r.source_message_id}`;
      const t = Date.now();
      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ...base(r), source_message_id: sid, ai_provider: PROVIDER }),
      });
      const body = (await res.json().catch(() => ({}))) as { case_id?: string };
      const roundTrip = Date.now() - t;
      if (!body.case_id) throw new Error(`${r.source_message_id}: webhook did not create a case (${res.status} ${JSON.stringify(body)})`);
      const { data: c } = await sb.from('cases').select('*').eq('id', body.case_id).single();
      const { data: run } = await sb.from('classification_runs').select('*').eq('case_id', body.case_id).single();
      const { data: ev } = await sb.from('case_events').select('event_type').eq('case_id', body.case_id);
      const types = (ev ?? []).map((e) => e.event_type);
      const row = toRow(r, c.suggested_category, c.suggested_priority, c.sensitive, c.needs_human_review, Number(c.ai_confidence), c.detected_deadline, c.rule_hits, run.success, run.latency_ms);
      row.traceable = types.includes('case_created') && (types.includes('classification_completed') || types.includes('classification_failed'));
      rows.push(row);
      console.log(`${r.source_message_id} -> ${c.case_number} ${c.suggested_category} / ${c.suggested_priority} (${roundTrip} ms)`);
    }
    // Prevención de duplicados: reenvío de 5 mensajes ya procesados
    let dupOk = 0;
    for (const r of dataset.slice(0, 5)) {
      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ...base(r), source_message_id: `${runId}-${r.source_message_id}`, ai_provider: PROVIDER }),
      });
      const body = (await res.json().catch(() => ({}))) as { duplicate?: boolean };
      if (body.duplicate) dupOk++;
    }
    extra.duplicate_prevention = `${dupOk}/5`;
  }

  const metrics = {
    overall: compute(rows),
    development: compute(rows.filter((r) => r.split === 'development')),
    evaluation: compute(rows.filter((r) => r.split === 'evaluation')),
  };
  const mode = VIA_N8N ? `n8n-${PROVIDER}${PROVIDER === 'openai' ? `-prompt${AI_PROMPT_VERSION}` : ''}` : 'mock-local';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(ROOT, 'evidence', 'evaluation');
  mkdirSync(dir, { recursive: true });
  const meta = { mode, provider: PROVIDER, prompt_version: PROVIDER === 'openai' ? AI_PROMPT_VERSION : 'n/a', executed_at: new Date().toISOString(), received_at_reference: RECEIVED_AT, threshold: cfg.ai_low_confidence_threshold, ...extra };
  writeFileSync(path.join(dir, `${mode}_${stamp}_metrics.json`), JSON.stringify({ meta, metrics }, null, 2));
  writeFileSync(path.join(dir, `${mode}_${stamp}_predictions.csv`), toCsv(rows));
  const report = renderReport(meta, metrics, rows);
  writeFileSync(path.join(dir, `${mode}_${stamp}_report.md`), report);
  writeFileSync(path.join(dir, `${mode}_latest_report.md`), report);
  console.log(report);
  console.log(`\nEvidencia escrita en evidence/evaluation/${mode}_${stamp}_*`);
}

function base(r: Record<string, string>) {
  return {
    source_channel: 'demo',
    sender_email: `eval.${r.source_message_id.toLowerCase()}@example.edu`,
    recipient_email: RECIPIENT[r.academic_program],
    academic_program: r.academic_program,
    subject: r.subject,
    body: r.body,
    received_at: RECEIVED_AT,
  };
}

function toRow(r: Record<string, string>, cat: string, prio: Priority, sens: boolean, review: boolean, conf: number, deadline: string | null, hits: string[], ok: boolean, latency: number | null): Row {
  const n = Number(r.source_message_id.replace(/\D/g, ''));
  return {
    id: r.source_message_id,
    split: n <= 16 ? 'development' : 'evaluation',
    subject: r.subject,
    expected_category: r.expected_category,
    expected_priority: r.expected_priority as Priority,
    expected_sensitive: r.expected_sensitive.toLowerCase() === 'true',
    expected_review: r.expected_human_review.toLowerCase() === 'true',
    predicted_category: cat,
    predicted_priority: prio,
    predicted_sensitive: sens,
    predicted_review: review,
    confidence: conf,
    deadline,
    rule_hits: (hits ?? []).join(' '),
    ai_success: ok,
    latency_ms: latency,
  };
}

const ratio = (num: number, den: number) => (den === 0 ? null : Math.round((1000 * num) / den) / 10);

function compute(rows: Row[]) {
  const n = rows.length;
  const urgentExp = rows.filter((r) => r.expected_priority === 'urgent');
  const urgentPred = rows.filter((r) => r.predicted_priority === 'urgent');
  const sensExp = rows.filter((r) => r.expected_sensitive);
  const reviewExp = rows.filter((r) => r.expected_review);
  const lat = rows.map((r) => r.latency_ms).filter((x): x is number => typeof x === 'number');
  const traced = rows.filter((r) => r.traceable !== undefined);
  return {
    cases: n,
    category_accuracy_pct: ratio(rows.filter((r) => r.predicted_category === r.expected_category).length, n),
    priority_accuracy_pct: ratio(rows.filter((r) => r.predicted_priority === r.expected_priority).length, n),
    priority_within_one_level_pct: ratio(rows.filter((r) => Math.abs(rank(r.predicted_priority) - rank(r.expected_priority)) <= 1).length, n),
    urgent_recall_pct: ratio(urgentExp.filter((r) => r.predicted_priority === 'urgent').length, urgentExp.length),
    urgent_precision_pct: ratio(urgentPred.filter((r) => r.expected_priority === 'urgent').length, urgentPred.length),
    sensitive_recall_pct: ratio(sensExp.filter((r) => r.predicted_sensitive).length, sensExp.length),
    sensitive_false_positives: rows.filter((r) => r.predicted_sensitive && !r.expected_sensitive).length,
    human_review_recall_pct: ratio(reviewExp.filter((r) => r.predicted_review).length, reviewExp.length),
    human_review_flagged_total: rows.filter((r) => r.predicted_review).length,
    ai_failures: rows.filter((r) => !r.ai_success).length,
    avg_latency_ms: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
    max_latency_ms: lat.length ? Math.max(...lat) : null,
    traceability_completeness_pct: traced.length ? ratio(traced.filter((r) => r.traceable).length, traced.length) : null,
    routing_accuracy: 'N/A — el dataset no incluye responsable esperado',
  };
}

function rank(p: Priority) {
  return { low: 0, medium: 1, high: 2, urgent: 3 }[p] ?? -1;
}

function toCsv(rows: Row[]): string {
  const cols = Object.keys(rows[0]) as Array<keyof Row>;
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function renderReport(meta: Record<string, unknown>, metrics: Record<string, ReturnType<typeof compute>>, rows: Row[]): string {
  const fmt = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'number' ? String(v) : String(v));
  const keys = Object.keys(metrics.overall) as Array<keyof ReturnType<typeof compute>>;
  const lines = [
    `# Evaluación del dataset sintético — ${meta.mode}`,
    '',
    `- Ejecutado: ${meta.executed_at}`,
    `- Proveedor IA: ${meta.provider} · versión de prompt: ${meta.prompt_version}`,
    `- Referencia de recepción para plazos relativos: ${meta.received_at_reference}`,
    `- Umbral de confianza: ${meta.threshold}`,
    ...(meta.run_id ? [`- Run ID: ${meta.run_id} · webhook: ${meta.webhook}`, `- Prevención de duplicados (reenvíos detectados): ${meta.duplicate_prevention}`] : []),
    meta.provider === 'mock'
      ? '\n> **Advertencia metodológica:** el léxico del MockAIProvider fue escrito con acceso a todo el dataset; estas cifras validan el pipeline y el motor de reglas, no la calidad de NLP.'
      : '',
    '',
    '## Métricas',
    '',
    '| Métrica | Total | Development (001–016) | Evaluation (017–032) |',
    '|---|---:|---:|---:|',
    ...keys.map((k) => `| ${k} | ${fmt(metrics.overall[k])} | ${fmt(metrics.development[k])} | ${fmt(metrics.evaluation[k])} |`),
    '',
    'Criterios técnicos sugeridos (no oficiales): category accuracy ≥ 80 %, urgent recall ≥ 90 %, sensitive recall = 100 %.',
    '',
    '## Esperado vs. predicho',
    '',
    '| ID | Split | Categoría esperada | Predicha | Prioridad esperada | Predicha | Sensible E/P | Revisión E/P | Conf. | Reglas |',
    '|---|---|---|---|---|---|---|---|---:|---|',
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.split.slice(0, 3)} | ${r.expected_category} | ${r.predicted_category === r.expected_category ? '✓' : `✗ ${r.predicted_category}`} | ${r.expected_priority} | ${r.predicted_priority === r.expected_priority ? '✓' : `✗ ${r.predicted_priority}`} | ${b(r.expected_sensitive)}/${b(r.predicted_sensitive)} | ${b(r.expected_review)}/${b(r.predicted_review)} | ${r.confidence} | ${r.rule_hits} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

const b = (v: boolean) => (v ? 'S' : 'N');

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
