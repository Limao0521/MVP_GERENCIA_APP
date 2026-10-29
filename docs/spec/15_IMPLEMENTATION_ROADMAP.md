# 15 — Roadmap de implementación

## Sprint 0 — Scaffold
- repo;
- React TS;
- Supabase schema;
- env;
- lint/tests;
- documentación inicial.

**Exit:** frontend conecta con DB.

## Sprint 1 — Cases
- schema;
- seed;
- listado;
- detalle;
- create demo case.

**Exit:** caso visible end-to-end sin IA.

## Sprint 2 — IA
- OpenAI adapter;
- mock adapter;
- schema validation;
- fixtures.

**Exit:** texto produce JSON válido.

## Sprint 3 — Rules
- priority engine;
- SLA;
- sensitive;
- low-confidence;
- unit tests.

**Exit:** 100 % tests reglas clave.

## Sprint 4 — n8n
- webhook;
- Outlook optional;
- AI;
- rules;
- persistence;
- error handling.

**Exit:** webhook crea caso completo.

## Sprint 5 — Human workflow
- override;
- status;
- reassignment;
- timeline.

**Exit:** cambio manual auditado.

## Sprint 6 — Alerts/KPIs
- SLA worker;
- alerts;
- dashboard.

**Exit:** caso vencido genera alerta y KPI.

## Sprint 7 — Validation
- synthetic dataset;
- evaluation script;
- acceptance tests;
- bugfix.

## Sprint 8 — Delivery
- deployment;
- README;
- video evidence;
- screenshots;
- chapter support.

## Regla para Claude

No implementar P2 antes de cerrar todos los P0.
