-- 0003 — Funciones RPC (contratos de 10_API_AND_PAYLOAD_CONTRACTS.md) y vistas de métricas.

-- ---------------------------------------------------------------------------
-- Acceso por rol
-- ---------------------------------------------------------------------------
create or replace function public.current_profile()
returns public.profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.can_access_case(p_program text, p_assigned_to text, p_sensitive boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.role in ('admin', 'it') then true
      when p.role = 'director' then p_program is not distinct from p.academic_program
      -- Personal administrativo: sólo casos asignados y nunca casos sensibles (11_SECURITY_AND_GOVERNANCE.md)
      when p.role = 'administrative' then p_assigned_to = p.responsible_label and not coalesce(p_sensitive, false)
      else false
    end
    from public.profiles p where p.id = auth.uid()
  ), false);
$$;

create or replace function public.is_service_role()
returns boolean language sql stable as $$
  -- session_user (no current_user, que dentro de SECURITY DEFINER es el dueño de la función)
  select coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres';
$$;

-- ---------------------------------------------------------------------------
-- Ingesta (n8n, service role). Idempotente por source_message_id.
-- p = { source_message_id, source_channel, sender_email, recipient_email, academic_program,
--       subject, body, received_at, ai: {...AiResult}, rules: {...RuleResult}, run: {...AiRunMeta}, actor? }
-- ---------------------------------------------------------------------------
create or replace function public.find_case_by_source(p_source_message_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('exists', true, 'case_id', id, 'case_number', case_number, 'status', status)
       from public.cases where source_message_id = p_source_message_id),
    jsonb_build_object('exists', false));
$$;

create or replace function public.ingest_case(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ai      jsonb := coalesce(p -> 'ai', '{}'::jsonb);
  v_rules   jsonb := coalesce(p -> 'rules', '{}'::jsonb);
  v_run     jsonb := coalesce(p -> 'run', '{}'::jsonb);
  v_source  text  := nullif(trim(p ->> 'source_message_id'), '');
  v_success boolean := coalesce((v_run ->> 'success')::boolean, false);
  v_sensitive boolean := coalesce((v_ai ->> 'sensitive')::boolean, false);
  v_category text;
  v_role_label text;
  v_assignee text;
  v_existing public.cases;
  v_case public.cases;
  v_hits text[];
begin
  if v_source is null then
    raise exception 'VALIDATION_ERROR: source_message_id is required' using errcode = 'P0001';
  end if;
  if coalesce(p ->> 'subject', '') = '' and coalesce(p ->> 'body', '') = '' then
    raise exception 'VALIDATION_ERROR: subject or body is required' using errcode = 'P0001';
  end if;

  -- Idempotencia (FR-003 / AT-012): serializa por mensaje y no duplica
  perform pg_advisory_xact_lock(hashtext(v_source));
  select * into v_existing from public.cases where source_message_id = v_source;
  if found then
    insert into public.ops_log (level, source, event, message, case_id, context)
    values ('info', 'ingest', 'duplicate_ignored', 'Message already ingested', v_existing.id,
            jsonb_build_object('source_message_id', v_source));
    return jsonb_build_object('accepted', true, 'duplicate', true, 'case_id', v_existing.id,
                              'case_number', v_existing.case_number, 'status', v_existing.status);
  end if;

  -- Categoría válida (unknown -> Otros)
  select name into v_category from public.categories where name = v_ai ->> 'category' and active;
  v_category := coalesce(v_category, 'Otros');

  -- Responsable: casos sensibles siempre al director del programa
  v_role_label := case when v_sensitive then 'Director de programa'
                       else coalesce(v_ai ->> 'suggested_responsible',
                                     (select default_responsible from public.categories where name = v_category)) end;
  select label into v_assignee from public.responsibles
   where active and role_label = v_role_label
     and (academic_program = p ->> 'academic_program' or academic_program is null)
   order by (academic_program is null), label
   limit 1;

  select coalesce(array_agg(x), '{}') into v_hits from jsonb_array_elements_text(coalesce(v_rules -> 'rule_hits', '[]'::jsonb)) x;

  perform set_config('app.actor', coalesce(nullif(p ->> 'actor', ''), 'system:' || coalesce(nullif(p ->> 'source_channel', ''), 'demo')), true);
  perform set_config('app.actor_role', 'system', true);

  insert into public.cases (
    source_message_id, source_channel, sender_email, recipient_email, academic_program,
    subject, message_body, suggested_category, category, suggested_priority, suggested_responsible,
    rule_hits, assigned_to, ai_confidence, ai_summary, ai_urgency, ai_impact, ai_reasoning_summary,
    ai_deadline_explicit, detected_deadline, sensitive, sensitive_reason, needs_human_review, received_at
  ) values (
    v_source,
    coalesce(nullif(p ->> 'source_channel', ''), 'demo'),
    p ->> 'sender_email',
    p ->> 'recipient_email',
    p ->> 'academic_program',
    coalesce(nullif(p ->> 'subject', ''), '(sin asunto)'),
    coalesce(nullif(p ->> 'body', ''), p ->> 'subject'),
    v_category,
    v_category,
    coalesce((v_rules ->> 'suggested_priority')::public.case_priority, 'medium'),
    v_role_label,
    v_hits,
    v_assignee,
    least(greatest(coalesce((v_ai ->> 'confidence')::numeric, 0), 0), 1),
    v_ai ->> 'summary',
    v_ai ->> 'urgency',
    v_ai ->> 'impact',
    v_ai ->> 'reasoning_summary',
    coalesce((v_ai ->> 'deadline_explicit')::boolean, false),
    nullif(v_ai ->> 'deadline', '')::timestamptz,
    v_sensitive,
    v_ai ->> 'sensitive_reason',
    coalesce((v_rules ->> 'needs_human_review')::boolean, true) or v_sensitive or not v_success,
    coalesce(nullif(p ->> 'received_at', '')::timestamptz, now())
  ) returning * into v_case;

  insert into public.classification_runs (
    case_id, provider, model, parsed_category, urgency, impact, detected_deadline, confidence, sensitive,
    suggested_priority, rule_hits, success, error_message, validation_issues, latency_ms
  ) values (
    v_case.id,
    coalesce(v_run ->> 'provider', 'unknown'),
    v_run ->> 'model',
    v_ai ->> 'category',
    v_ai ->> 'urgency',
    v_ai ->> 'impact',
    v_case.detected_deadline,
    v_case.ai_confidence,
    v_sensitive,
    v_case.suggested_priority,
    v_hits,
    v_success,
    v_run ->> 'error_message',
    coalesce(v_run -> 'validation_issues', '[]'::jsonb),
    (v_run ->> 'latency_ms')::int
  );

  insert into public.case_events (case_id, event_type, actor_label, new_value, metadata)
  values (
    v_case.id,
    case when v_success then 'classification_completed' else 'classification_failed' end,
    public.ctx_actor(),
    jsonb_build_object('category', v_case.category, 'suggested_priority', v_case.suggested_priority,
                       'confidence', v_case.ai_confidence, 'needs_human_review', v_case.needs_human_review,
                       'sensitive', v_case.sensitive),
    jsonb_build_object('provider', v_run ->> 'provider', 'model', v_run ->> 'model', 'rule_hits', to_jsonb(v_hits),
                       'error', v_run ->> 'error_message')
  );

  if v_success then
    update public.cases set status = 'classified' where id = v_case.id returning * into v_case;
  end if;

  insert into public.ops_log (level, source, event, message, case_id, context)
  values (
    case when v_success then 'info' else 'warning' end,
    'ingest',
    case when v_success then 'case_processed' else 'ai_failure_case_saved' end,
    v_case.case_number || ' ' || v_case.status,
    v_case.id,
    jsonb_build_object('provider', v_run ->> 'provider', 'latency_ms', v_run ->> 'latency_ms',
                       'needs_human_review', v_case.needs_human_review, 'error', v_run ->> 'error_message')
  );

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'case_id', v_case.id,
    'case_number', v_case.case_number,
    'status', v_case.status,
    'suggested_priority', v_case.suggested_priority,
    'needs_human_review', v_case.needs_human_review,
    'case', jsonb_build_object(
      'id', v_case.id, 'case_number', v_case.case_number, 'status', v_case.status,
      'current_priority', v_case.current_priority, 'sensitive', v_case.sensitive,
      'needs_human_review', v_case.needs_human_review, 'received_at', v_case.received_at,
      'first_reviewed_at', v_case.first_reviewed_at, 'sla_due_at', v_case.sla_due_at,
      'detected_deadline', v_case.detected_deadline, 'last_activity_at', v_case.last_activity_at)
  );
end;
$$;

-- Ingesta desde la UI en Demo Mode (sin n8n): admin/director, sólo si demo_mode = true
create or replace function public.demo_ingest_case(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.current_profile();
begin
  if v_profile.id is null or v_profile.role not in ('admin', 'director') then
    raise exception 'FORBIDDEN: only admin or director can inject demo cases' using errcode = '42501';
  end if;
  if public.cfg_text('demo_mode', 'false') <> 'true' then
    raise exception 'FORBIDDEN: demo_mode is disabled' using errcode = '42501';
  end if;
  return public.ingest_case(p || jsonb_build_object('actor', 'demo:' || v_profile.email));
end;
$$;

-- ---------------------------------------------------------------------------
-- Gestión humana (FR-023, FR-031, FR-042). Toda modificación queda auditada por trigger.
-- p_changes admite: category, current_priority, assigned_to, status, needs_human_review
-- ---------------------------------------------------------------------------
create or replace function public.update_case(p_case_id uuid, p_changes jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.current_profile();
  v_case public.cases;
  v_key text;
begin
  if v_profile.id is null then
    raise exception 'FORBIDDEN: no profile for current user' using errcode = '42501';
  end if;
  select * into v_case from public.cases where id = p_case_id for update;
  if not found or not public.can_access_case(v_case.academic_program, v_case.assigned_to, v_case.sensitive) then
    raise exception 'NOT_FOUND: case not found or not accessible' using errcode = '42501';
  end if;
  if v_profile.role = 'it' then
    raise exception 'FORBIDDEN: IT role has read-only access to cases' using errcode = '42501';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) loop
    if v_key not in ('category', 'current_priority', 'assigned_to', 'status', 'needs_human_review') then
      raise exception 'VALIDATION_ERROR: field % cannot be updated', v_key using errcode = 'P0001';
    end if;
    if v_profile.role = 'administrative' and v_key in ('category', 'current_priority', 'assigned_to') then
      raise exception 'FORBIDDEN: administrative staff cannot change %', v_key using errcode = '42501';
    end if;
  end loop;

  if p_changes ? 'category' and not exists (select 1 from public.categories where name = p_changes ->> 'category' and active) then
    raise exception 'VALIDATION_ERROR: unknown category %', p_changes ->> 'category' using errcode = 'P0001';
  end if;
  if p_changes ? 'assigned_to' and nullif(p_changes ->> 'assigned_to', '') is not null
     and not exists (select 1 from public.responsibles where label = p_changes ->> 'assigned_to' and active) then
    raise exception 'VALIDATION_ERROR: unknown responsible %', p_changes ->> 'assigned_to' using errcode = 'P0001';
  end if;

  perform set_config('app.actor', v_profile.email, true);
  perform set_config('app.actor_role', v_profile.role::text, true);
  perform set_config('app.note', coalesce(p_note, ''), true);

  update public.cases set
    category           = coalesce(p_changes ->> 'category', category),
    current_priority   = coalesce((p_changes ->> 'current_priority')::public.case_priority, current_priority),
    assigned_to        = case when p_changes ? 'assigned_to' then nullif(p_changes ->> 'assigned_to', '') else assigned_to end,
    status             = coalesce((p_changes ->> 'status')::public.case_status, status),
    needs_human_review = coalesce((p_changes ->> 'needs_human_review')::boolean, needs_human_review),
    first_reviewed_at  = coalesce(first_reviewed_at, now())
  where id = p_case_id
  returning * into v_case;

  return to_jsonb(v_case);
end;
$$;

-- "Accept suggestion": confirma categoría/prioridad sugeridas y abre la revisión
create or replace function public.accept_suggestion(p_case_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.current_profile();
  v_case public.cases;
begin
  if v_profile.id is null or v_profile.role not in ('director', 'admin') then
    raise exception 'FORBIDDEN: only directors or admins can accept suggestions' using errcode = '42501';
  end if;
  select * into v_case from public.cases where id = p_case_id for update;
  if not found or not public.can_access_case(v_case.academic_program, v_case.assigned_to, v_case.sensitive) then
    raise exception 'NOT_FOUND: case not found or not accessible' using errcode = '42501';
  end if;

  perform set_config('app.actor', v_profile.email, true);
  perform set_config('app.actor_role', v_profile.role::text, true);
  perform set_config('app.note', coalesce(p_note, ''), true);

  insert into public.case_events (case_id, event_type, actor_label, new_value, metadata)
  values (p_case_id, 'suggestion_accepted', v_profile.email,
          jsonb_build_object('category', v_case.category, 'priority', v_case.current_priority),
          jsonb_strip_nulls(jsonb_build_object('note', p_note,
            'suggested_category', v_case.suggested_category, 'suggested_priority', v_case.suggested_priority)));

  update public.cases set
    needs_human_review = false,
    first_reviewed_at  = coalesce(first_reviewed_at, now()),
    status = case when status in ('received', 'classified') then 'under_review'::public.case_status else status end
  where id = p_case_id
  returning * into v_case;

  return to_jsonb(v_case);
end;
$$;

create or replace function public.add_case_note(p_case_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.current_profile();
  v_case public.cases;
begin
  if v_profile.id is null or v_profile.role = 'it' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'VALIDATION_ERROR: note is empty' using errcode = 'P0001';
  end if;
  select * into v_case from public.cases where id = p_case_id;
  if not found or not public.can_access_case(v_case.academic_program, v_case.assigned_to, v_case.sensitive) then
    raise exception 'NOT_FOUND: case not found or not accessible' using errcode = '42501';
  end if;
  insert into public.case_events (case_id, event_type, actor_label, new_value)
  values (p_case_id, 'note_added', v_profile.email, to_jsonb(left(p_note, 2000)));
  perform set_config('app.actor_role', 'system', true);
  update public.cases set last_activity_at = now(), first_reviewed_at = coalesce(first_reviewed_at, now()) where id = p_case_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alertas (FR-050..053). El cálculo vive en core/src/alerts.ts (n8n Workflow C o la UI);
-- esta función sincroniza sin duplicar y desactiva las que ya no aplican.
-- p_alerts = [{case_id, alert_type, severity, message}], p_case_ids = casos evaluados (null = todos los abiertos)
-- ---------------------------------------------------------------------------
create or replace function public.sync_alerts(p_alerts jsonb, p_case_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.current_profile();
  v_scope uuid[];
  v_created int := 0;
  v_deactivated int := 0;
  r record;
begin
  if not public.is_service_role() and (v_profile.id is null or v_profile.role not in ('admin', 'director', 'it')) then
    raise exception 'FORBIDDEN: cannot evaluate alerts' using errcode = '42501';
  end if;

  v_scope := coalesce(p_case_ids,
    (select coalesce(array_agg(id), '{}') from public.cases where status not in ('resolved', 'closed')));

  for r in
    select (a ->> 'case_id')::uuid as case_id, a ->> 'alert_type' as alert_type,
           coalesce(a ->> 'severity', 'warning') as severity, a ->> 'message' as message
    from jsonb_array_elements(coalesce(p_alerts, '[]'::jsonb)) a
  loop
    if not (r.case_id = any(v_scope)) then continue; end if;
    insert into public.alerts (case_id, alert_type, severity, message)
    values (r.case_id, r.alert_type, r.severity, r.message)
    on conflict (case_id, alert_type) where active do nothing;
    if found then
      v_created := v_created + 1;
      insert into public.case_events (case_id, event_type, actor_label, new_value)
      values (r.case_id, 'alert_triggered', 'system:alerts', jsonb_build_object('alert_type', r.alert_type, 'severity', r.severity));
    end if;
  end loop;

  with stale as (
    update public.alerts al set active = false, resolved_at = now()
    where al.active
      and (
        (al.case_id = any(v_scope) and not exists (
          select 1 from jsonb_array_elements(coalesce(p_alerts, '[]'::jsonb)) a
          where (a ->> 'case_id')::uuid = al.case_id and a ->> 'alert_type' = al.alert_type))
        or exists (select 1 from public.cases c where c.id = al.case_id and c.status in ('resolved', 'closed'))
      )
    returning 1
  )
  select count(*) into v_deactivated from stale;

  insert into public.ops_log (source, event, message, context)
  values ('alerts', 'alerts_synced', format('%s created, %s deactivated', v_created, v_deactivated),
          jsonb_build_object('evaluated_cases', coalesce(array_length(v_scope, 1), 0)));

  return jsonb_build_object('created', v_created, 'deactivated', v_deactivated,
                            'active_total', (select count(*) from public.alerts where active));
end;
$$;

create or replace function public.get_open_cases_for_alerts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('cases', coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'case_number', case_number, 'status', status, 'current_priority', current_priority,
    'sensitive', sensitive, 'needs_human_review', needs_human_review, 'received_at', received_at,
    'first_reviewed_at', first_reviewed_at, 'sla_due_at', sla_due_at,
    'detected_deadline', detected_deadline, 'last_activity_at', last_activity_at)), '[]'::jsonb))
  from public.cases where status not in ('resolved', 'closed');
$$;

create or replace function public.acknowledge_alert(p_alert_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.current_profile();
  v_alert public.alerts;
  v_case public.cases;
begin
  select * into v_alert from public.alerts where id = p_alert_id;
  if not found then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  select * into v_case from public.cases where id = v_alert.case_id;
  if v_profile.id is null or v_profile.role = 'it'
     or not public.can_access_case(v_case.academic_program, v_case.assigned_to, v_case.sensitive) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.alerts set acknowledged_at = now(), acknowledged_by = v_profile.email
  where id = p_alert_id and acknowledged_at is null;
  insert into public.case_events (case_id, event_type, actor_label, new_value)
  values (v_alert.case_id, 'alert_acknowledged', v_profile.email, jsonb_build_object('alert_type', v_alert.alert_type));
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo reset (FR-091): sólo admin con demo_mode=true, o service role
-- ---------------------------------------------------------------------------
create or replace function public.reset_demo()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.current_profile();
  v_cases int;
begin
  if not public.is_service_role() then
    if v_profile.id is null or v_profile.role <> 'admin' then
      raise exception 'FORBIDDEN: only admin can reset demo data' using errcode = '42501';
    end if;
    if public.cfg_text('demo_mode', 'false') <> 'true' then
      raise exception 'FORBIDDEN: demo_mode is disabled' using errcode = '42501';
    end if;
  end if;
  perform set_config('app.allow_event_purge', 'on', true);
  select count(*) into v_cases from public.cases;
  delete from public.alerts where true;  -- pg_safeupdate exige WHERE
  delete from public.classification_runs where true;
  delete from public.cases where true;
  delete from public.ops_log where source in ('ingest', 'alerts');
  perform setval('public.case_number_seq', 1, false);
  insert into public.ops_log (source, event, message, context)
  values ('admin', 'demo_reset', format('%s cases removed', v_cases),
          jsonb_build_object('actor', coalesce(v_profile.email, 'service_role')));
  return jsonb_build_object('deleted_cases', v_cases);
end;
$$;

-- ---------------------------------------------------------------------------
-- Métricas (FR-060). security_invoker => respetan RLS del usuario.
-- ---------------------------------------------------------------------------
create view public.case_metrics with (security_invoker = true) as
with c as (
  select c.*,
         c.status not in ('resolved', 'closed') as is_open,
         exists (select 1 from public.case_events e
                 where e.case_id = c.id and e.event_type in ('priority_override', 'category_override')
                   and e.actor_label not like 'system%') as overridden
  from public.cases c
)
select
  count(*)::int                                                               as total_received,
  count(*) filter (where is_open)::int                                        as pending,
  count(*) filter (where status = 'resolved')::int                            as resolved,
  count(*) filter (where status = 'closed')::int                              as closed,
  count(*) filter (where is_open and current_priority = 'urgent')::int        as urgent_open,
  count(*) filter (where is_open and needs_human_review)::int                 as review_pending,
  count(*) filter (where is_open and sensitive)::int                          as sensitive_open,
  count(*) filter (where is_open and first_reviewed_at is null and sla_due_at < now())::int as overdue,
  count(*) filter (where is_open and first_reviewed_at is null and sla_due_at >= now()
                   and sla_due_at < now() + make_interval(hours => public.cfg_num('sla_warning_hours', 4)::int))::int as due_soon,
  round(100.0 * count(*) filter (where first_reviewed_at is not null and first_reviewed_at <= sla_due_at)
        / nullif(count(*) filter (where first_reviewed_at is not null or sla_due_at < now()), 0), 1) as sla_compliance_percent,
  count(*) filter (where overridden)::int                                     as overridden_cases,
  round(100.0 * count(*) filter (where overridden)
        / nullif(count(*) filter (where first_reviewed_at is not null), 0), 1) as override_rate_percent,
  round((avg(extract(epoch from (first_reviewed_at - received_at))) filter (where first_reviewed_at is not null) / 3600)::numeric, 2)
                                                                              as avg_first_review_hours
from c;

create view public.classification_metrics with (security_invoker = true) as
select
  count(*)::int                                          as runs,
  count(*) filter (where success)::int                   as successful_runs,
  count(*) filter (where not success)::int               as failed_runs,
  round(avg(latency_ms))::int                            as avg_latency_ms,
  round(avg(confidence) filter (where success), 3)       as avg_confidence,
  count(*) filter (where provider = 'openai')::int       as openai_runs,
  count(*) filter (where provider = 'mock')::int         as mock_runs
from public.classification_runs;
