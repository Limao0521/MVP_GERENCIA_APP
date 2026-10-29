# 10 — Contratos de API y payloads

## 1. Demo ingestion

`POST /webhook/student-request-demo`

```json
{
  "source_message_id": "demo-001",
  "source_channel": "demo",
  "sender_email": "estudiante001@example.edu",
  "recipient_email": "director.informatica@example.edu",
  "academic_program": "Ingeniería Informática",
  "subject": "Cancelación antes de fecha límite",
  "body": "Necesito cancelar una materia antes de mañana...",
  "received_at": "2026-10-09T09:00:00-05:00"
}
```

Response recomendado:

```json
{
  "accepted": true,
  "case_id": "uuid",
  "case_number": "CASE-0001",
  "status": "received"
}
```

## 2. AI contract

Ver `06_AI_ANALYSIS_SPEC.md`.

## 3. Rule engine input

```json
{
  "received_at": "...",
  "category": "Matrícula",
  "urgency": "high",
  "impact": "high",
  "deadline": "...",
  "confidence": 0.91,
  "sensitive": false
}
```

Output:

```json
{
  "suggested_priority": "urgent",
  "needs_human_review": false,
  "rule_hits": ["PRIORITY-03", "PRIORITY-05"]
}
```

## 4. Case update

Puede implementarse directamente con Supabase o con API.

Contrato lógico:

```json
{
  "field": "current_priority",
  "new_value": "high",
  "actor": "director-demo"
}
```

Debe generar event.

## 5. Métricas

Vista/query mínima:

```json
{
  "total_received": 100,
  "pending": 20,
  "closed": 80,
  "urgent_open": 4,
  "overdue": 3,
  "sla_compliance_percent": 91.0,
  "override_rate_percent": 12.0
}
```

## 6. Errores

Formato consistente:

```json
{
  "error": {
    "code": "AI_PROVIDER_ERROR",
    "message": "Classification could not be completed",
    "retryable": true
  }
}
```
