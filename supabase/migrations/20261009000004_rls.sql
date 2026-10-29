-- 0004 — Seguridad: RLS, mínimo privilegio y permisos de ejecución (11_SECURITY_AND_GOVERNANCE.md)
-- * anon: sin acceso.
-- * authenticated: lectura según rol; escritura de casos SÓLO mediante RPC auditadas.
-- * service_role (n8n): ingesta y alertas.

alter table public.app_config          enable row level security;
alter table public.categories          enable row level security;
alter table public.sla_config          enable row level security;
alter table public.responsibles        enable row level security;
alter table public.profiles            enable row level security;
alter table public.status_transitions  enable row level security;
alter table public.cases               enable row level security;
alter table public.case_events         enable row level security;
alter table public.classification_runs enable row level security;
alter table public.alerts              enable row level security;
alter table public.ops_log             enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
-- Configuración editable por admin (las políticas restringen a rol admin)
grant insert, update on public.app_config, public.categories, public.sla_config, public.responsibles to authenticated;

-- Catálogos y configuración: lectura para cualquier usuario autenticado
create policy config_read on public.app_config for select to authenticated using (true);
create policy categories_read on public.categories for select to authenticated using (true);
create policy sla_read on public.sla_config for select to authenticated using (true);
create policy responsibles_read on public.responsibles for select to authenticated using (true);
create policy transitions_read on public.status_transitions for select to authenticated using (true);

create policy config_admin_write on public.app_config for update to authenticated
  using ((public.current_profile()).role = 'admin') with check ((public.current_profile()).role = 'admin');
create policy categories_admin_insert on public.categories for insert to authenticated
  with check ((public.current_profile()).role = 'admin');
create policy categories_admin_update on public.categories for update to authenticated
  using ((public.current_profile()).role = 'admin') with check ((public.current_profile()).role = 'admin');
create policy sla_admin_update on public.sla_config for update to authenticated
  using ((public.current_profile()).role = 'admin') with check ((public.current_profile()).role = 'admin');
create policy responsibles_admin_insert on public.responsibles for insert to authenticated
  with check ((public.current_profile()).role = 'admin');
create policy responsibles_admin_update on public.responsibles for update to authenticated
  using ((public.current_profile()).role = 'admin') with check ((public.current_profile()).role = 'admin');

-- Perfiles: cada uno ve el suyo; admin/IT ven todos
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (public.current_profile()).role in ('admin', 'it'));

-- Casos: director -> su programa; administrativo -> asignados no sensibles; admin/IT -> todos (AT-018)
create policy cases_read on public.cases for select to authenticated
  using (public.can_access_case(academic_program, assigned_to, sensitive));

-- Tablas hijas: visibles si el caso es visible
create policy events_read on public.case_events for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id));
create policy runs_read on public.classification_runs for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id));
create policy alerts_read on public.alerts for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id));

-- Log operativo: admin e IT
create policy ops_log_read on public.ops_log for select to authenticated
  using ((public.current_profile()).role in ('admin', 'it'));

-- ---------------------------------------------------------------------------
-- Permisos de ejecución de funciones
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.ingest_case(jsonb),
  public.find_case_by_source(text),
  public.get_open_cases_for_alerts(),
  public.sync_alerts(jsonb, uuid[]),
  public.reset_demo()
to service_role;

grant execute on function
  public.update_case(uuid, jsonb, text),
  public.accept_suggestion(uuid, text),
  public.add_case_note(uuid, text),
  public.acknowledge_alert(uuid),
  public.sync_alerts(jsonb, uuid[]),
  public.demo_ingest_case(jsonb),
  public.reset_demo(),
  -- usadas por políticas y vistas
  public.current_profile(),
  public.can_access_case(text, text, boolean),
  public.cfg_text(text, text),
  public.cfg_num(text, numeric)
to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
