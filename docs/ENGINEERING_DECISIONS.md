# Decisiones de ingeniería y supuestos

Cada decisión preserva el requisito del proyecto fuente; donde la especificación no definía un valor, se dejó configurable.

| # | Decisión | Motivo / requisito |
|---|---|---|
| ED-01 | **IA dentro de n8n Cloud con Gateway credits** (nodo OpenAI, `gpt-4o-mini`, salida JSON, temperatura 0). No se usa API key propia. El trial actual de n8n reemplazó los "free OpenAI API credits" por Gateway credits. | Pedido del equipo; mantiene OpenAI como proveedor del proyecto. `OpenAIProvider` en `core/` queda como adaptador opcional para scripts. |
| ED-02 | Lógica única en `core/` (TypeScript) empaquetada en los nodos Code de n8n. | Spec 04 prefiere Code nodes; así las reglas son testeables con vitest sin FastAPI (no se introdujo backend adicional). |
| ED-03 | Workflow A (Outlook) reenvía al webhook del Workflow B en lugar de duplicar nodos. | Spec 08: "debe reutilizar el mismo pipeline lógico"; evita depender de IDs de sub-workflow tras importar. |
| ED-04 | Inserción de caso, `classification_run` y eventos iniciales en una sola RPC transaccional `ingest_case`. | Consistencia: no puede existir un caso sin su evidencia de clasificación; idempotencia con `pg_advisory_xact_lock`. |
| ED-05 | Auditoría por **triggers** y escritura sólo vía RPC. | NFR-004: ninguna ruta (UI, SQL, script) puede modificar campos auditables sin generar evento. |
| ED-06 | SLA "Urgente = mismo día hábil" se modela como `first_review_business_days = 0` (fin del día hábil, 18:00 Bogotá). La propuesta `0.5` del esquema inicial se reemplazó por días enteros. | La tabla de SLA del proyecto habla de días hábiles; la hora de cierre es configurable (`business_day_end_hour`). |
| ED-07 | Días hábiles lunes–viernes, sin festivos; zona fija UTC-5. | Spec 07 ("no modelar festivos inicialmente"); Colombia no usa horario de verano. |
| ED-08 | Umbral de confianza `0.70`; PRIORITY-02/03 urgente si la fecha vence hoy/≤1 día hábil, PRIORITY-04 alta si ≤2. | Valores propuestos en spec 00/07, externalizados en `app_config`. |
| ED-09 | Fecha límite **vencida** ⇒ urgente + revisión humana (`review_on_expired_deadline`). | Cualquier alternativa a un plazo vencido es una decisión académica (BR-001/BR-003). Coincide con SYN-026. |
| ED-10 | Caso sensible con impacto alto ⇒ mínimo `high` (`sensitive_high_impact_min_priority`); siempre revisión humana y asignación al director del programa. | PRIORITY-01 y spec 11 (restringir visualización: el personal administrativo nunca ve casos sensibles). |
| ED-11 | Línea base cuando ninguna regla aplica: prioridad derivada de la urgencia extraída (`PRIORITY-10-BASELINE`). | Spec 07 define reglas de elevación pero no el valor por defecto; se registra en `rule_hits` para trazabilidad. |
| ED-12 | Si la IA falla, el caso queda en `received` (no `classified`) y se agregó la transición `received → under_review`. | NFR-007 + FR-041: un humano toma el caso sin pasar por una clasificación inexistente. |
| ED-13 | Reapertura `closed → under_review` sólo para administradores, auditada. | Permitido opcionalmente por spec 07. |
| ED-14 | Primera revisión = primera acción humana sobre el caso (aceptar sugerencia, override, estado o nota). | Necesario para medir "tiempo de primera revisión" y cumplimiento SLA. |
| ED-15 | "Sin gestión por 2 días hábiles" se mide desde `last_activity_at` (recepción o última acción humana). | FR-051. |
| ED-16 | Autenticación Supabase Auth con usuarios demo sintéticos y roles en `profiles`. | Entra ID es arquitectura futura (P2); el MVP no depende de cuentas institucionales. |
| ED-17 | Demo Mode adicional "Procesar sin n8n" en `/demo` (Mock en el navegador + RPC `demo_ingest_case`, sólo con `demo_mode=true`). | Spec 04: el MVP debe demostrarse aunque n8n/OpenAI no estén disponibles. El flujo principal sigue siendo n8n. |
| ED-18 | Dataset dividido: SYN-001…016 development, SYN-017…032 evaluation. El léxico Mock se escribió con acceso a todo el dataset; se declara explícitamente en los reportes. | Spec 12: no presentar métricas infladas. |
| ED-19 | `routing_accuracy` se reporta como N/A. | El dataset sintético no incluye responsable esperado; no se inventa ground truth. |
| ED-20 | Nuevas categorías creadas en `/admin` no se agregan automáticamente al prompt; la IA sólo usa las 8 del proyecto. | Spec 06: "No inventar nuevas categorías durante runtime". |
| ED-21 | Prompt v2: definiciones de categoría y escala de urgencia/impacto. Calibrado sólo con errores del split de desarrollo (SYN-001…016); ambos reportes (v1 y v2) se conservan en `evidence/evaluation`. | Spec 12: no optimizar por caso de evaluación; transparencia de métricas. |
| ED-22 | Despliegue de n8n Cloud mediante la API interna de la instancia con la sesión del usuario. | La API pública de n8n no está disponible en el trial. |
