-- 0002 — Lógica de casos: SLA, máquina de estados, auditoría automática e inmutabilidad.
-- La auditoría vive en triggers para que NINGUNA ruta de actualización (UI, RPC, SQL) la evite.

-- ---------------------------------------------------------------------------
-- Helpers de configuración
-- ---------------------------------------------------------------------------
create or replace function public.cfg_text(p_key text, p_default text)
returns text language sql stable set search_path = public as $$
  select coalesce((select value #>> '{}' from public.app_config where key = p_key), p_default);
$$;

create or replace function public.cfg_num(p_key text, p_default numeric)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_config where key = p_key), p_default);
$$;

-- Fin del N-ésimo día hábil (lunes-viernes, sin festivos) desde p_from.
-- Misma semántica que addBusinessDays() en core/src/businessDays.ts.
create or replace function public.business_due(p_from timestamptz, p_days int)
returns timestamptz language plpgsql stable set search_path = public as $$
declare
  v_tz        text := public.cfg_text('timezone', 'America/Bogota');
  v_end_hour  int  := public.cfg_num('business_day_end_hour', 18)::int;
  v_local     timestamp := p_from at time zone v_tz;
  v_day       date := (p_from at time zone v_tz)::date;
  v_remaining int  := greatest(coalesce(p_days, 0), 0);
begin
  if extract(isodow from v_day) > 5 or extract(hour from v_local) >= v_end_hour then
    v_day := v_day + 1;
    while extract(isodow from v_day) > 5 loop
      v_day := v_day + 1;
    end loop;
  end if;
  while v_remaining > 0 loop
    v_day := v_day + 1;
    if extract(isodow from v_day) <= 5 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  return (v_day + make_interval(hours => v_end_hour)) at time zone v_tz;
end;
$$;

create or replace function public.sla_due_for(p_received timestamptz, p_priority public.case_priority)
returns timestamptz language sql stable set search_path = public as $$
  select public.business_due(p_received, s.first_review_business_days)
  from public.sla_config s
  where s.priority = p_priority and s.enabled;
$$;

-- ---------------------------------------------------------------------------
-- Contexto de actor (transaction-local): app.actor / app.actor_role / app.note
-- ---------------------------------------------------------------------------
create or replace function public.ctx_actor() returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.actor', true), ''), 'system');
$$;
create or replace function public.ctx_actor_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.actor_role', true), ''), 'system');
$$;
create or replace function public.ctx_note() returns text language sql stable as $$
  select nullif(current_setting('app.note', true), '');
$$;

-- ---------------------------------------------------------------------------
-- Triggers de cases
-- ---------------------------------------------------------------------------
create or replace function public.cases_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.case_number is null or new.case_number = '' then
    new.case_number := 'CASE-' || lpad(nextval('public.case_number_seq')::text, 4, '0');
  end if;
  new.suggested_category := coalesce(new.suggested_category, new.category);
  new.category := coalesce(new.category, new.suggested_category);
  new.current_priority := coalesce(new.current_priority, new.suggested_priority);
  new.sla_due_at := coalesce(new.sla_due_at, public.sla_due_for(new.received_at, new.current_priority));
  new.last_activity_at := coalesce(new.last_activity_at, new.received_at);
  return new;
end;
$$;

create or replace function public.cases_before_update()
returns trigger language plpgsql set search_path = public as $$
declare
  v_role text := public.ctx_actor_role();
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.status_transitions t
      where t.from_status = old.status and t.to_status = new.status
        and (not t.admin_only or v_role in ('admin', 'system'))
    ) then
      raise exception 'INVALID_TRANSITION: % -> % is not allowed', old.status, new.status
        using errcode = 'P0001';
    end if;
    if new.status = 'resolved' then
      new.resolved_at := coalesce(new.resolved_at, now());
    elsif new.status = 'closed' then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.closed_at := now();
    elsif old.status = 'closed' then
      -- reapertura (sólo admin): se limpian marcas de cierre, el historial las conserva
      new.closed_at := null;
      new.resolved_at := null;
    end if;
  end if;

  -- El SLA de primera revisión se recalcula sólo mientras no haya revisión humana
  if new.current_priority is distinct from old.current_priority and new.first_reviewed_at is null then
    new.sla_due_at := public.sla_due_for(new.received_at, new.current_priority);
  end if;

  if v_role <> 'system' and (
       new.status is distinct from old.status
    or new.current_priority is distinct from old.current_priority
    or new.category is distinct from old.category
    or new.assigned_to is distinct from old.assigned_to
    or new.needs_human_review is distinct from old.needs_human_review
  ) then
    new.last_activity_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.cases_audit_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.case_events (case_id, event_type, actor_label, new_value, metadata)
  values (
    new.id, 'case_created', public.ctx_actor(),
    jsonb_build_object('case_number', new.case_number, 'status', new.status, 'source_channel', new.source_channel),
    jsonb_build_object('source_message_id', new.source_message_id)
  );
  return null;
end;
$$;

create or replace function public.cases_audit_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public.ctx_actor();
  v_meta  jsonb := jsonb_strip_nulls(jsonb_build_object('actor_role', public.ctx_actor_role(), 'note', public.ctx_note()));
begin
  if new.current_priority is distinct from old.current_priority then
    insert into public.case_events (case_id, event_type, actor_label, field_name, old_value, new_value, metadata)
    values (new.id, 'priority_override', v_actor, 'current_priority', to_jsonb(old.current_priority), to_jsonb(new.current_priority),
            v_meta || jsonb_build_object('suggested_priority', new.suggested_priority));
  end if;
  if new.category is distinct from old.category then
    insert into public.case_events (case_id, event_type, actor_label, field_name, old_value, new_value, metadata)
    values (new.id, 'category_override', v_actor, 'category', to_jsonb(old.category), to_jsonb(new.category),
            v_meta || jsonb_build_object('suggested_category', new.suggested_category));
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.case_events (case_id, event_type, actor_label, field_name, old_value, new_value, metadata)
    values (new.id, 'reassignment', v_actor, 'assigned_to', to_jsonb(old.assigned_to), to_jsonb(new.assigned_to), v_meta);
  end if;
  if new.status is distinct from old.status then
    insert into public.case_events (case_id, event_type, actor_label, field_name, old_value, new_value, metadata)
    values (new.id, 'status_change', v_actor, 'status', to_jsonb(old.status), to_jsonb(new.status), v_meta);
  end if;
  if new.needs_human_review is distinct from old.needs_human_review then
    insert into public.case_events (case_id, event_type, actor_label, field_name, old_value, new_value, metadata)
    values (new.id, 'review_flag_change', v_actor, 'needs_human_review', to_jsonb(old.needs_human_review), to_jsonb(new.needs_human_review), v_meta);
  end if;
  if new.sensitive is distinct from old.sensitive then
    insert into public.case_events (case_id, event_type, actor_label, field_name, old_value, new_value, metadata)
    values (new.id, 'sensitivity_change', v_actor, 'sensitive', to_jsonb(old.sensitive), to_jsonb(new.sensitive), v_meta);
  end if;
  return null;
end;
$$;

-- Resuelve de inmediato las alertas que dejan de aplicar por una acción humana
-- (el Workflow C igualmente re-evalúa cada hora).
create or replace function public.cases_resolve_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    update public.alerts set active = false, resolved_at = now() where case_id = new.id and active;
  else
    if old.first_reviewed_at is null and new.first_reviewed_at is not null then
      update public.alerts set active = false, resolved_at = now()
      where case_id = new.id and active and alert_type in ('ALERT-001', 'ALERT-002', 'ALERT-005');
    end if;
    if new.last_activity_at is distinct from old.last_activity_at then
      update public.alerts set active = false, resolved_at = now()
      where case_id = new.id and active and alert_type = 'ALERT-003';
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_cases_before_insert before insert on public.cases
  for each row execute function public.cases_before_insert();
create trigger trg_cases_before_update before update on public.cases
  for each row execute function public.cases_before_update();
create trigger trg_cases_audit_insert after insert on public.cases
  for each row execute function public.cases_audit_insert();
create trigger trg_cases_audit_update after update on public.cases
  for each row execute function public.cases_audit_update();
create trigger trg_cases_resolve_alerts after update on public.cases
  for each row execute function public.cases_resolve_alerts();

-- ---------------------------------------------------------------------------
-- Inmutabilidad de case_events (sólo reset_demo puede purgar)
-- ---------------------------------------------------------------------------
create or replace function public.case_events_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_event_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'IMMUTABLE_AUDIT: case_events cannot be % ', lower(tg_op) using errcode = 'P0001';
end;
$$;

create trigger trg_case_events_immutable before update or delete on public.case_events
  for each row execute function public.case_events_immutable();

-- ---------------------------------------------------------------------------
-- Log de cambios de configuración (FR-080 auditable)
-- ---------------------------------------------------------------------------
create or replace function public.log_config_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ops_log (level, source, event, message, context)
  values ('info', 'admin', 'config_changed', tg_table_name || ' ' || lower(tg_op),
          jsonb_build_object('actor', coalesce(auth.jwt() ->> 'email', public.ctx_actor()),
                             'old', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                             'new', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return null;
end;
$$;

create trigger trg_log_app_config after insert or update or delete on public.app_config
  for each row execute function public.log_config_change();
create trigger trg_log_sla_config after insert or update or delete on public.sla_config
  for each row execute function public.log_config_change();
create trigger trg_log_categories after insert or update or delete on public.categories
  for each row execute function public.log_config_change();
create trigger trg_log_responsibles after insert or update or delete on public.responsibles
  for each row execute function public.log_config_change();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_app_config_touch before update on public.app_config
  for each row execute function public.touch_updated_at();
create trigger trg_sla_config_touch before update on public.sla_config
  for each row execute function public.touch_updated_at();
