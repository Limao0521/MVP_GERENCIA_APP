# MVP funcional — Gestión de solicitudes estudiantiles (IT Operations Management)

Universidad de La Sabana · Facultad de Ingeniería · Capítulo 8 (Functional MVP)

Convierte correos estudiantiles (simulados o de una cuenta Outlook de prueba) en **casos estructurados, clasificados, priorizados y trazables**:

```
mensaje → n8n (Cloud) → análisis IA (OpenAI con créditos del trial de n8n, o Mock) → reglas deterministas
        → Supabase/PostgreSQL → bandeja React → revisión humana / override → estados → alertas SLA → KPIs
```

> La categoría y la prioridad son **sugerencias**. El sistema no toma decisiones académicas, no responde al estudiante y
> fuerza revisión humana en casos sensibles, ambiguos o de baja confianza. Todos los datos son **sintéticos**.

## Contenido del repositorio

| Carpeta | Qué contiene |
|---|---|
| `core/` | Lógica única y probada (TypeScript): normalización, contrato IA, MockAIProvider, adaptador OpenAI, motor de reglas, días hábiles/SLA, alertas. La usan n8n, el frontend y los scripts. |
| `n8n/` | Workflows importables (A Outlook, B webhook demo, C alertas SLA, error handler) generados desde `core/` + [n8n/README.md](n8n/README.md). |
| `supabase/` | Migraciones versionadas (esquema, auditoría por triggers, RPC, RLS, datos de referencia) + [supabase/README.md](supabase/README.md). |
| `app/` | Frontend React + TypeScript (Vite, listo para Vercel): Dashboard, Bandeja, Detalle, Alertas, Admin, Demo Injector. |
| `scripts/` | Seed de usuarios/demo, ingesta CLI, alertas, evaluación del dataset, generador de workflows, smoke test de n8n. |
| `tests/` | Unitarias (`core/tests`), integración/aceptación contra Supabase (`tests/integration`), E2E Playwright (`tests/e2e`). |
| `data/` | `synthetic_cases.csv`, `acceptance_tests.csv`, `sample_payloads.json`. |
| `docs/` | Arquitectura, decisiones de ingeniería, guion de demo, evidencia Cap. 8, especificación original (`docs/spec`). |
| `evidence/` | Resultados de pruebas, evaluación y capturas generadas por ejecución real. |

## Demo desplegada

| | URL |
|---|---|
| App (Vercel) | https://mvp-gerencia.vercel.app |
| Webhook n8n Cloud | `POST https://tarean8n.app.n8n.cloud/webhook/student-request-demo` |
| n8n Cloud | https://tarean8n.app.n8n.cloud |
| Supabase | https://supabase.com/dashboard/project/kvpburaufvrnywainsbh |

IA real: nodo OpenAI `gpt-4o-mini` en n8n Cloud con **Gateway credits** (sin API key propia). Detalle y cómo se automatizó: [docs/CLOUD_DEPLOYMENT.md](docs/CLOUD_DEPLOYMENT.md).

## Requisitos

- Node.js 20+ (probado con 24) y npm 10+
- Docker Desktop (sólo para Supabase/n8n **locales**) y Supabase CLI (`npx supabase`)
- Para la demo en la nube: cuenta Supabase, cuenta **n8n Cloud** (trial con créditos OpenAI gratuitos), cuenta Vercel (opcional)
- Opcional: cuenta Outlook **de prueba** (no institucional) para el Workflow A

## Inicio rápido (todo local, sin credenciales externas)

```bash
npm install
cp .env.example .env              # luego complete con los valores que imprime `supabase start`
npm run db:start                  # Supabase local en Docker (aplica las migraciones)
npm run seed:users                # 8 usuarios demo sintéticos (contraseña: DEMO_USER_PASSWORD)
npm run seed:demo -- --simulate-activity   # 32 casos sintéticos + caso crítico de la demo
npm run dev                       # http://localhost:5173
```

Valores para `.env` en local (los imprime `npx supabase status -o env`): `VITE_SUPABASE_URL` y `SUPABASE_URL` = `http://127.0.0.1:54321`, `VITE_SUPABASE_ANON_KEY` = `ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` = `SERVICE_ROLE_KEY`.

n8n local opcional (para probar los workflows antes de subirlos a la nube):

```bash
bash scripts/n8n-local.sh         # n8n en Docker con los workflows importados y publicados
npm run smoke:n8n                 # caso nuevo, idempotencia, fuera de alcance, payload inválido
```

## Despliegue de la demo en la nube

1. **Supabase**: crear proyecto → `npx supabase link --project-ref <ref>` → `npx supabase db push` → copiar URL, anon key y service role key a `.env` → `npm run seed:users` → `npm run seed:demo`. Detalle en [supabase/README.md](supabase/README.md).
2. **n8n Cloud**: `npm run cloud:n8n` (crea la credencial Supabase, genera e importa los workflows y publica B y C usando la sesión del navegador) o importación manual según [n8n/README.md](n8n/README.md). La IA usa Gateway credits de n8n.
3. **Frontend**: `VITE_N8N_DEMO_WEBHOOK_URL=https://<instancia>.app.n8n.cloud/webhook/student-request-demo` en `.env`. En Vercel: *Root Directory* = `app`, framework Vite, variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_MODE`, `VITE_N8N_DEMO_WEBHOOK_URL`. Agregar la URL de Vercel en Supabase → Auth → URL Configuration.

**Nunca** ponga la service role key en variables `VITE_*` ni en Vercel.

## Usuarios demo (sintéticos)

| Correo | Rol | Ve |
|---|---|---|
| `director.informatica@example.edu` | Director | casos de Ing. Informática |
| `director.industrial@` / `director.civil@` / `director.quimica@example.edu` | Director | casos de su programa |
| `administrativo@example.edu`, `practicas@example.edu` | Administrativo | casos asignados, nunca sensibles; sólo cambia estado |
| `admin@example.edu` | Administrador | todo, configuración, reset de demo |
| `ti@example.edu` | TI | todo en solo lectura |

Contraseña: valor de `DEMO_USER_PASSWORD` (por defecto `Demo-MVP-2026!`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas unitarias del core (reglas, SLA, contrato IA, Mock, alertas) |
| `npm run test:integration` | Aceptación AT-001…AT-018 contra Supabase (requiere DB + `seed:users`) |
| `npm run test:e2e` | Playwright: flujo del director y capturas en `evidence/screenshots` |
| `npm run eval` | Evaluación del dataset con Mock + reglas → `evidence/evaluation` |
| `npm run eval:n8n -- --provider openai` | Evaluación a través del webhook n8n (OpenAI real) leyendo lo persistido en Supabase |
| `npm run alerts` | Recalcula alertas SLA (equivalente al Workflow C) |
| `npm run ingest -- --sample` | Ingresa el caso crítico por el pipeline local |
| `npm run build:n8n` | Regenera los workflows desde `core/` |
| `npm run lint` / `npm run build` | Typecheck y build de producción |

## Estado P0 / P1 / P2

Ver [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) (estado verificado por pruebas) y [docs/ENGINEERING_DECISIONS.md](docs/ENGINEERING_DECISIONS.md).

## Limitaciones conocidas

- Días hábiles = lunes a viernes; **no se modelan festivos** colombianos.
- El MockAIProvider es un léxico de palabras clave para reproducibilidad, no un modelo de NLP; sus métricas no prueban calidad de IA.
- La integración Outlook (Workflow A) está importada pero inactiva: depende de una cuenta Outlook **de prueba** (no institucional); Teams, Entra ID y SIGA son arquitectura futura (P2).
- Gateway credits del trial de n8n: saldo limitado (USD 1,99 al iniciar; cada clasificación con gpt-4o-mini cuesta fracciones de centavo). Si se agota, el caso se crea igual con revisión humana y se puede usar `ai_provider: "mock"`.
- Autenticación con Supabase Auth (email/contraseña) para el MVP; Entra ID es el objetivo institucional.
- No es un sistema productivo: sin HA, backups institucionales ni operación 24/7.
