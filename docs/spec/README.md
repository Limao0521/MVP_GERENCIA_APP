# Claude Implementation Pack — Functional MVP
## IT Operations Management — Universidad de La Sabana

Este paquete convierte el análisis del proyecto académico en una especificación ejecutable para que Claude implemente el **Capítulo 8 — Functional MVP** sin reinterpretar el alcance.

## Orden de lectura recomendado

1. `00_SOURCE_ANALYSIS.md`
2. `01_MVP_SCOPE_AND_DOD.md`
3. `02_FUNCTIONAL_REQUIREMENTS.md`
4. `03_NON_FUNCTIONAL_REQUIREMENTS.md`
5. `04_ARCHITECTURE.md`
6. `05_DATA_MODEL.md`
7. `06_AI_ANALYSIS_SPEC.md`
8. `07_BUSINESS_RULES_AND_SLA.md`
9. `08_N8N_WORKFLOWS.md`
10. `09_FRONTEND_UX.md`
11. `10_API_AND_PAYLOAD_CONTRACTS.md`
12. `11_SECURITY_AND_GOVERNANCE.md`
13. `12_TEST_STRATEGY.md`
14. `13_DEPLOYMENT_RUNBOOK.md`
15. `14_CHAPTER_8_EVIDENCE_PLAN.md`
16. `15_IMPLEMENTATION_ROADMAP.md`
17. `16_TRACEABILITY_MATRIX.md`
18. `17_CLAUDE_MASTER_PROMPT.md`
19. `18_CLAUDE_EXECUTION_CHECKLIST.md`

Archivos auxiliares:

- `supabase_schema.sql`: esquema inicial propuesto.
- `.env.example`: variables de entorno esperadas.
- `synthetic_cases.csv`: datos simulados para pruebas.
- `acceptance_tests.csv`: matriz de pruebas mínimas.
- `sample_payloads.json`: contratos y ejemplos de payload.

## Regla principal

El MVP debe demostrar un flujo completo:

**mensaje → caso → análisis IA → reglas → prioridad sugerida → almacenamiento → bandeja → revisión humana → seguimiento → cierre → métricas**

El sistema **no debe tomar decisiones académicas finales**, ni responder automáticamente casos sensibles, ni depender de cuentas institucionales reales para poder demostrarse.

## Arquitectura objetivo del proyecto

- Canal inicial: Outlook de prueba.
- Orquestación: n8n Cloud.
- IA: OpenAI.
- Datos: Supabase / PostgreSQL.
- Frontend: React.
- Hosting frontend: Vercel.
- Backend adicional: FastAPI solamente si es necesario.
- Teams y Microsoft Entra ID: arquitectura objetivo/futura si no existen permisos durante el MVP.

## Principio de implementación

Debe existir un **Demo Mode reproducible** para ejecutar el MVP aunque no se disponga todavía de credenciales de Outlook, OpenAI o Microsoft 365. El Demo Mode puede usar mensajes simulados y un proveedor de IA mock determinístico, pero la arquitectura y contratos deben mantener compatibilidad con las integraciones reales.

Esta decisión de Demo Mode es una decisión de implementación propuesta para asegurar reproducibilidad; no reemplaza la arquitectura objetivo definida en el proyecto.
