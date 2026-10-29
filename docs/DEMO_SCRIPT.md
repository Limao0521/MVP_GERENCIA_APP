# Guion de grabación (versión desplegada, 8–9 min)

**Antes de grabar** (2 min, fuera de cámara), deja abiertas en el navegador estas 4 pestañas:

1. App: https://mvp-gerencia.vercel.app → iniciar sesión con `director.informatica@example.edu` / `Demo-MVP-2026!`.
2. n8n: https://tarean8n.app.n8n.cloud → *Overview* → workflow **MVP · B · Ingesta webhook demo (pipeline compartido)** (abierto en el canvas).
3. Supabase: https://supabase.com/dashboard/project/kvpburaufvrnywainsbh/editor → tabla `cases`.
4. Una ventana privada con la app, sesión `director.civil@example.edu` (para el caso sensible).

Estado inicial: 32 casos sintéticos clasificados por **OpenAI real**, 0 overrides, alertas de SLA activas.

| Tiempo | Qué hacer | Qué decir / mostrar |
|---|---|---|
| **0:00–0:40** | Diapositiva o README. | Problema: mensajes no estructurados, priorización manual, sin trazabilidad. Objetivo: caso estructurado, clasificado, priorizado y trazable, con decisión humana. |
| **0:40–1:20** | Mostrar el diagrama de `docs/ARCHITECTURE.md`. | Demo Injector/Outlook → **n8n Cloud** → **OpenAI gpt-4o-mini** (Gateway credits de n8n) → reglas deterministas → **Supabase Cloud** → **React en Vercel**. |
| **1:20–2:00** | App → **Dashboard**. | Mostrar tiles: *Casos recibidos*, *Urgentes abiertos*, *SLA vencido*, *Overrides humanos = 0*, tile *Proveedor IA* (OpenAI / Mock). |
| **2:00–2:50** | App → menú **🧪 Demo Injector** → *Cargar escenario de muestra* = **★ Caso crítico de la demo (cancelar materia antes de mañana)** → *Proveedor de IA en n8n* = **OpenAI (créditos n8n Cloud)** → botón **Send to n8n webhook**. | Esperar ~3–6 s. Leer la respuesta: `Caso creado: CASE-00xx · estado classified`, `suggested_priority: urgent`. |
| **2:50–3:50** | Pestaña **n8n** → pestaña **Executions** del workflow B → abrir la ejecución más reciente. Clic en los nodos: **Normalize & Scope Check** → **OpenAI Analysis** (mostrar el JSON de salida del modelo) → **Validate Structured Output** → **Business Rules** (`rule_hits`) → **Insert Case (ingest_case)**. | "El correo se trata como dato no confiable; el modelo devuelve JSON estricto; las reglas deciden la prioridad sugerida; todo se guarda en una transacción idempotente". |
| **3:50–4:30** | Pestaña **Supabase** → Table Editor → `cases` (ordenar por `case_number` desc) → mostrar la fila nueva (`suggested_priority`, `current_priority`, `ai_confidence`). Luego tabla `classification_runs` (provider `openai`, model `gpt-4o-mini`, `latency_ms`) y `case_events`. | Sugerido vs. vigente se guardan por separado; cada ejecución de IA queda registrada. |
| **4:30–5:15** | App → **📥 Bandeja**. El caso nuevo aparece **arriba** con ▲▲ Urgente. Aplicar filtros *Prioridad = Urgente* y *Estado = Abiertos (todos)*. Clic en el caso nuevo. | En el detalle: *Análisis IA (sugerencia)*: resumen, confianza, urgencia, impacto, fecha límite detectada, *Reglas aplicadas*, línea "Ejecución del clasificador: openai (gpt-4o-mini)". |
| **5:15–6:15** | **Override**: en *Decisión operativa* cambiar *Prioridad* de Urgente a **Alta**; en *Nota* escribir "El estudiante ya inició el trámite en SIGA". Clic **Guardar cambios**. Luego botones de estado **→ En revisión**, **→ En gestión**, **→ Resuelto**, **→ Cerrado**. | Mostrar que *Sugerido por el sistema* sigue en Urgente y *Decisión vigente* en Alta. Bajar al **Historial / auditoría**: actor `director.informatica@example.edu`, campo, valor anterior → nuevo, nota y hora. |
| **6:15–6:45** | Ventana privada (`director.civil@example.edu`) → Bandeja → marcar filtro **Sensibles** → abrir **CASE-0009 "Situación personal"**. | Advertencia 🔒 *Caso sensible* y 👁 *Revisión humana requerida*; el director de Civil sólo ve casos de su programa (RLS). |
| **6:45–7:20** | Volver a la sesión del director de Informática → **🔔 Alertas** → **↻ Recalcular ahora**. Señalar **⛔ SLA vencido** de **CASE-0007 "URGENTE inscripción hoy"** y alertas *Sin gestión*. Opcional: en n8n mostrar el workflow **MVP · C · Seguimiento y alertas SLA** (ejecución horaria). | Alertas ALERT-001…005 calculadas cada hora por n8n; se resuelven solas al gestionar el caso. |
| **7:20–7:50** | App → **📊 Dashboard** → **↻ Actualizar**. | KPIs que cambiaron: **Overrides humanos = 1** (tasa 100 % de revisados), **Cerrados = 1**, **Cumplimiento SLA**, **Primera revisión promedio**, **Latencia clasificación ≈ 2 s**. |
| **7:50–8:30** | Mostrar `evidence/evaluation/n8n-openai-promptv2_latest_report.md`. | Evaluación real con OpenAI sobre 32 casos sintéticos: categoría 90,6–93,8 %, prioridad 81,3 %, recall de urgentes 100 %, recall de sensibles 100 %, trazabilidad 100 %, duplicados 5/5. Pruebas: 43 unitarias, 18 de aceptación, 3 E2E. |
| **8:30–9:00** | Diapositiva final. | Limitaciones: festivos no modelados, Outlook requiere cuenta de prueba, Teams/Entra ID futuros. Es una prueba funcional del TO-BE, no un sistema productivo. |

Reiniciar la demo entre tomas: `npm run reset:demo && npm run eval:n8n -- --provider openai` (vuelve a crear los 32 casos con OpenAI real).
