# Estado de implementación (P0 / P1 / P2)

Verificado el 2026-10-09 en local (Supabase y n8n en Docker) **y en la nube** (Supabase Cloud, n8n Cloud, Vercel, OpenAI real vía Gateway credits).
Salidas en `evidence/test-results/`.

| Suite | Local | Nube |
|---|---|---|
| Unitarias `npm test` | 43/43 ✓ | — |
| Aceptación AT-001…AT-018 `npm run test:integration` (RLS real) | 18/18 ✓ | 18/18 ✓ (Supabase Cloud) |
| E2E Playwright (demo → bandeja → override → cierre; sensible; admin) | 3/3 ✓ | 3/3 ✓ (Vercel + n8n Cloud + OpenAI) |
| Smoke webhook n8n (nuevo, duplicado, fuera de alcance, inválido) | 4/4 ✓ | 4/4 ✓ con `openai` y con `mock` |
| Workflow C (alertas) | ✓ | ✓ manual y por trigger horario |
| Fallo de IA a través de n8n | ✓ caso guardado, revisión humana | — |
| Typecheck + build de producción | ✓ | ✓ (build en Vercel) |

Evaluación real con OpenAI (`npm run eval:n8n -- --provider openai`, prompt v2, 32 casos, 3 corridas independientes):
category accuracy 90,6–93,8 % · priority accuracy 81,3 % (las 3) · urgent recall 100 % · sensitive recall 100 % · trazabilidad 100 % ·
duplicados 5/5 · latencia media ≈ 1,9 s. Reportes en `evidence/evaluation/n8n-openai-promptv2_*` (y v1 para comparación).

## P0 — obligatorio

| Requisito | Estado | Evidencia |
|---|---|---|
| Crear caso desde mensaje de prueba | ✓ | AT-001, smoke n8n, E2E |
| ID único (`CASE-0001`) | ✓ | AT-001 |
| Persistencia Supabase/PostgreSQL | ✓ | migraciones + integración |
| Clasificación temática | ✓ | AT-002, evaluación |
| Resumen | ✓ | contrato IA, detalle de caso |
| Fecha límite | ✓ | `extractDeadline` (Mock) / OpenAI; PRIORITY-02/03/04 |
| Urgencia, impacto | ✓ | contrato IA |
| Prioridad sugerida (reglas) | ✓ | 16 pruebas del motor de reglas |
| Confianza + bandera de revisión humana | ✓ | AT-005, PRIORITY-09 |
| Responsable/programa sugerido | ✓ | `responsible_by_category`, asignación por programa |
| Caso sensible | ✓ | AT-004, E2E sensible |
| Bandeja React + filtros (prioridad, categoría, estado, programa, responsable, fechas, revisión, sensible) + orden | ✓ | AT-014, E2E |
| Detalle de caso | ✓ | E2E (captura 04) |
| Override de prioridad y categoría | ✓ | AT-006 |
| Reasignación | ✓ | `update_case(assigned_to)` + auditoría |
| Cambio de estado con transiciones válidas | ✓ | AT-007, FR-041 |
| Historial/auditoría inmutable | ✓ | AT-008, prueba de inmutabilidad |
| Alertas internas (ALERT-001…005) | ✓ | AT-009, AT-010, Workflow C |
| Dashboard de KPIs | ✓ | AT-013, captura 08 |
| Dataset sintético + evaluación | ✓ | `npm run eval`, `evidence/evaluation` |
| Pruebas funcionales | ✓ | arriba |
| Workflow n8n importable | ✓ | `n8n/*.json`, importados y ejecutados en n8n 2.42.6 |
| Instrucciones de instalación/ejecución | ✓ | README |
| Demo Mode | ✓ | AT-016, Mock en n8n y en navegador |

## P1 — recomendado

| Requisito | Estado | Nota |
|---|---|---|
| Outlook de prueba como trigger real | ⚠ Implementado, **dependiente de credenciales** | Workflow A importable; requiere OAuth de una cuenta de prueba. Sin ella, Workflow B cubre el flujo. |
| Webhook manual alternativo | ✓ | Workflow B |
| Notificación visual SLA cercano/vencido | ✓ | badge SLA en bandeja/detalle, página Alertas |
| Configuración editable de SLA | ✓ | `/admin` |
| Registro de ejecución del clasificador | ✓ | `classification_runs` (proveedor, modelo, latencia, errores) |
| Métrica de override humano | ✓ | `case_metrics.override_rate_percent` |
| RLS básica | ✓ | AT-018 |
| Pruebas unitarias del motor de reglas | ✓ | `core/tests/rules.test.ts` |
| Pruebas E2E del flujo principal | ✓ | `tests/e2e/mvp.spec.ts` |

## P2 — futuro (no implementado, por diseño)

Teams real, Entra ID, cuentas institucionales, respuestas automáticas al estudiante, SIGA, modelos entrenados con datos
institucionales, operación 24/7, HA/backups/observabilidad institucional. La arquitectura los deja como extensiones:
Teams entraría como otro canal hacia el Workflow B (mismo contrato); Entra ID reemplazaría Supabase Auth manteniendo `profiles`/RLS.

## Pendiente / dependiente de credenciales

- Outlook (Workflow A): importado e inactivo; requiere una cuenta Outlook **de prueba**. La entrada real de la demo es el webhook de n8n Cloud.
