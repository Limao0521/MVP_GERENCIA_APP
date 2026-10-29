# Workflows n8n (n8n Cloud)

| Archivo | Workflow | Trigger | Estado requerido |
|---|---|---|---|
| `workflow_ingest_webhook.json` | **B · Ingesta webhook demo (pipeline compartido)** | `POST /webhook/student-request-demo` | Publicado (obligatorio) |
| `workflow_followup_alerts.json` | **C · Seguimiento y alertas SLA** | Cada hora + ejecución manual | Publicado |
| `workflow_ingest_outlook.json` | **A · Ingesta Outlook (opcional)** | Microsoft Outlook Trigger (cada minuto) | Sólo con credenciales de una cuenta **de prueba** |
| `workflow_error_handler.json` | **Error handler** | Error Trigger | Asignarlo como *Error Workflow* de A, B y C |

Los JSON se **generan** con `npm run build:n8n` a partir de `core/src`: la lógica de los nodos Code (normalización,
validación del contrato IA, Mock IA, motor de reglas, alertas) es exactamente el código cubierto por `npm test`.
No edite los nodos Code a mano; cambie `core/` y regenere.

## Pipeline del Workflow B

```
Webhook → Trigger Payload → Fetch App Config (Supabase) → Normalize & Scope Check → In Scope?
   ├─ no → Log Out of Scope (ops_log) → Respond: Not Accepted (200 accepted:false | 400 error)
   └─ sí → Check Duplicate (rpc find_case_by_source) → Is Duplicate?
            ├─ sí → Respond: Duplicate
            └─ no → AI Provider = OpenAI?
                     ├─ sí → OpenAI Analysis (gpt-4o-mini, JSON, temp 0, 2 intentos)
                     │        └─ error → AI Failure Fallback
                     └─ no → Mock AI Analysis
                     → Validate Structured Output → Business Rules
                     → Insert Case (rpc ingest_case: caso + classification_run + eventos, transaccional e idempotente)
                        ├─ error → Respond: Persistence Error (503, retryable) → Fail Execution (queda en el log de ejecuciones)
                        └─ ok → Evaluate Alerts → Sync Alerts → Respond: Accepted
```

Respuesta (contrato §1): `{"accepted":true,"duplicate":false,"case_id":"…","case_number":"CASE-0034","status":"classified","suggested_priority":"urgent","needs_human_review":false}`

## Despliegue automatizado (usado en este proyecto)

`npm run cloud:n8n` (`scripts/cloud/n8n-deploy.ts`): con la sesión de n8n abierta en Edge (`--remote-debugging-port=9222`) crea la credencial Supabase, genera los workflows con las URLs cloud, los crea/actualiza, asigna el Error workflow y publica B y C.

## Importar en n8n Cloud (manual)

1. **Generar** los JSON con sus URLs:
   ```bash
   npm run build:n8n -- --supabase-url https://<ref>.supabase.co --webhook-base https://<instancia>.app.n8n.cloud
   ```
2. **Credenciales** (Overview → Credentials → Create):
   - *Supabase API*: Host = `https://<ref>.supabase.co`, Service Role Secret = service role key del proyecto.
     Nómbrela `Supabase MVP (service role)`.
   - *OpenAI*: el nodo *OpenAI Analysis* ya viene configurado con **Gateway credits** de n8n Cloud (no requiere API key propia).
     Los trials actuales ya no emiten "free OpenAI API credits"; para usar una credencial propia genere con
     `--openai-credential-id <id>`.
3. **Importar**: Workflows → *Import from File* → cada JSON de esta carpeta.
4. **Asignar credenciales**: abra cada nodo HTTP (Supabase) y el nodo *OpenAI Analysis* y seleccione la credencial
   (si no quedó enlazada automáticamente por nombre).
5. **Error workflow**: en *Settings* de A, B y C seleccione `MVP · Error handler`.
6. **Publicar/activar** B y C (y A si conectó Outlook).
7. **Probar**:
   ```bash
   npm run smoke:n8n -- --url https://<instancia>.app.n8n.cloud/webhook/student-request-demo --provider openai
   ```
   o desde la app: `/demo` → *Send to n8n webhook*.

## Proveedor de IA

- Por defecto `app_config.ai_provider = "openai"` (editable en `/admin`).
- Cada solicitud puede forzarlo con `"ai_provider": "mock" | "openai"` (útil para comparar o si se agotan los créditos).
- Si OpenAI falla (sin créditos, timeout, JSON inválido) el caso **se crea igual** con `needs_human_review=true`,
  estado `received` y una `classification_run` con `success=false` y el error (NFR-007, AT-011).
- El prompt (en `core/src/aiContract.ts`) trata el correo como **datos no confiables** y exige JSON estricto; la salida
  se valida contra el contrato y las categorías desconocidas se mapean a `Otros`.

## Outlook (Workflow A, opcional)

1. Cree la credencial *Microsoft Outlook OAuth2 API* con una cuenta **de prueba** (nunca institucional sin autorización).
2. En el nodo *Microsoft Outlook Trigger* seleccione la credencial y, si desea, una carpeta/filtro.
3. El nodo *Map Outlook Message* convierte el mensaje Graph al contrato de ingesta
   (`source_message_id = internetMessageId`, `source_channel = "outlook"`) y lo envía al Workflow B,
   de modo que ambos canales comparten exactamente el mismo pipeline, idempotencia y manejo de errores.
4. El programa se deduce del buzón destinatario (`app_config.program_by_recipient`); los correos fuera del piloto se registran
   en `ops_log` y no crean caso.

Sin credenciales de Outlook el MVP funciona completo con el Workflow B (Demo Mode).

## Prueba local con Docker

`bash scripts/n8n-local.sh` levanta n8n en `http://localhost:5678`, importa la credencial de Supabase local y publica B y C.
El nodo OpenAI no tiene credencial en local: las solicitudes `ai_provider: "openai"` ejercitan el **fallback** de fallo de IA.
