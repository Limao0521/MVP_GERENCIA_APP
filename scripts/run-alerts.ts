/**
 * Evaluación de SLA/seguimiento equivalente al Workflow C de n8n.
 * Uso: npm run alerts
 */
import { evaluateAlerts, type CaseForAlerts } from '../core/src';
import { loadAppConfig, serviceClient } from './lib/env';

export async function runAlerts(now = new Date()) {
  const sb = serviceClient();
  const cfg = await loadAppConfig(sb);
  const { data, error } = await sb.rpc('get_open_cases_for_alerts');
  if (error) throw error;
  const cases = (data as { cases: CaseForAlerts[] }).cases;
  const alerts = evaluateAlerts(cases, cfg, now);
  const sync = await sb.rpc('sync_alerts', { p_alerts: alerts, p_case_ids: cases.map((c) => c.id) });
  if (sync.error) throw sync.error;
  console.log(`alerts: evaluated ${cases.length} open cases -> ${JSON.stringify(sync.data)}`);
  return sync.data as { created: number; deactivated: number; active_total: number };
}

if (process.argv[1]?.endsWith('run-alerts.ts')) {
  runAlerts().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
