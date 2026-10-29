-- 0005 — Datos de referencia (catálogos, SLA, transiciones, responsables y parámetros).
-- Se cargan como migración para que existan también en Supabase Cloud (db push no ejecuta seed.sql).
-- Todos los valores son editables desde /admin o SQL.

insert into public.categories (name, default_responsible, sort_order) values
  ('Matrícula',                           'Director de programa',      1),
  ('Asignaturas',                         'Director de programa',      2),
  ('Requisitos académicos',               'Coordinación académica',    3),
  ('Prácticas profesionales',             'Coordinación de prácticas', 4),
  ('Fechas y plazos',                     'Director de programa',      5),
  ('Situaciones académicas particulares', 'Director de programa',      6),
  ('Solicitudes generales',               'Asistente administrativo',  7),
  ('Otros',                               'Asistente administrativo',  8)
on conflict (name) do nothing;

-- SLA de primera revisión (07_BUSINESS_RULES_AND_SLA.md). 0 = mismo día hábil.
insert into public.sla_config (priority, first_review_business_days) values
  ('urgent', 0), ('high', 1), ('medium', 2), ('low', 5)
on conflict (priority) do update set first_review_business_days = excluded.first_review_business_days;

-- Máquina de estados (FR-040/041)
insert into public.status_transitions (from_status, to_status, admin_only) values
  ('received',            'classified',          false),
  -- Decisión de ingeniería: si la IA falla el caso queda en 'received' y un humano lo toma directamente
  ('received',            'under_review',        false),
  ('classified',          'under_review',        false),
  ('under_review',        'in_progress',         false),
  ('under_review',        'waiting_information', false),
  ('in_progress',         'waiting_information', false),
  ('waiting_information', 'in_progress',         false),
  ('in_progress',         'resolved',            false),
  ('resolved',            'closed',              false),
  -- Reapertura auditada, sólo administrador
  ('closed',              'under_review',        true)
on conflict do nothing;

insert into public.responsibles (label, role_label, academic_program, email) values
  ('Director – Ing. Informática', 'Director de programa', 'Ingeniería Informática', 'director.informatica@example.edu'),
  ('Director – Ing. Industrial',  'Director de programa', 'Ingeniería Industrial',  'director.industrial@example.edu'),
  ('Director – Ing. Civil',       'Director de programa', 'Ingeniería Civil',       'director.civil@example.edu'),
  ('Director – Ing. Química',     'Director de programa', 'Ingeniería Química',     'director.quimica@example.edu'),
  ('Coordinación académica',      'Coordinación académica',    null, 'coordinacion.academica@example.edu'),
  ('Coordinación de prácticas',   'Coordinación de prácticas', null, 'practicas@example.edu'),
  ('Asistente administrativo',    'Asistente administrativo',  null, 'administrativo@example.edu')
on conflict (label) do nothing;

-- Parámetros (mismas claves que core/src/config.ts -> DEFAULT_CONFIG)
insert into public.app_config (key, value, description) values
  ('ai_low_confidence_threshold', '0.70', 'Confianza mínima de IA; por debajo se fuerza revisión humana (PRIORITY-09)'),
  ('timezone', '"America/Bogota"', 'Zona horaria para días hábiles'),
  ('tz_offset_minutes', '-300', 'Desplazamiento fijo de la zona (Colombia no usa horario de verano)'),
  ('business_day_end_hour', '18', 'Hora local de cierre del día hábil (SLA "mismo día hábil")'),
  ('deadline_urgent_business_days', '1', 'PRIORITY-03: fecha límite a <= N días hábiles -> urgent'),
  ('deadline_high_business_days', '2', 'PRIORITY-04: fecha límite a <= N días hábiles -> high'),
  ('review_on_expired_deadline', 'true', 'Fecha límite vencida -> revisión humana'),
  ('sensitive_high_impact_min_priority', '"high"', 'PRIORITY-01: prioridad mínima para casos sensibles de impacto alto'),
  ('insufficient_info_priority', '"medium"', 'PRIORITY-08: prioridad conservadora con información insuficiente'),
  ('sla_warning_hours', '4', 'ALERT-001: horas antes del vencimiento del SLA'),
  ('followup_business_days', '2', 'ALERT-003: días hábiles sin gestión'),
  ('deadline_alert_hours', '24', 'ALERT-004: horas antes de la fecha límite académica'),
  ('pilot_programs', '["Ingeniería Informática","Ingeniería Industrial","Ingeniería Civil","Ingeniería Química"]', 'FR-002: programas del piloto'),
  ('pilot_recipient_domains', '["example.edu"]', 'FR-002: dominios de buzón aceptados ([] = cualquiera)'),
  ('program_by_recipient', '{"director.informatica@example.edu":"Ingeniería Informática","director.industrial@example.edu":"Ingeniería Industrial","director.civil@example.edu":"Ingeniería Civil","director.quimica@example.edu":"Ingeniería Química"}', 'Programa según buzón destinatario'),
  ('responsible_by_category', '{"Matrícula":"Director de programa","Asignaturas":"Director de programa","Requisitos académicos":"Coordinación académica","Prácticas profesionales":"Coordinación de prácticas","Fechas y plazos":"Director de programa","Situaciones académicas particulares":"Director de programa","Solicitudes generales":"Asistente administrativo","Otros":"Asistente administrativo"}', 'Responsable sugerido por categoría'),
  ('ai_provider', '"openai"', 'Proveedor de IA por defecto en n8n: openai | mock'),
  ('openai_model', '"gpt-4o-mini"', 'Modelo OpenAI usado por n8n'),
  ('demo_mode', 'true', 'Habilita /demo, inyección local y reset de datos')
on conflict (key) do nothing;
