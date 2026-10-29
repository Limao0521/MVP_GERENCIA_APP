/**
 * Reinicia y siembra la demo con el dataset sintético (FR-091).
 * Uso: npm run seed:demo [-- --provider=mock|openai] [--simulate-activity]
 *  - Ingresa los 32 casos de data/synthetic_cases.csv + el caso crítico de sample_payloads.json.
 *  - --simulate-activity: ejecuta algunas acciones humanas REALES vía RPC como usuario demo
 *    (quedan auditadas con su actor) para poblar KPIs de revisión. Son datos simulados.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { env, loadAppConfig, parseCsv, ROOT, serviceClient } from './lib/env';
import { processAndIngest, providerFromName } from './lib/pipeline';
import { runAlerts } from './run-alerts';

const args = process.argv.slice(2);
const providerName = args.find((a) => a.startsWith('--provider='))?.split('=')[1] ?? 'mock';
export const RECIPIENT: Record<string, string> = {
  'Ingeniería Informática': 'director.informatica@example.edu',
  'Ingeniería Industrial': 'director.industrial@example.edu',
  'Ingeniería Civil': 'director.civil@example.edu',
  'Ingeniería Química': 'director.quimica@example.edu',
};

async function main() {
  const sb = serviceClient();
  const cfg = await loadAppConfig(sb);
  const provider = providerFromName(providerName);

  const reset = await sb.rpc('reset_demo');
  if (reset.error) throw reset.error;
  console.log(`reset: ${JSON.stringify(reset.data)}`);

  const rows = parseCsv(readFileSync(path.join(ROOT, 'data', 'synthetic_cases.csv'), 'utf8'));
  const now = Date.now();
  for (const [i, r] of rows.entries()) {
    // Recepciones escalonadas en los últimos ~4 días para que SLA/alertas tengan variedad
    const receivedAt = new Date(now - (rows.length - i) * 3 * 3600_000).toISOString();
    const res = await processAndIngest(
      sb,
      {
        source_message_id: r.source_message_id,
        source_channel: 'demo',
        sender_email: `estudiante${String(i + 1).padStart(3, '0')}@example.edu`,
        recipient_email: RECIPIENT[r.academic_program],
        academic_program: r.academic_program,
        subject: r.subject,
        body: r.body,
        received_at: receivedAt,
      },
      cfg,
      provider,
    );
    console.log(`${r.source_message_id} -> ${res.case_number ?? res.reason}${res.duplicate ? ' (dup)' : ''}`);
  }

  const sample = JSON.parse(readFileSync(path.join(ROOT, 'data', 'sample_payloads.json'), 'utf8')).demo_ingestion;
  const demo = await processAndIngest(sb, { ...sample, received_at: new Date().toISOString() }, cfg, provider);
  console.log(`demo-001 (caso crítico) -> ${demo.case_number}`);

  if (args.includes('--simulate-activity')) await simulateActivity();
  await runAlerts();
}

async function simulateActivity() {
  const client = createClient(env('SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: 'director.informatica@example.edu',
    password: env('DEMO_USER_PASSWORD', 'Demo-MVP-2026!'),
  });
  if (error) throw new Error(`login director: ${error.message} (¿ejecutó npm run seed:users?)`);
  const { data: cases } = await client.from('cases').select('id,source_message_id');
  const by = (id: string) => cases!.find((c) => c.source_message_id === id)!.id;
  const rpc = async (fn: string, p: Record<string, unknown>) => {
    const r = await client.rpc(fn, p);
    if (r.error) throw new Error(`${fn}: ${r.error.message}`);
  };
  await rpc('accept_suggestion', { p_case_id: by('SYN-001'), p_note: 'Simulado: revisado en demo' });
  await rpc('update_case', { p_case_id: by('SYN-002'), p_changes: { current_priority: 'low' }, p_note: 'Simulado: override de prioridad' });
  for (const s of ['under_review', 'in_progress', 'resolved', 'closed']) {
    await rpc('update_case', { p_case_id: by('SYN-006'), p_changes: { status: s } });
  }
  console.log('simulated activity (director.informatica): accept SYN-001, override SYN-002, close SYN-006');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
