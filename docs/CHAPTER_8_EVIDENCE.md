# Evidencia para el Capítulo 8

## Capturas

Versión desplegada (Vercel + n8n Cloud + OpenAI real): `evidence/screenshots-cloud/` (mismos nombres). Versión local: `evidence/screenshots/`.

Generadas por `npm run test:e2e`:

| # | Archivo | Uso sugerido (spec 14) |
|---|---|---|
| 1 | `01_dashboard.png` | 8.1 Dashboard |
| 2 | `02_demo_injector_resultado.png` | 8.1 flujo principal / Demo Mode |
| 3 | `03_bandeja_priorizada.png` | 8.1 Bandeja priorizada |
| 4 | `04_caso_urgente_detalle.png` | 8.1 Caso urgente (análisis IA, reglas) |
| 5 | `05_caso_override_timeline.png` | 8.1 Caso con override |
| 6 | `06_caso_cerrado_auditoria.png` | 8.1 Timeline/auditoría completa |
| 7 | `07_alertas_sla.png` | 8.1 Alerta de SLA |
| 8 | `08_metricas_dashboard.png` | 8.1 Métricas |
| 9 | `09_caso_sensible_revision_humana.png` | 8.1 Caso sensible / revisión humana |
| 10 | `10_administracion.png` | 8.2 Configuración (SLA, umbrales, log) |

Capturas que conviene tomar durante la grabación (ver `docs/DEMO_SCRIPT.md`):
- Canvas del Workflow B en n8n Cloud y una ejecución exitosa con OpenAI (8.2 diagrama n8n).
- Table Editor de Supabase con `cases`, `case_events`, `classification_runs` (8.2 tablas).
- App desplegada en Vercel (8.3).

## Resultados (8.4)

- `evidence/evaluation/mock-local_latest_report.md` — Mock + reglas (valida pipeline; **no** es evidencia de calidad NLP).
- `evidence/evaluation/n8n-mock_latest_report.md` — mismo dataset a través de n8n + Supabase: confirma que n8n ejecuta el mismo código, trazabilidad 100 % y prevención de duplicados 5/5.
- `evidence/evaluation/n8n-openai-promptv2_latest_report.md` — **evaluación real con OpenAI (gpt-4o-mini) en n8n Cloud + Supabase Cloud**: 3 corridas: category 90,6–93,8 %, priority 81,3 %, urgent recall 100 %, sensitive recall 100 %, trazabilidad 100 %, duplicados 5/5, latencia ≈ 1,9 s.
- `evidence/evaluation/n8n-openai-promptv1_latest_report.md` — misma evaluación con el prompt inicial (priority 50 %): muestra la mejora y que la calibración no usó el split de evaluación.
- Pruebas: `evidence/test-results/*.txt` y reporte HTML de Playwright en `evidence/e2e-report/`.

No se debe afirmar que las metas AS-IS → TO-BE (p. ej. reducción de 3,8 días de primera revisión) fueron alcanzadas:
el MVP sólo mide tiempos sobre datos sintéticos en la demo.

## Material para 8.2 (desarrollo técnico)

- Arquitectura: `docs/ARCHITECTURE.md` (diagrama Mermaid).
- Decisiones: `docs/ENGINEERING_DECISIONS.md`.
- Tablas: `supabase/README.md`.
- IA y reglas: `core/src/aiContract.ts` (prompt y contrato), `core/src/rules.ts`.
- n8n: `n8n/README.md`.
