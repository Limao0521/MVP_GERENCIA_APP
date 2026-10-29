import { AI_SYSTEM_PROMPT, aiFailureResult, buildAiUserPrompt, validateAiOutput } from './aiContract';
import type { AppConfig } from './config';
import { mockAnalyze } from './mockAi';
import { evaluatePriority } from './rules';
import type { AiResult, AiRunMeta, NormalizedMessage, RuleResult } from './types';

/** Abstracción de proveedor de IA: la fuente del mensaje y el proveedor están desacoplados. */
export interface AiProvider {
  name: string;
  model: string | null;
  /** Devuelve la salida cruda del modelo; la validación se hace fuera. */
  analyze(msg: NormalizedMessage, cfg: AppConfig): Promise<unknown>;
}

export class MockAIProvider implements AiProvider {
  name = 'mock';
  model = 'mock-lexicon-v1';
  async analyze(msg: NormalizedMessage, cfg: AppConfig): Promise<unknown> {
    return mockAnalyze(msg, cfg);
  }
}

/**
 * Adaptador OpenAI (Chat Completions + Structured Outputs). En la arquitectura del MVP la
 * llamada principal ocurre dentro de n8n Cloud (nodo OpenAI con los créditos del trial);
 * este adaptador permite evaluar el mismo prompt desde scripts locales si existe OPENAI_API_KEY.
 */
export class OpenAIProvider implements AiProvider {
  name = 'openai';
  constructor(
    private apiKey: string,
    public model: string,
    private timeoutMs = 20_000,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async analyze(msg: NormalizedMessage, cfg: AppConfig): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: buildAiUserPrompt(msg, cfg.tz_offset_minutes) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface AnalysisOutcome {
  ai: AiResult;
  meta: AiRunMeta;
}

/** Ejecuta el proveedor con degradación controlada (NFR-007): un fallo nunca pierde el caso. */
export async function runAnalysis(provider: AiProvider, msg: NormalizedMessage, cfg: AppConfig): Promise<AnalysisOutcome> {
  const started = Date.now();
  try {
    const raw = await provider.analyze(msg, cfg);
    const v = validateAiOutput(raw, cfg);
    return {
      ai: v.result,
      meta: {
        provider: provider.name,
        model: provider.model,
        success: v.ok,
        error_message: v.ok ? null : v.issues.join('; '),
        latency_ms: Date.now() - started,
        validation_issues: v.issues,
      },
    };
  } catch (err) {
    return {
      ai: aiFailureResult(),
      meta: {
        provider: provider.name,
        model: provider.model,
        success: false,
        error_message: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - started,
        validation_issues: [],
      },
    };
  }
}

export function applyRules(msg: NormalizedMessage, analysis: AnalysisOutcome, cfg: AppConfig): RuleResult {
  return evaluatePriority(
    {
      received_at: msg.received_at,
      category: analysis.ai.category,
      urgency: analysis.ai.urgency,
      impact: analysis.ai.impact,
      deadline: analysis.ai.deadline,
      confidence: analysis.ai.confidence,
      sensitive: analysis.ai.sensitive,
      ai_needs_human_review: analysis.ai.needs_human_review,
      ai_failed: !analysis.meta.success,
    },
    cfg,
  );
}

/** Payload para la función SQL `ingest_case` (mismo contrato desde n8n y desde scripts). */
export function buildIngestPayload(msg: NormalizedMessage, analysis: AnalysisOutcome, rules: RuleResult) {
  return {
    ...msg,
    ai: analysis.ai,
    rules,
    run: analysis.meta,
  };
}
export type IngestPayload = ReturnType<typeof buildIngestPayload>;
