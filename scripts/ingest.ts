/**
 * Inyecta un mensaje por el pipeline local (sin n8n). Útil para pruebas rápidas.
 * Uso: npm run ingest -- --subject "..." --body "..." [--program "Ingeniería Civil"] [--id demo-xyz] [--provider mock]
 *      npm run ingest -- --sample        (usa data/sample_payloads.json -> demo_ingestion)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadAppConfig, ROOT, serviceClient } from './lib/env';
import { processAndIngest, providerFromName } from './lib/pipeline';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1];
  return argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
};

async function main() {
  const sb = serviceClient();
  const cfg = await loadAppConfig(sb);
  const payload = argv.includes('--sample')
    ? JSON.parse(readFileSync(path.join(ROOT, 'data', 'sample_payloads.json'), 'utf8')).demo_ingestion
    : {
        source_message_id: opt('id'),
        source_channel: 'demo',
        sender_email: opt('sender') ?? 'estudiante.cli@example.edu',
        recipient_email: opt('recipient'),
        academic_program: opt('program') ?? 'Ingeniería Informática',
        subject: opt('subject'),
        body: opt('body'),
        received_at: opt('received-at') ?? new Date().toISOString(),
      };
  const res = await processAndIngest(sb, payload, cfg, providerFromName(opt('provider')));
  console.log(JSON.stringify({ ...res, case: undefined }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
