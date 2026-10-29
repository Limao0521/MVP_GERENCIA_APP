# 05 — Modelo de datos

## Entidades principales

### `cases`

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| case_number | text | identificador legible |
| source_channel | enum/text | outlook/demo/teams |
| sender_email | text | remitente |
| recipient_email | text | destinatario |
| academic_program | text | programa |
| subject | text | asunto |
| message_body | text | contenido necesario |
| category | text | categoría |
| suggested_priority | text | resultado de reglas |
| current_priority | text | prioridad vigente |
| ai_confidence | numeric | 0..1 |
| ai_summary | text | resumen |
| detected_deadline | timestamptz/null | fecha detectada |
| suggested_responsible | text/null | sugerencia |
| assigned_to | text/null | responsable actual |
| status | text | workflow |
| sensitive | boolean | caso sensible |
| needs_human_review | boolean | requiere revisión |
| received_at | timestamptz | recepción |
| first_reviewed_at | timestamptz/null | primera revisión |
| resolved_at | timestamptz/null | resolución |
| closed_at | timestamptz/null | cierre |
| created_at | timestamptz | creación |
| updated_at | timestamptz | cambio |

### `case_events`

Historial inmutable.

Campos:
- id
- case_id
- event_type
- actor_id / actor_label
- field_name
- old_value
- new_value
- metadata
- created_at

### `classification_runs`

Conservar evidencia del análisis:

- case_id
- provider
- model
- raw_output opcional/sanitizado
- parsed_category
- urgency_signal
- impact
- detected_deadline
- confidence
- sensitive
- success
- error_message
- latency_ms
- created_at

### `alerts`

- case_id
- alert_type
- severity
- message
- triggered_at
- acknowledged_at
- acknowledged_by
- active

### `sla_config`

- priority
- first_review_business_hours/days
- enabled

Valores iniciales según proyecto:

| Prioridad | primera revisión |
|---|---|
| Urgente | mismo día hábil |
| Alta | máximo 1 día hábil |
| Media | máximo 2 días hábiles |
| Baja | máximo 5 días hábiles |

### `categories`

Permite que administración modifique catálogo.

### `profiles/users`

Para MVP puede ser simplificado. Debe permitir:
- director;
- administrative;
- admin;
- IT.

## Reglas de modelado

- `suggested_priority` nunca se sobrescribe por un override.
- `current_priority` representa la decisión operativa actual.
- Toda modificación a campos auditables genera `case_event`.
- No eliminar eventos desde UI.
- Evitar almacenar adjuntos en el MVP salvo necesidad explícita.
