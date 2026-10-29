# 08 — Workflows n8n

Claude debe entregar JSON importable de n8n.

## Workflow A — Outlook ingestion

Archivo esperado:
`n8n/workflow_ingest_outlook.json`

### Nodes lógicos

1. Microsoft Outlook Trigger
2. Normalize Message
3. Scope Check
4. Determine Academic Program
5. Generate/prepare case identifier
6. AI Analysis
7. Validate Structured Output
8. Business Rules
9. Insert Case in Supabase
10. Insert Classification Run
11. Create Initial Event
12. Evaluate Alert
13. Error Handler

### Requisitos

- credenciales referenciadas, nunca embebidas;
- body y subject normalizados;
- timeout;
- retries razonables;
- errores persistidos/logueados;
- idempotencia usando message_id cuando sea posible.

## Workflow B — Demo webhook ingestion

Archivo:
`n8n/workflow_ingest_webhook.json`

Trigger:
`POST /webhook/student-request-demo`

Payload según `sample_payloads.json`.

Debe reutilizar el mismo pipeline lógico que Outlook.

## Workflow C — Follow-up/SLA

Archivo:
`n8n/workflow_followup_alerts.json`

Trigger cron propuesto:
cada hora durante demo o manual.

Pasos:

1. consultar casos activos;
2. calcular SLA;
3. detectar próximos a vencer/vencidos;
4. detectar 2 días sin gestión;
5. insertar/actualizar alerta;
6. evitar alertas duplicadas.

## Workflow D — Optional classification subflow

Si facilita mantenimiento:
`workflow_classify_case.json`

Input:
normalized message.

Output:
AI structured result + priority result.

## Idempotencia

Definir `source_message_id`.
Antes de crear:
- buscar existente;
- si existe, no duplicar.

## Error strategy

- AI error: crear caso con revisión humana.
- Supabase error: workflow falla y conserva contexto en logs.
- malformed output: parse fallback + review flag.
- unknown category: map a `Otros`.

## Importación

`n8n/README.md` debe explicar:

1. importar JSON;
2. crear credenciales;
3. configurar variables;
4. activar workflow;
5. probar webhook;
6. conectar Outlook opcionalmente.
