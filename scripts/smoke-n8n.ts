/**
 * Smoke test del webhook n8n (local o Cloud): cubre caso nuevo, idempotencia, fuera de alcance,
 * payload inválido y proveedor OpenAI (o su fallback si no hay créditos/credencial).
 * Uso: npm run smoke:n8n -- [--url https://<instancia>.app.n8n.cloud/webhook/student-request-demo] [--provider openai|mock]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, serviceClient } from './lib/env';

const argv = process.argv.slice(2);
const opt = (n: string) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
const URL_ = opt('url') || process.env.N8N_DEMO_WEBHOOK_URL || 'http://localhost:5678/webhook/student-request-demo';
const PROVIDER = opt('provider') ?? 'mock';
const sample = JSON.parse(readFileSync(path.join(ROOT, 'data', 'sample_payloads.json'), 'utf8')).demo_ingestion;

async function post(body: unknown) {
  const t = Date.now();
  const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ms: Date.now() - t, json };
}

let failures = 0;
function check(label: string, ok: boolean, detail: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`, JSON.stringify(detail));
}

async function main() {
  console.log(`webhook: ${URL_}  provider: ${PROVIDER}\n`);
  const id = `smoke-${Date.now()}`;
  const first = await post({ ...sample, source_message_id: id, received_at: new Date().toISOString(), ai_provider: PROVIDER });
  check('nuevo caso aceptado', first.status === 200 && first.json.accepted === true && !first.json.duplicate, first);

  const dup = await post({ ...sample, source_message_id: id, ai_provider: PROVIDER });
  check('idempotencia (mismo source_message_id)', dup.json.duplicate === true && dup.json.case_id === first.json.case_id, dup.json);

  const out = await post({ ...sample, source_message_id: `${id}-out`, academic_program: 'Medicina', recipient_email: 'decano@otro.edu' });
  check('fuera de alcance rechazado', out.json.accepted === false, out.json);

  const bad = await post({ source_message_id: `${id}-bad` });
  check('payload inválido -> 400 con error estándar', bad.status === 400 && typeof bad.json.error === 'object', bad);

  if (process.env.SUPABASE_SERVICE_ROLE_KEY && first.json.case_id) {
    const sb = serviceClient();
    const { data: c } = await sb.from('cases').select('case_number,category,suggested_priority,needs_human_review,detected_deadline,status').eq('id', first.json.case_id).single();
    const { data: run } = await sb.from('classification_runs').select('provider,model,success,error_message,latency_ms').eq('case_id', first.json.case_id).single();
    console.log('\ncaso en Supabase:', JSON.stringify(c), '\nclasificación:', JSON.stringify(run));
  }
  console.log(failures ? `\n${failures} verificación(es) fallida(s)` : '\nTodas las verificaciones pasaron');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
