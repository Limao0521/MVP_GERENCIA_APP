# Supabase / PostgreSQL

## Migraciones (`supabase/migrations`)

| Archivo | Contenido |
|---|---|
| `…0001_schema.sql` | Enums, tablas (`cases`, `case_events`, `classification_runs`, `alerts`, `sla_config`, `categories`, `responsibles`, `profiles`, `status_transitions`, `app_config`, `ops_log`) e índices. Una sola alerta activa por (caso, tipo). |
| `…0002_case_logic.sql` | Días hábiles (`business_due`), SLA, número de caso `CASE-0001`, **máquina de estados**, **auditoría automática por triggers** (prioridad, categoría, responsable, estado, banderas), **inmutabilidad** de `case_events`, log de cambios de configuración. |
| `…0003_rpc.sql` | RPC: `ingest_case` (idempotente, transaccional), `find_case_by_source`, `update_case`, `accept_suggestion`, `add_case_note`, `sync_alerts`, `get_open_cases_for_alerts`, `acknowledge_alert`, `demo_ingest_case`, `reset_demo`; vistas `case_metrics` y `classification_metrics` (`security_invoker`). |
| `…0004_rls.sql` | RLS y permisos mínimos por rol. |
| `…0005_reference_data.sql` | Categorías, SLA, transiciones, responsables y parámetros (`app_config`). |

Diseño clave:

- `suggested_priority` / `suggested_category` / `suggested_responsible` **nunca** se sobrescriben; `current_priority`, `category`, `assigned_to` son la decisión vigente.
- El frontend **no puede** hacer `UPDATE` directo sobre `cases`: toda modificación pasa por RPC que validan rol y transición; los triggers registran actor, campo, valor anterior, valor nuevo, nota y fecha en `case_events`.
- `case_events` no admite `UPDATE`/`DELETE` (ni siquiera con service role); sólo `reset_demo` (admin + `demo_mode`) puede purgar datos de demo.

## RLS por rol

| Rol | `cases` | Escritura |
|---|---|---|
| `director` | sólo su `academic_program` | categoría, prioridad, responsable, estado, aceptar sugerencia, notas |
| `administrative` | sólo asignados a su `responsible_label` y **no sensibles** | estado y notas |
| `admin` | todos | todo + configuración + reset demo |
| `it` | todos (lectura) | ninguna sobre casos; lectura de configuración y `ops_log` |
| `anon` | nada | nada |
| `service_role` (n8n/scripts) | todo | `ingest_case`, `sync_alerts` |

## Proyecto local

```bash
npm run db:start            # supabase start (excluye servicios no usados)
npx supabase status -o env  # URL y claves para .env
npm run db:reset            # recrea la base aplicando las migraciones
npm run seed:users && npm run seed:demo -- --simulate-activity
```

## Proyecto en Supabase Cloud

```bash
npx supabase login                         # o SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref <ref>
npx supabase db push                       # aplica las 5 migraciones
```

Luego en `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(Project Settings → API) y ejecute `npm run seed:users` y `npm run seed:demo`.

En Auth → URL Configuration agregue la URL del frontend (localhost y Vercel). Auth por email/contraseña habilitado,
confirmación de email deshabilitada sólo si se crean usuarios demo por script (ya se crean confirmados).

## Reset de la demo

- UI: `/demo` → *Reiniciar datos demo* (rol admin) y luego `npm run seed:demo`.
- CLI: `npm run seed:demo` (ejecuta `reset_demo` y vuelve a sembrar).
