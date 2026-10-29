/**
 * Despliega los workflows en n8n Cloud usando la sesión del navegador (la API pública no está disponible en el trial):
 *  1. crea/actualiza la credencial Supabase (service role desde .env, nunca se imprime)
 *  2. genera los workflows con las URLs cloud y esa credencial
 *  3. crea o actualiza cada workflow, asigna el Error workflow y publica B y C
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { env, ROOT } from '../lib/env';
import { n8n } from './n8n-api';

const CRED_NAME = 'Supabase MVP (service role)';

async function main() {
  const creds = await n8n('GET', '/rest/credentials');
  let cred = (creds.json.data as any[]).find((c) => c.name === CRED_NAME && c.type === 'supabaseApi');
  const credBody = { name: CRED_NAME, type: 'supabaseApi', data: { host: env('SUPABASE_URL'), serviceRole: env('SUPABASE_SERVICE_ROLE_KEY') } };
  if (!cred) {
    const r = await n8n('POST', '/rest/credentials', credBody);
    if (r.status >= 300) throw new Error(`create credential: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
    cred = r.json.data;
    console.log('credential created', cred.id);
  } else {
    const r = await n8n('PATCH', `/rest/credentials/${cred.id}`, credBody);
    console.log('credential updated', cred.id, r.status);
  }

  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/build-n8n.ts',
    '--supabase-url', env('SUPABASE_URL'), '--webhook-base', env('N8N_WEBHOOK_BASE')], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, N8N_SUPABASE_CREDENTIAL_ID: cred.id },
  });

  const existing = ((await n8n('GET', '/rest/workflows')).json.data as any[]) ?? [];
  const ids: Record<string, string> = {};
  for (const file of ['workflow_error_handler.json', 'workflow_ingest_webhook.json', 'workflow_followup_alerts.json', 'workflow_ingest_outlook.json']) {
    const wf = JSON.parse(readFileSync(path.join(ROOT, 'n8n', file), 'utf8'));
    delete wf.id;
    if (ids.error) wf.settings.errorWorkflow = ids.error;
    const found = existing.find((w) => w.name === wf.name);
    let r;
    if (found) {
      const cur = await n8n('GET', `/rest/workflows/${found.id}`);
      r = await n8n('PATCH', `/rest/workflows/${found.id}`, { ...wf, versionId: cur.json.data.versionId });
    } else {
      r = await n8n('POST', '/rest/workflows', wf);
    }
    if (r.status >= 300) throw new Error(`${file}: ${r.status} ${JSON.stringify(r.json).slice(0, 500)}`);
    const id = r.json.data.id;
    ids[file === 'workflow_error_handler.json' ? 'error' : file] = id;
    console.log(`${found ? 'updated' : 'created'} ${wf.name} -> ${id}`);
  }

  for (const file of ['workflow_ingest_webhook.json', 'workflow_followup_alerts.json']) {
    const id = ids[file];
    const cur = await n8n('GET', `/rest/workflows/${id}`);
    const r = await n8n('POST', `/rest/workflows/${id}/activate`, { versionId: cur.json.data.versionId });
    console.log(`publish ${file}: ${r.status} ${r.status >= 300 ? JSON.stringify(r.json).slice(0, 400) : 'ok'}`);
  }
  console.log(JSON.stringify(ids));
}

main().then(() => process.exit(0), (e) => {
  console.error(String(e).slice(0, 800));
  process.exit(1);
});
