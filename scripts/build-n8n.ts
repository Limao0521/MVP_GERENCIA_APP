/**
 * Genera los workflows importables de n8n a partir de la lógica de core/src (única fuente de verdad).
 * La lógica (normalización, validación del contrato IA, motor de reglas, alertas, Mock IA) se empaqueta
 * con esbuild y se inyecta en los nodos Code, de modo que n8n ejecuta EXACTAMENTE el código probado con vitest.
 *
 * Uso:
 *   npm run build:n8n -- --supabase-url https://<ref>.supabase.co --webhook-base https://<instancia>.app.n8n.cloud
 *   (por defecto toma N8N_SUPABASE_URL y N8N_WEBHOOK_BASE del entorno; si no, deja marcadores YOUR-…)
 */
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/env';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const SUPABASE_URL = (opt('supabase-url') || process.env.N8N_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co').replace(/\/$/, '');
const WEBHOOK_BASE = (opt('webhook-base') || process.env.N8N_WEBHOOK_BASE || 'https://YOUR-INSTANCE.app.n8n.cloud').replace(/\/$/, '');
const OUT_DIR = path.resolve(ROOT, opt('out') ?? 'n8n');
const SUPABASE_CRED = { id: process.env.N8N_SUPABASE_CREDENTIAL_ID ?? 'supabase-mvp', name: 'Supabase MVP (service role)' };
// n8n Cloud (trial actual) ya no emite "free OpenAI credits": usa Gateway credits. En el JSON del nodo eso se
// representa como credencial openAiApi gestionada (`__aiGatewayManaged: true`, sin id). Con --openai-credential-id
// se puede usar en su lugar una credencial OpenAI propia (p. ej. en n8n self-hosted).
const OPENAI_CRED_ID = opt('openai-credential-id') || process.env.N8N_OPENAI_CREDENTIAL_ID;
const OPENAI_CRED: Record<string, unknown> = OPENAI_CRED_ID
  ? { id: OPENAI_CRED_ID, name: 'OpenAI account' }
  : { id: null, name: 'Gateway credits', __aiGatewayManaged: true };
const WEBHOOK_PATH = 'student-request-demo';

type Node = Record<string, unknown> & { name: string };
type Connections = Record<string, { main: Array<Array<{ node: string; type: 'main'; index: number }>> }>;

async function bundleCore(): Promise<string> {
  // El sandbox de nodos Code de n8n no resuelve las propiedades-getter con que esbuild expone
  // los exports (llegan como undefined). Por eso se importan por nombre y se copian a un objeto
  // plano `MVPCore` declarado fuera del bundle.
  const names = Object.keys(await import('../core/src/index')).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  const result = await build({
    stdin: {
      contents: `import { ${names.join(', ')} } from './index';\nObject.assign(MVPCore, { ${names.join(', ')} });`,
      resolveDir: path.join(ROOT, 'core', 'src'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    target: 'es2020',
    minifyWhitespace: true,
    minifySyntax: true,
    write: false,
    legalComments: 'none',
  });
  return 'var MVPCore = {};\n' + result.outputFiles[0].text.trim();
}

let CORE = '';
function code(name: string, position: [number, number], logic: string, extra: Record<string, unknown> = {}): Node {
  return {
    id: randomUUID(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
    parameters: {
      jsCode:
        '// ===== MVP core (generado desde core/src por scripts/build-n8n.ts — no editar aquí) =====\n' +
        CORE +
        '\n// ===== lógica del nodo =====\n' +
        logic.trim(),
    },
    ...extra,
  };
}

function http(
  name: string,
  position: [number, number],
  p: { method: 'GET' | 'POST'; path: string; body?: string },
  extra: Record<string, unknown> = {},
): Node {
  const parameters: Record<string, unknown> = {
    method: p.method,
    url: `${SUPABASE_URL}${p.path}`,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    options: { timeout: 15000 },
  };
  if (p.body) {
    parameters.sendBody = true;
    parameters.specifyBody = 'json';
    parameters.jsonBody = p.body;
  }
  return {
    id: randomUUID(),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    parameters,
    credentials: { supabaseApi: SUPABASE_CRED },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    ...extra,
  };
}

function ifNode(name: string, position: [number, number], leftValue: string, operator: Record<string, unknown>, rightValue: unknown = ''): Node {
  return {
    id: randomUUID(),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: randomUUID(), leftValue, rightValue, operator }],
        combinator: 'and',
      },
      options: {},
    },
  };
}

function respond(name: string, position: [number, number], body: string, status: string | number = 200): Node {
  return {
    id: randomUUID(),
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position,
    parameters: {
      respondWith: 'json',
      responseBody: body,
      options: { responseCode: status, responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } },
    },
  };
}

function sticky(content: string, position: [number, number], width = 420, height = 260, color = 7): Node {
  return {
    id: randomUUID(),
    name: `Note ${randomUUID().slice(0, 6)}`,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
    parameters: { content, width, height, color },
  };
}

function connect(conns: Connections, from: string, to: string, outIndex = 0) {
  conns[from] ??= { main: [] };
  while (conns[from].main.length <= outIndex) conns[from].main.push([]);
  conns[from].main[outIndex].push({ node: to, type: 'main', index: 0 });
}

function workflow(id: string, name: string, nodes: Node[], connections: Connections) {
  return {
    id,
    name,
    nodes,
    connections,
    active: false,
    settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', timezone: 'America/Bogota' },
    pinData: {},
    meta: { templateCredsSetupCompleted: false, generatedBy: 'scripts/build-n8n.ts' },
  };
}

const CONFIG_EXPR = `MVPCore.resolveConfig($('Fetch App Config').all().map((i) => i.json))`;

// --------------------------------------------------------------------------------------------
// Workflow B — Demo webhook ingestion (pipeline compartido)
// --------------------------------------------------------------------------------------------
function webhookWorkflow() {
  const c: Connections = {};
  const n: Node[] = [
    sticky(
      '## Workflow B — Ingesta (pipeline compartido)\nPOST `/webhook/student-request-demo` (payload de `data/sample_payloads.json`).\nTambién lo invoca el Workflow A (Outlook) para cada correo, de modo que ambos canales comparten exactamente el mismo pipeline.\n\n**Credenciales:** Supabase (service role) en los nodos HTTP y *n8n free OpenAI API credits* en el nodo OpenAI.\n\nLa inserción del caso, la ejecución de clasificación y el evento inicial ocurren en UNA transacción (`ingest_case`), con idempotencia por `source_message_id`.',
      [-40, -380], 620, 300, 4,
    ),
    {
      id: randomUUID(),
      name: 'Webhook: student-request-demo',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: randomUUID(),
      parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    },
    code('Trigger Payload', [220, 0], `
// El cuerpo del POST es el mensaje (contrato 10_API_AND_PAYLOAD_CONTRACTS.md §1)
const body = $input.first().json.body ?? {};
return [{ json: typeof body === 'object' && body !== null ? body : {} }];`),
    http('Fetch App Config', [440, 0], { method: 'GET', path: '/rest/v1/app_config?select=key,value' }),
    code('Normalize & Scope Check', [660, 0], `
const cfg = ${CONFIG_EXPR};
const input = $('Trigger Payload').first().json;
const startedAt = Date.now();
try {
  const msg = MVPCore.normalizeMessage(input, cfg);
  const scope = MVPCore.checkScope(msg, cfg);
  const provider = ['openai', 'mock'].includes(input.ai_provider) ? input.ai_provider : cfg.ai_provider;
  return [{ json: {
    ok: true, in_scope: scope.in_scope, scope_reason: scope.reason, msg, cfg, provider, started_at: startedAt,
    ai_system_prompt: MVPCore.AI_SYSTEM_PROMPT,
    ai_user_prompt: MVPCore.buildAiUserPrompt(msg, cfg.tz_offset_minutes),
  } }];
} catch (e) {
  return [{ json: { ok: false, in_scope: false, scope_reason: e.message,
    error: { code: e.code || 'VALIDATION_ERROR', message: e.message, retryable: false } } }];
}`),
    ifNode('In Scope?', [880, 0], '={{ $json.in_scope }}', { type: 'boolean', operation: 'true', singleValue: true }),
    http('Log Out of Scope', [1100, 220], {
      method: 'POST',
      path: '/rest/v1/ops_log',
      body: `={{ JSON.stringify({ level: 'warning', source: 'n8n', event: $json.ok ? 'out_of_scope' : 'invalid_payload', message: $json.scope_reason, context: { source_message_id: $json.msg?.source_message_id ?? null, program: $json.msg?.academic_program ?? null } }) }}`,
    }, { onError: 'continueRegularOutput' }),
    respond('Respond: Not Accepted', [1320, 220],
      `={{ JSON.stringify($('Normalize & Scope Check').first().json.ok ? { accepted: false, reason: $('Normalize & Scope Check').first().json.scope_reason } : { accepted: false, error: $('Normalize & Scope Check').first().json.error }) }}`,
      `={{ $('Normalize & Scope Check').first().json.ok ? 200 : 400 }}`),
    http('Check Duplicate', [1100, 0], {
      method: 'POST',
      path: '/rest/v1/rpc/find_case_by_source',
      body: `={{ JSON.stringify({ p_source_message_id: $json.msg.source_message_id }) }}`,
    }),
    ifNode('Is Duplicate?', [1320, 0], '={{ $json.exists }}', { type: 'boolean', operation: 'true', singleValue: true }),
    respond('Respond: Duplicate', [1540, -180],
      `={{ JSON.stringify({ accepted: true, duplicate: true, case_id: $json.case_id, case_number: $json.case_number, status: $json.status }) }}`),
    ifNode('AI Provider = OpenAI?', [1540, 0], `={{ $('Normalize & Scope Check').first().json.provider }}`, { type: 'string', operation: 'equals' }, 'openai'),
    {
      id: randomUUID(),
      name: 'OpenAI Analysis',
      type: '@n8n/n8n-nodes-langchain.openAi',
      typeVersion: 1.8,
      position: [1760, -120],
      parameters: {
        modelId: { __rl: true, value: 'gpt-4o-mini', mode: 'list', cachedResultName: 'GPT-4O-MINI' },
        messages: {
          values: [
            { content: `={{ $('Normalize & Scope Check').first().json.ai_system_prompt }}`, role: 'system' },
            { content: `={{ $('Normalize & Scope Check').first().json.ai_user_prompt }}` },
          ],
        },
        jsonOutput: true,
        options: { temperature: 0, maxTokens: 700 },
      },
      credentials: { openAiApi: OPENAI_CRED },
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 2000,
      onError: 'continueErrorOutput',
    },
    code('Mock AI Analysis', [1760, 120], `
// MockAIProvider determinístico (Demo Mode): mismo contrato de salida que OpenAI
const ctx = $('Normalize & Scope Check').first().json;
return [{ json: { __provider: 'mock', __model: 'mock-lexicon-v1', raw: MVPCore.mockAnalyze(ctx.msg, ctx.cfg) } }];`),
    code('AI Failure Fallback', [1980, -280], `
// NFR-007: si la IA falla el caso NO se pierde; se marca para revisión manual
const err = $input.first().json.error;
const message = typeof err === 'string' ? err : (err && err.message) || 'AI provider error';
return [{ json: { __provider: 'openai', __failed: true, __error: String(message).slice(0, 500) } }];`),
    code('Validate Structured Output', [2200, 0], `
const ctx = $('Normalize & Scope Check').first().json;
const cfg = ctx.cfg;
const item = $input.first().json;
let provider = item.__provider || 'openai';
let model = item.__model || cfg.openai_model;
let outcome;
if (item.__failed) {
  outcome = { ok: false, result: MVPCore.aiFailureResult(), issues: [item.__error] };
} else {
  // Salida del nodo OpenAI ({ message: { content } }) o del Mock ({ raw })
  outcome = MVPCore.validateAiOutput(item.__provider === 'mock' ? item.raw : item, cfg);
}
return [{ json: {
  ai: outcome.result,
  meta: {
    provider, model, success: outcome.ok,
    error_message: outcome.ok ? null : outcome.issues.join('; '),
    latency_ms: Date.now() - ctx.started_at,
    validation_issues: outcome.ok ? outcome.issues : [],
  },
} }];`),
    code('Business Rules', [2420, 0], `
// Motor de reglas determinista (07_BUSINESS_RULES_AND_SLA.md): la prioridad es SIEMPRE sugerida
const ctx = $('Normalize & Scope Check').first().json;
const analysis = $input.first().json;
const rules = MVPCore.applyRules(ctx.msg, analysis, ctx.cfg);
const payload = MVPCore.buildIngestPayload(ctx.msg, analysis, rules);
payload.actor = 'n8n:' + ctx.msg.source_channel;
return [{ json: { payload, rules } }];`),
    http('Insert Case (ingest_case)', [2640, 0], {
      method: 'POST',
      path: '/rest/v1/rpc/ingest_case',
      body: '={{ JSON.stringify({ p: $json.payload }) }}',
    }, { onError: 'continueErrorOutput' }),
    respond('Respond: Persistence Error', [2860, 240],
      `={{ JSON.stringify({ accepted: false, error: { code: 'DB_ERROR', message: 'Case could not be persisted; the request can be retried', retryable: true } }) }}`, 503),
    {
      id: randomUUID(),
      name: 'Fail Execution (visible in logs)',
      type: 'n8n-nodes-base.stopAndError',
      typeVersion: 1,
      position: [3080, 240],
      parameters: { errorMessage: `={{ 'Supabase ingest_case failed for ' + $('Normalize & Scope Check').first().json.msg.source_message_id }}` },
    },
    code('Evaluate Alerts', [2860, 0], `
const ctx = $('Normalize & Scope Check').first().json;
const res = $input.first().json;
const alerts = res.case && !res.duplicate ? MVPCore.evaluateAlerts([res.case], ctx.cfg, new Date()) : [];
return [{ json: { p_alerts: alerts, p_case_ids: res.case ? [res.case.id] : [] } }];`),
    http('Sync Alerts', [3080, 0], {
      method: 'POST',
      path: '/rest/v1/rpc/sync_alerts',
      body: '={{ JSON.stringify({ p_alerts: $json.p_alerts, p_case_ids: $json.p_case_ids }) }}',
    }, { onError: 'continueRegularOutput' }),
    respond('Respond: Accepted', [3300, 0],
      `={{ JSON.stringify({ accepted: true, duplicate: $('Insert Case (ingest_case)').first().json.duplicate, case_id: $('Insert Case (ingest_case)').first().json.case_id, case_number: $('Insert Case (ingest_case)').first().json.case_number, status: $('Insert Case (ingest_case)').first().json.status, suggested_priority: $('Insert Case (ingest_case)').first().json.suggested_priority, needs_human_review: $('Insert Case (ingest_case)').first().json.needs_human_review }) }}`),
  ];

  connect(c, 'Webhook: student-request-demo', 'Trigger Payload');
  connect(c, 'Trigger Payload', 'Fetch App Config');
  connect(c, 'Fetch App Config', 'Normalize & Scope Check');
  connect(c, 'Normalize & Scope Check', 'In Scope?');
  connect(c, 'In Scope?', 'Check Duplicate', 0);
  connect(c, 'In Scope?', 'Log Out of Scope', 1);
  connect(c, 'Log Out of Scope', 'Respond: Not Accepted');
  connect(c, 'Check Duplicate', 'Is Duplicate?');
  connect(c, 'Is Duplicate?', 'Respond: Duplicate', 0);
  connect(c, 'Is Duplicate?', 'AI Provider = OpenAI?', 1);
  connect(c, 'AI Provider = OpenAI?', 'OpenAI Analysis', 0);
  connect(c, 'AI Provider = OpenAI?', 'Mock AI Analysis', 1);
  connect(c, 'OpenAI Analysis', 'Validate Structured Output', 0);
  connect(c, 'OpenAI Analysis', 'AI Failure Fallback', 1);
  connect(c, 'AI Failure Fallback', 'Validate Structured Output');
  connect(c, 'Mock AI Analysis', 'Validate Structured Output');
  connect(c, 'Validate Structured Output', 'Business Rules');
  connect(c, 'Business Rules', 'Insert Case (ingest_case)');
  connect(c, 'Insert Case (ingest_case)', 'Evaluate Alerts', 0);
  connect(c, 'Insert Case (ingest_case)', 'Respond: Persistence Error', 1);
  connect(c, 'Respond: Persistence Error', 'Fail Execution (visible in logs)');
  connect(c, 'Evaluate Alerts', 'Sync Alerts');
  connect(c, 'Sync Alerts', 'Respond: Accepted');
  return workflow('mvpIngestWebhook', 'MVP · B · Ingesta webhook demo (pipeline compartido)', n, c);
}

// --------------------------------------------------------------------------------------------
// Workflow A — Outlook ingestion (credential-dependent). Reutiliza el pipeline del Workflow B.
// --------------------------------------------------------------------------------------------
function outlookWorkflow() {
  const c: Connections = {};
  const n: Node[] = [
    sticky(
      '## Workflow A — Outlook de prueba (opcional)\nRequiere credencial **Microsoft Outlook OAuth2** de una cuenta de prueba (no institucional).\nCada correo se normaliza a contrato de ingesta y se envía al pipeline compartido (Workflow B), garantizando la misma lógica, idempotencia por `internetMessageId` y manejo de errores.\n\nSi no hay credenciales, el MVP funciona igual con el Workflow B (Demo Mode).',
      [-40, -340], 600, 260, 5,
    ),
    {
      id: randomUUID(),
      name: 'Microsoft Outlook Trigger',
      type: 'n8n-nodes-base.microsoftOutlookTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, output: 'raw', filters: {}, options: {} },
      // Credencial a seleccionar en n8n (cuenta Outlook de prueba); se omite para que el JSON se importe sin errores
      ...(process.env.N8N_OUTLOOK_CREDENTIAL_ID ? { credentials: { microsoftOutlookOAuth2Api: { id: process.env.N8N_OUTLOOK_CREDENTIAL_ID, name: 'Outlook cuenta de prueba' } } } : {}),
    },
    code('Map Outlook Message', [240, 0], `
// Convierte cada mensaje de Microsoft Graph al contrato de ingesta (uno por item)
return $input.all().map((item) => {
  const m = item.json;
  const to = (m.toRecipients || []).map((r) => r.emailAddress && r.emailAddress.address).filter(Boolean);
  return { json: {
    source_message_id: m.internetMessageId || m.id,
    source_channel: 'outlook',
    sender_email: m.from && m.from.emailAddress ? m.from.emailAddress.address : (m.sender && m.sender.emailAddress ? m.sender.emailAddress.address : null),
    recipient_email: to[0] || null,
    academic_program: null,
    subject: m.subject || '',
    body: (m.body && m.body.content) || m.bodyPreview || '',
    received_at: m.receivedDateTime || new Date().toISOString(),
  } };
});`),
    {
      id: randomUUID(),
      name: 'Send to Shared Pipeline',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [480, 0],
      parameters: {
        method: 'POST',
        url: `${WEBHOOK_BASE}/webhook/${WEBHOOK_PATH}`,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}',
        options: { timeout: 60000, response: { response: { neverError: true } } },
      },
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
    },
  ];
  connect(c, 'Microsoft Outlook Trigger', 'Map Outlook Message');
  connect(c, 'Map Outlook Message', 'Send to Shared Pipeline');
  return workflow('mvpIngestOutlook', 'MVP · A · Ingesta Outlook (opcional)', n, c);
}

// --------------------------------------------------------------------------------------------
// Workflow C — Follow-up / SLA alerts
// --------------------------------------------------------------------------------------------
function followupWorkflow() {
  const c: Connections = {};
  const n: Node[] = [
    sticky(
      '## Workflow C — Seguimiento y SLA\nCada hora (o manual): consulta casos abiertos, calcula SLA de primera revisión, próximos a vencer/vencidos, 2 días hábiles sin gestión, fechas límite < 24 h y sensibles pendientes. `sync_alerts` evita duplicados y resuelve las que ya no aplican.',
      [-40, -300], 560, 220, 6,
    ),
    {
      id: randomUUID(),
      name: 'Every Hour',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } },
    },
    {
      id: randomUUID(),
      name: 'Manual Run',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 180],
      parameters: {},
    },
    http('Fetch App Config', [240, 80], { method: 'GET', path: '/rest/v1/app_config?select=key,value' }, { executeOnce: true }),
    http('Get Open Cases', [480, 80], { method: 'POST', path: '/rest/v1/rpc/get_open_cases_for_alerts', body: '={{ JSON.stringify({}) }}' }, { executeOnce: true }),
    code('Compute Alerts', [720, 80], `
const cfg = ${CONFIG_EXPR};
const cases = $input.first().json.cases || [];
const alerts = MVPCore.evaluateAlerts(cases, cfg, new Date());
return [{ json: { p_alerts: alerts, p_case_ids: cases.map((x) => x.id), evaluated: cases.length } }];`),
    http('Sync Alerts', [960, 80], {
      method: 'POST',
      path: '/rest/v1/rpc/sync_alerts',
      body: '={{ JSON.stringify({ p_alerts: $json.p_alerts, p_case_ids: $json.p_case_ids }) }}',
    }),
  ];
  connect(c, 'Every Hour', 'Fetch App Config');
  connect(c, 'Manual Run', 'Fetch App Config');
  connect(c, 'Fetch App Config', 'Get Open Cases');
  connect(c, 'Get Open Cases', 'Compute Alerts');
  connect(c, 'Compute Alerts', 'Sync Alerts');
  return workflow('mvpFollowupAlerts', 'MVP · C · Seguimiento y alertas SLA', n, c);
}

// --------------------------------------------------------------------------------------------
// Error handler — registra fallos de cualquier workflow en ops_log (NFR-013)
// --------------------------------------------------------------------------------------------
function errorWorkflow() {
  const c: Connections = {};
  const n: Node[] = [
    sticky('## Error handler\nConfigúrelo como *Error Workflow* en Settings de los workflows A, B y C. Registra el fallo en `ops_log` (visible en /admin) además del historial de ejecuciones de n8n.', [-40, -240], 520, 180, 3),
    { id: randomUUID(), name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    code('Build Log Entry', [240, 0], `
const e = $input.first().json;
return [{ json: { level: 'error', source: 'n8n', event: 'workflow_error',
  message: String((e.execution && e.execution.error && e.execution.error.message) || 'unknown error').slice(0, 500),
  context: { workflow: e.workflow && e.workflow.name, execution_id: e.execution && e.execution.id,
             last_node: e.execution && e.execution.lastNodeExecuted, url: e.execution && e.execution.url, retryable: true } } }];`),
    http('Insert ops_log', [480, 0], { method: 'POST', path: '/rest/v1/ops_log', body: '={{ JSON.stringify($json) }}' }),
  ];
  connect(c, 'Error Trigger', 'Build Log Entry');
  connect(c, 'Build Log Entry', 'Insert ops_log');
  return workflow('mvpErrorHandler0', 'MVP · Error handler', n, c);
}

async function main() {
  CORE = await bundleCore();
  mkdirSync(OUT_DIR, { recursive: true });
  const files: Array<[string, unknown]> = [
    ['workflow_ingest_webhook.json', webhookWorkflow()],
    ['workflow_ingest_outlook.json', outlookWorkflow()],
    ['workflow_followup_alerts.json', followupWorkflow()],
    ['workflow_error_handler.json', errorWorkflow()],
  ];
  for (const [file, wf] of files) {
    writeFileSync(path.join(OUT_DIR, file), JSON.stringify(wf, null, 2) + '\n', 'utf8');
    console.log(`✓ ${path.relative(ROOT, path.join(OUT_DIR, file))}`);
  }
  console.log(`  Supabase URL: ${SUPABASE_URL}\n  Webhook base (Outlook -> pipeline): ${WEBHOOK_BASE}\n  core bundle: ${(CORE.length / 1024).toFixed(1)} KB por nodo Code`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
