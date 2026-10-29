# 06 — Especificación del análisis con IA

## Objetivo

Transformar texto no estructurado en datos estructurados. La IA **no decide** la prioridad final ni resuelve la solicitud.

## Input

```json
{
  "subject": "...",
  "body": "...",
  "received_at": "ISO-8601",
  "academic_program": "..."
}
```

## Output obligatorio

```json
{
  "category": "Matrícula",
  "summary": "Resumen breve y factual",
  "urgency": "high",
  "impact": "high",
  "deadline": "2026-10-10T23:59:59-05:00",
  "deadline_explicit": true,
  "suggested_responsible": "Director de programa",
  "sensitive": false,
  "sensitive_reason": null,
  "confidence": 0.91,
  "needs_human_review": false,
  "reasoning_summary": "Fecha límite explícita y posible impacto académico."
}
```

## Categorías válidas

- Matrícula
- Asignaturas
- Requisitos académicos
- Prácticas profesionales
- Fechas y plazos
- Situaciones académicas particulares
- Solicitudes generales
- Otros

No inventar nuevas categorías durante runtime del MVP. Si no encaja, usar `Otros`.

## Urgency

`critical | high | medium | low | unknown`

## Impact

`high | medium | low | unknown`

## Detección de sensibilidad

Marcar `sensitive=true` ante señales de:
- información médica;
- disciplinaria;
- financiera;
- documentos de identidad;
- otros datos que requieran tratamiento especial.

No exponer ni repetir innecesariamente detalles sensibles en el resumen.

## Confidence

Debe representar confianza del extractor/clasificador, no "probabilidad real".

Parámetro propuesto:
`AI_LOW_CONFIDENCE_THRESHOLD=0.70`

Si `confidence < threshold`:
- `needs_human_review=true`;
- no se debe ocultar el caso;
- la prioridad sigue siendo sugerida/conservadora.

## Prompt base para OpenAI

```text
SYSTEM:
You are a structured triage assistant for an academic operations MVP.
You do not make academic decisions and you do not answer the student.
Your only task is to extract structured operational attributes.

Use only the allowed categories.
Return valid JSON matching the required schema.
If information is ambiguous, lower confidence and request human review.
If sensitive information is present, flag it and avoid reproducing unnecessary sensitive details.

USER:
Subject: {{subject}}
Body: {{body}}
Received at: {{received_at}}
Academic program: {{academic_program}}
```

## Recomendación técnica

Usar Structured Outputs / JSON Schema cuando el SDK/modelo elegido lo permita.

## Mock AI Provider

Para Demo Mode, Claude debe implementar un proveedor determinístico que use reglas simples/fixtures y devuelva exactamente el mismo contrato. Esto garantiza pruebas reproducibles sin depender de un API externo.

## Error de IA

Si la llamada falla:

```json
{
  "category": "Otros",
  "summary": "Classification unavailable",
  "urgency": "unknown",
  "impact": "unknown",
  "deadline": null,
  "deadline_explicit": false,
  "suggested_responsible": null,
  "sensitive": false,
  "confidence": 0,
  "needs_human_review": true,
  "reasoning_summary": "AI provider unavailable."
}
```

El caso debe persistirse igualmente.
