# Evaluación del dataset sintético — mock-local

- Ejecutado: 2026-10-09T22:45:06.883Z
- Proveedor IA: mock
- Referencia de recepción para plazos relativos: 2026-10-06T09:00:00-05:00
- Umbral de confianza: 0.7

> **Advertencia metodológica:** el léxico del MockAIProvider fue escrito con acceso a todo el dataset; estas cifras validan el pipeline y el motor de reglas, no la calidad de NLP.

## Métricas

| Métrica | Total | Development (001–016) | Evaluation (017–032) |
|---|---:|---:|---:|
| cases | 32 | 16 | 16 |
| category_accuracy_pct | 96.9 | 100 | 93.8 |
| priority_accuracy_pct | 93.8 | 93.8 | 93.8 |
| priority_within_one_level_pct | 100 | 100 | 100 |
| urgent_recall_pct | 100 | 100 | 100 |
| urgent_precision_pct | 100 | 100 | 100 |
| sensitive_recall_pct | 100 | 100 | 100 |
| sensitive_false_positives | 0 | 0 | 0 |
| human_review_recall_pct | 100 | 100 | 100 |
| human_review_flagged_total | 8 | 4 | 4 |
| ai_failures | 0 | 0 | 0 |
| avg_latency_ms | 0 | 1 | 0 |
| max_latency_ms | 4 | 4 | 1 |
| traceability_completeness_pct | — | — | — |
| routing_accuracy | N/A — el dataset no incluye responsable esperado | N/A — el dataset no incluye responsable esperado | N/A — el dataset no incluye responsable esperado |

Criterios técnicos sugeridos (no oficiales): category accuracy ≥ 80 %, urgent recall ≥ 90 %, sensitive recall = 100 %.

## Esperado vs. predicho

| ID | Split | Categoría esperada | Predicha | Prioridad esperada | Predicha | Sensible E/P | Revisión E/P | Conf. | Reglas |
|---|---|---|---|---|---|---|---|---:|---|
| SYN-001 | dev | Matrícula | ✓ | urgent | ✓ | N/N | N/N | 0.75 | PRIORITY-03 PRIORITY-05 |
| SYN-002 | dev | Asignaturas | ✓ | medium | ✓ | N/N | N/N | 0.94 | PRIORITY-10-BASELINE |
| SYN-003 | dev | Prácticas profesionales | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-004 | dev | Fechas y plazos | ✓ | high | ✗ medium | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-005 | dev | Requisitos académicos | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-006 | dev | Solicitudes generales | ✓ | low | ✓ | N/N | N/N | 0.95 | PRIORITY-07 |
| SYN-007 | dev | Matrícula | ✓ | urgent | ✓ | N/N | N/N | 0.95 | PRIORITY-02 PRIORITY-06 PRIORITY-05 |
| SYN-008 | dev | Asignaturas | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-009 | dev | Situaciones académicas particulares | ✓ | high | ✓ | S/S | S/S | 0.95 | PRIORITY-01 AI-REVIEW-FLAG |
| SYN-010 | dev | Solicitudes generales | ✓ | low | ✓ | N/N | N/N | 0.9 | PRIORITY-07 |
| SYN-011 | dev | Requisitos académicos | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-012 | dev | Prácticas profesionales | ✓ | urgent | ✓ | N/N | N/N | 0.9 | PRIORITY-02 PRIORITY-06 PRIORITY-05 |
| SYN-013 | dev | Matrícula | ✓ | high | ✓ | S/S | S/S | 0.95 | PRIORITY-01 AI-REVIEW-FLAG |
| SYN-014 | dev | Asignaturas | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-015 | dev | Otros | ✓ | medium | ✓ | N/N | S/S | 0.3 | PRIORITY-08 PRIORITY-09 AI-REVIEW-FLAG |
| SYN-016 | dev | Otros | ✓ | medium | ✓ | S/S | S/S | 0.3 | PRIORITY-01 PRIORITY-10-BASELINE PRIORITY-09 AI-REVIEW-FLAG |
| SYN-017 | eva | Prácticas profesionales | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-018 | eva | Fechas y plazos | ✗ Requisitos académicos | high | ✓ | N/N | N/N | 0.71 | PRIORITY-04 PRIORITY-05 |
| SYN-019 | eva | Solicitudes generales | ✓ | low | ✓ | N/N | N/N | 0.9 | PRIORITY-07 |
| SYN-020 | eva | Requisitos académicos | ✓ | urgent | ✓ | N/N | N/N | 0.95 | PRIORITY-03 PRIORITY-06 PRIORITY-05 |
| SYN-021 | eva | Asignaturas | ✓ | medium | ✓ | N/N | N/N | 0.94 | PRIORITY-10-BASELINE |
| SYN-022 | eva | Situaciones académicas particulares | ✓ | high | ✓ | S/S | S/S | 0.95 | PRIORITY-01 AI-REVIEW-FLAG |
| SYN-023 | eva | Solicitudes generales | ✓ | medium | ✗ low | N/N | N/N | 0.95 | PRIORITY-07 |
| SYN-024 | eva | Matrícula | ✓ | high | ✓ | N/N | N/N | 0.92 | PRIORITY-04 PRIORITY-05 |
| SYN-025 | eva | Prácticas profesionales | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-026 | eva | Fechas y plazos | ✓ | urgent | ✓ | N/N | S/S | 0.86 | PRIORITY-02 PRIORITY-02-EXPIRED PRIORITY-05 |
| SYN-027 | eva | Asignaturas | ✓ | low | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-028 | eva | Requisitos académicos | ✓ | medium | ✓ | N/N | N/N | 0.95 | PRIORITY-10-BASELINE |
| SYN-029 | eva | Solicitudes generales | ✓ | low | ✓ | N/N | N/N | 0.9 | PRIORITY-07 |
| SYN-030 | eva | Situaciones académicas particulares | ✓ | high | ✓ | S/S | S/S | 0.95 | PRIORITY-01 PRIORITY-05 AI-REVIEW-FLAG |
| SYN-031 | eva | Matrícula | ✓ | urgent | ✓ | N/N | N/S | 0.67 | PRIORITY-02 PRIORITY-09 AI-REVIEW-FLAG |
| SYN-032 | eva | Otros | ✓ | low | ✓ | N/N | N/N | 0.9 | PRIORITY-10-BASELINE |
