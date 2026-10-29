import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MockAIProvider,
  OpenAIProvider,
  applyRules,
  buildIngestPayload,
  checkScope,
  evaluateAlerts,
  normalizeMessage,
  runAnalysis,
  type AiProvider,
  type AppConfig,
  type CaseForAlerts,
  type IngestionPayload,
} from '../../core/src';

export function providerFromName(name: string | undefined): AiProvider {
  if (name === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is required for --provider=openai (o use n8n: npm run eval:n8n)');
    return new OpenAIProvider(key, process.env.OPENAI_MODEL || 'gpt-4o-mini');
  }
  return new MockAIProvider();
}

export interface IngestResult {
  accepted: boolean;
  duplicate?: boolean;
  case_id?: string;
  case_number?: string;
  status?: string;
  reason?: string;
  case?: CaseForAlerts;
}

/** Mismo pipeline lógico que el workflow n8n: normalizar -> alcance -> IA -> validar -> reglas -> persistir -> alertas. */
export async function processAndIngest(
  sb: SupabaseClient,
  payload: IngestionPayload,
  cfg: AppConfig,
  provider: AiProvider,
): Promise<IngestResult> {
  const msg = normalizeMessage(payload, cfg);
  const scope = checkScope(msg, cfg);
  if (!scope.in_scope) return { accepted: false, reason: scope.reason ?? 'out of scope' };
  const analysis = await runAnalysis(provider, msg, cfg);
  const rules = applyRules(msg, analysis, cfg);
  const { data, error } = await sb.rpc('ingest_case', {
    p: { ...buildIngestPayload(msg, analysis, rules), actor: `script:${provider.name}` },
  });
  if (error) throw new Error(`ingest_case failed: ${error.message}`);
  const result = data as IngestResult;
  if (result.case && !result.duplicate) {
    const alerts = evaluateAlerts([result.case], cfg, new Date());
    const sync = await sb.rpc('sync_alerts', { p_alerts: alerts, p_case_ids: [result.case.id] });
    if (sync.error) throw new Error(`sync_alerts failed: ${sync.error.message}`);
  }
  return result;
}
