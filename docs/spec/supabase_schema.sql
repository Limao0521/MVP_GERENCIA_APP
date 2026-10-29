-- Initial MVP schema proposed from project requirements.
-- Claude should convert this into versioned Supabase migrations and adjust as needed.

create extension if not exists pgcrypto;

create type case_priority as enum ('urgent','high','medium','low');
create type case_status as enum (
  'received','classified','under_review','in_progress',
  'waiting_information','resolved','closed'
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sla_config (
  priority case_priority primary key,
  first_review_business_days numeric not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  case_number text unique not null,
  source_message_id text unique,
  source_channel text not null default 'demo',
  sender_email text,
  recipient_email text,
  academic_program text,
  subject text not null,
  message_body text not null,
  category text,
  suggested_priority case_priority,
  current_priority case_priority,
  ai_confidence numeric check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  ai_summary text,
  ai_urgency text,
  ai_impact text,
  detected_deadline timestamptz,
  suggested_responsible text,
  assigned_to text,
  status case_status not null default 'received',
  sensitive boolean not null default false,
  needs_human_review boolean not null default false,
  received_at timestamptz not null,
  first_reviewed_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  event_type text not null,
  actor_label text,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists classification_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  provider text not null,
  model text,
  parsed_category text,
  urgency text,
  impact text,
  detected_deadline timestamptz,
  confidence numeric,
  sensitive boolean,
  success boolean not null default true,
  error_message text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  alert_type text not null,
  severity text not null,
  message text not null,
  active boolean not null default true,
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text
);

insert into categories(name) values
('Matrícula'),
('Asignaturas'),
('Requisitos académicos'),
('Prácticas profesionales'),
('Fechas y plazos'),
('Situaciones académicas particulares'),
('Solicitudes generales'),
('Otros')
on conflict (name) do nothing;

insert into sla_config(priority, first_review_business_days) values
('urgent', 0.5),
('high', 1),
('medium', 2),
('low', 5)
on conflict (priority) do update
set first_review_business_days = excluded.first_review_business_days;

-- Claude: add updated_at trigger, views, indexes and RLS policies.
create index if not exists idx_cases_priority on cases(current_priority);
create index if not exists idx_cases_status on cases(status);
create index if not exists idx_cases_deadline on cases(detected_deadline);
create index if not exists idx_events_case on case_events(case_id, created_at);
create index if not exists idx_alerts_case_active on alerts(case_id, active);
