-- 0001 — Esquema base del MVP (05_DATA_MODEL.md)
-- Basado en docs/spec/supabase_schema.sql, ampliado con: valores sugeridos vs. vigentes,
-- SLA calculado, configuración editable, responsables, perfiles/roles, transiciones y log operativo.

create type public.case_priority as enum ('urgent', 'high', 'medium', 'low');
create type public.case_status as enum (
  'received', 'classified', 'under_review', 'in_progress',
  'waiting_information', 'resolved', 'closed'
);
create type public.app_role as enum ('director', 'administrative', 'admin', 'it');

-- Parámetros configurables (NFR-006). Las claves coinciden con core/src/config.ts
create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table public.categories (
  id                  uuid primary key default gen_random_uuid(),
  name                text unique not null,
  default_responsible text,
  sort_order          int not null default 100,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

create table public.sla_config (
  priority                   public.case_priority primary key,
  -- 0 = mismo día hábil; N = fin del N-ésimo día hábil siguiente
  first_review_business_days int not null check (first_review_business_days >= 0),
  enabled                    boolean not null default true,
  updated_at                 timestamptz not null default now()
);

create table public.responsibles (
  id               uuid primary key default gen_random_uuid(),
  label            text unique not null,
  role_label       text not null,
  academic_program text,
  email            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text unique not null,
  full_name         text,
  role              public.app_role not null,
  academic_program  text,
  responsible_label text references public.responsibles (label) on update cascade,
  created_at        timestamptz not null default now()
);

create table public.status_transitions (
  from_status public.case_status not null,
  to_status   public.case_status not null,
  admin_only  boolean not null default false,
  primary key (from_status, to_status)
);

create sequence public.case_number_seq;

create table public.cases (
  id                    uuid primary key default gen_random_uuid(),
  case_number           text unique not null,
  source_message_id     text unique,
  source_channel        text not null default 'demo',
  sender_email          text,
  recipient_email       text,
  academic_program      text,
  subject               text not null,
  message_body          text not null,
  -- Sugerido por el sistema (nunca se sobrescribe por un override)
  suggested_category    text,
  suggested_priority    public.case_priority,
  suggested_responsible text,
  rule_hits             text[] not null default '{}',
  -- Decisión operativa vigente
  category              text,
  current_priority      public.case_priority,
  assigned_to           text,
  status                public.case_status not null default 'received',
  -- Análisis IA
  ai_confidence         numeric check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  ai_summary            text,
  ai_urgency            text,
  ai_impact             text,
  ai_reasoning_summary  text,
  ai_deadline_explicit  boolean not null default false,
  detected_deadline     timestamptz,
  sensitive             boolean not null default false,
  sensitive_reason      text,
  needs_human_review    boolean not null default false,
  -- Tiempos
  received_at           timestamptz not null,
  sla_due_at            timestamptz,
  first_reviewed_at     timestamptz,
  last_activity_at      timestamptz,
  resolved_at           timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Historial inmutable (no editable desde UI; ver trigger en 0002)
create table public.case_events (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases (id) on delete cascade,
  event_type  text not null,
  actor_label text not null default 'system',
  field_name  text,
  old_value   jsonb,
  new_value   jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.classification_runs (
  id                 uuid primary key default gen_random_uuid(),
  case_id            uuid references public.cases (id) on delete cascade,
  provider           text not null,
  model              text,
  parsed_category    text,
  urgency            text,
  impact             text,
  detected_deadline  timestamptz,
  confidence         numeric,
  sensitive          boolean,
  suggested_priority public.case_priority,
  rule_hits          text[] not null default '{}',
  success            boolean not null default true,
  error_message      text,
  validation_issues  jsonb not null default '[]'::jsonb,
  latency_ms         integer,
  created_at         timestamptz not null default now()
);

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.cases (id) on delete cascade,
  alert_type      text not null,
  severity        text not null check (severity in ('critical', 'warning', 'info')),
  message         text not null,
  active          boolean not null default true,
  triggered_at    timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at     timestamptz
);

-- Observabilidad (NFR-013): procesamiento, duplicados, errores de n8n/IA, cambios de configuración
create table public.ops_log (
  id         bigint generated always as identity primary key,
  level      text not null default 'info' check (level in ('info', 'warning', 'error')),
  source     text not null,
  event      text not null,
  message    text,
  case_id    uuid references public.cases (id) on delete set null,
  context    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_cases_priority on public.cases (current_priority);
create index idx_cases_status on public.cases (status);
create index idx_cases_deadline on public.cases (detected_deadline);
create index idx_cases_received on public.cases (received_at desc);
create index idx_cases_program on public.cases (academic_program);
create index idx_cases_assigned on public.cases (assigned_to);
create index idx_events_case on public.case_events (case_id, created_at);
create index idx_runs_case on public.classification_runs (case_id);
create index idx_alerts_case_active on public.alerts (case_id, active);
-- Evita alertas duplicadas: una sola alerta activa por (caso, tipo)
create unique index uq_alerts_one_active on public.alerts (case_id, alert_type) where active;
create index idx_ops_log_created on public.ops_log (created_at desc);
