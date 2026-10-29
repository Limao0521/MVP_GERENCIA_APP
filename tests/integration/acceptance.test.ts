/**
 * Pruebas de aceptación contra Supabase real (local o de pruebas) — data/acceptance_tests.csv.
 * Requiere: supabase start (o proyecto de pruebas), .env con SUPABASE_URL/SERVICE_ROLE/ANON y `npm run seed:users`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, evaluateAlerts, type AiProvider, type CaseForAlerts } from '../../core/src';
import { daysAgo, getCase, getEvents, hasDb, ingest, payload, service, userClient } from './helpers';
import { loadAppConfig } from '../../scripts/lib/env';

const DIRECTOR = 'director.informatica@example.edu';
const OTHER_DIRECTOR = 'director.civil@example.edu';

describe.skipIf(!hasDb)('acceptance (Supabase)', () => {
  it('AT-001 demo ingestion creates a case with a unique ID', async () => {
    const a = await ingest(payload());
    const b = await ingest(payload());
    expect(a.accepted).toBe(true);
    expect(a.case_number).toMatch(/^CASE-\d{4,}$/);
    expect(b.case_number).not.toBe(a.case_number);
    const c = await getCase(a.case_id!);
    expect(c.status).toBe('classified');
    expect(c.subject).toBe('Duda sobre electiva');
    const { data: runs } = await service().from('classification_runs').select('*').eq('case_id', a.case_id!);
    expect(runs).toHaveLength(1);
    expect(runs![0].provider).toBe('mock');
  });

  it('AT-002/AT-003 critical demo case: valid category, deadline detected, urgent suggested', async () => {
    const r = await ingest(payload({
      subject: 'Cancelación antes de fecha límite',
      body: 'Necesito cancelar una materia antes de mañana porque el sistema no me permite hacerlo y podría perder el plazo.',
    }));
    const c = await getCase(r.case_id!);
    expect(DEFAULT_CONFIG.responsible_by_category).toHaveProperty(c.category);
    expect(c.detected_deadline).not.toBeNull();
    expect(c.suggested_priority).toBe('urgent');
    expect(c.current_priority).toBe('urgent');
  });

  it('AT-004 sensitive case -> sensitive=true and human review, assigned to director', async () => {
    const r = await ingest(payload({ subject: 'Situación personal', body: 'Tengo una situación médica que está afectando mis clases y necesito orientación.' }));
    const c = await getCase(r.case_id!);
    expect(c.sensitive).toBe(true);
    expect(c.needs_human_review).toBe(true);
    expect(c.assigned_to).toBe('Director – Ing. Informática');
  });

  it('AT-005 low information -> human review', async () => {
    const r = await ingest(payload({ subject: 'Solicitud poco clara', body: 'Necesito ayuda con un tema de la universidad.' }));
    const c = await getCase(r.case_id!);
    expect(c.needs_human_review).toBe(true);
    expect(c.suggested_priority).toBe('medium');
  });

  it('AT-006 / AT-008 human override keeps suggestion and creates audited events', async () => {
    const r = await ingest(payload({ subject: 'URGENTE inscripción hoy', body: 'Hoy cierra la inscripción y SIGA no me deja registrar la materia.' }));
    const director = await userClient(DIRECTOR);
    const { error } = await director.rpc('update_case', {
      p_case_id: r.case_id,
      p_changes: { current_priority: 'high', category: 'Fechas y plazos' },
      p_note: 'Override de prueba',
    });
    expect(error).toBeNull();
    const c = await getCase(r.case_id!);
    expect(c.suggested_priority).toBe('urgent');
    expect(c.current_priority).toBe('high');
    expect(c.suggested_category).toBe('Matrícula');
    expect(c.category).toBe('Fechas y plazos');
    expect(c.first_reviewed_at).not.toBeNull();
    const events = await getEvents(r.case_id!);
    const prio = events.find((e) => e.event_type === 'priority_override')!;
    expect(prio.actor_label).toBe(DIRECTOR);
    expect(prio.old_value).toBe('urgent');
    expect(prio.new_value).toBe('high');
    expect(prio.metadata.note).toBe('Override de prueba');
    expect(prio.created_at).toBeTruthy();
    const cat = events.find((e) => e.event_type === 'category_override')!;
    expect([cat.old_value, cat.new_value]).toEqual(['Matrícula', 'Fechas y plazos']);
    // El director también ve el historial vía RLS
    const { data: visible } = await director.from('case_events').select('id').eq('case_id', r.case_id!);
    expect(visible!.length).toBe(events.length);
  });

  it('AT-007 / AT-015 status workflow received->closed via valid path sets resolved_at/closed_at', async () => {
    const r = await ingest(payload());
    const director = await userClient(DIRECTOR);
    for (const status of ['under_review', 'in_progress', 'waiting_information', 'in_progress', 'resolved', 'closed']) {
      const { error } = await director.rpc('update_case', { p_case_id: r.case_id, p_changes: { status } });
      expect(error, status).toBeNull();
    }
    const c = await getCase(r.case_id!);
    expect(c.status).toBe('closed');
    expect(c.resolved_at).not.toBeNull();
    expect(c.closed_at).not.toBeNull();
    const changes = (await getEvents(r.case_id!)).filter((e) => e.event_type === 'status_change').map((e) => `${e.old_value}->${e.new_value}`);
    expect(changes).toEqual([
      'received->classified',
      'classified->under_review',
      'under_review->in_progress',
      'in_progress->waiting_information',
      'waiting_information->in_progress',
      'in_progress->resolved',
      'resolved->closed',
    ]);
  });

  it('FR-041 invalid transitions are rejected and not audited', async () => {
    const r = await ingest(payload());
    const director = await userClient(DIRECTOR);
    const { error } = await director.rpc('update_case', { p_case_id: r.case_id, p_changes: { status: 'closed' } });
    expect(error?.message).toMatch(/INVALID_TRANSITION/);
    expect((await getCase(r.case_id!)).status).toBe('classified');
  });

  it('AT-009 overdue case -> active SLA alert visible to its director', async () => {
    const r = await ingest(payload({ received_at: daysAgo(10) }));
    const cfg = await loadAppConfig(service());
    const c = (await getCase(r.case_id!)) as CaseForAlerts;
    const alerts = evaluateAlerts([c], cfg, new Date());
    expect(alerts.map((a) => a.alert_type)).toContain('ALERT-002');
    await service().rpc('sync_alerts', { p_alerts: alerts, p_case_ids: [c.id] });
    const director = await userClient(DIRECTOR);
    const { data } = await director.from('alerts').select('*').eq('case_id', c.id).eq('active', true);
    expect(data!.map((a) => a.alert_type)).toContain('ALERT-002');
    // Sin duplicados al re-sincronizar
    await service().rpc('sync_alerts', { p_alerts: alerts, p_case_ids: [c.id] });
    const { data: again } = await service().from('alerts').select('id').eq('case_id', c.id).eq('alert_type', 'ALERT-002').eq('active', true);
    expect(again).toHaveLength(1);
  });

  it('AT-010 no management for 2 business days -> follow-up alert; resolved after review', async () => {
    const r = await ingest(payload({ received_at: daysAgo(6) }));
    const cfg = await loadAppConfig(service());
    const c = (await getCase(r.case_id!)) as CaseForAlerts;
    const alerts = evaluateAlerts([c], cfg, new Date());
    expect(alerts.map((a) => a.alert_type)).toContain('ALERT-003');
    await service().rpc('sync_alerts', { p_alerts: alerts, p_case_ids: [c.id] });
    // Gestión humana -> al recalcular, la alerta de seguimiento se desactiva
    const director = await userClient(DIRECTOR);
    await director.rpc('accept_suggestion', { p_case_id: c.id });
    const after = (await getCase(c.id)) as CaseForAlerts;
    const next = evaluateAlerts([after], cfg, new Date());
    expect(next.map((a) => a.alert_type)).not.toContain('ALERT-003');
    await service().rpc('sync_alerts', { p_alerts: next, p_case_ids: [c.id] });
    const { data } = await service().from('alerts').select('alert_type,active').eq('case_id', c.id).eq('alert_type', 'ALERT-003');
    expect(data!.every((a) => !a.active)).toBe(true);
  });

  it('closing a case resolves its active alerts immediately', async () => {
    const r = await ingest(payload({ received_at: daysAgo(10) }));
    const cfg = await loadAppConfig(service());
    const c = (await getCase(r.case_id!)) as CaseForAlerts;
    await service().rpc('sync_alerts', { p_alerts: evaluateAlerts([c], cfg, new Date()), p_case_ids: [c.id] });
    const director = await userClient(DIRECTOR);
    for (const status of ['under_review', 'in_progress', 'resolved']) {
      await director.rpc('update_case', { p_case_id: c.id, p_changes: { status } });
    }
    const { data } = await service().from('alerts').select('id').eq('case_id', c.id).eq('active', true);
    expect(data).toHaveLength(0);
  });

  it('AT-011 AI provider failure -> case persists and requires human review', async () => {
    const failing: AiProvider = { name: 'openai', model: 'gpt-4o-mini', analyze: async () => { throw new Error('simulated timeout'); } };
    const r = await ingest(payload(), failing);
    expect(r.accepted).toBe(true);
    const c = await getCase(r.case_id!);
    expect(c.status).toBe('received');
    expect(c.needs_human_review).toBe(true);
    expect(c.category).toBe('Otros');
    const { data: runs } = await service().from('classification_runs').select('*').eq('case_id', c.id);
    expect(runs![0].success).toBe(false);
    expect(runs![0].error_message).toBe('simulated timeout');
    expect((await getEvents(c.id)).map((e) => e.event_type)).toContain('classification_failed');
    // Un humano puede tomarlo directamente
    const director = await userClient(DIRECTOR);
    const { error } = await director.rpc('update_case', { p_case_id: c.id, p_changes: { status: 'under_review', category: 'Asignaturas' } });
    expect(error).toBeNull();
  });

  it('AT-012 idempotency: same source_message_id twice -> one case', async () => {
    const p = payload();
    const a = await ingest(p);
    const b = await ingest(p);
    expect(b.duplicate).toBe(true);
    expect(b.case_id).toBe(a.case_id);
    const { count } = await service().from('cases').select('id', { count: 'exact', head: true }).eq('source_message_id', p.source_message_id!);
    expect(count).toBe(1);
  });

  it('AT-013 dashboard metrics match DB counts (admin)', async () => {
    const admin = await userClient('admin@example.edu');
    const { data: m } = await admin.from('case_metrics').select('*').single();
    const sb = service();
    const total = (await sb.from('cases').select('id', { count: 'exact', head: true })).count;
    const closed = (await sb.from('cases').select('id', { count: 'exact', head: true }).eq('status', 'closed')).count;
    const pending = (await sb.from('cases').select('id', { count: 'exact', head: true }).not('status', 'in', '(resolved,closed)')).count;
    const urgent = (await sb.from('cases').select('id', { count: 'exact', head: true }).eq('current_priority', 'urgent').not('status', 'in', '(resolved,closed)')).count;
    expect(m!.total_received).toBe(total);
    expect(m!.closed).toBe(closed);
    expect(m!.pending).toBe(pending);
    expect(m!.urgent_open).toBe(urgent);
  });

  it('AT-014 filter urgent + open returns only matching cases', async () => {
    const director = await userClient(DIRECTOR);
    const { data } = await director.from('cases').select('current_priority,status').eq('current_priority', 'urgent').not('status', 'in', '(resolved,closed)');
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((c) => c.current_priority === 'urgent' && !['resolved', 'closed'].includes(c.status))).toBe(true);
  });

  it('AT-016 Demo Mode without OpenAI/Outlook: director injects via demo_ingest_case', async () => {
    const director = await userClient(DIRECTOR);
    const { data, error } = await director.rpc('demo_ingest_case', {
      p: {
        ...payload(),
        ai: { category: 'Asignaturas', urgency: 'medium', impact: 'medium', confidence: 0.9, summary: 'x', sensitive: false },
        rules: { suggested_priority: 'medium', needs_human_review: false, rule_hits: [] },
        run: { provider: 'mock', model: 'mock-lexicon-v1', success: true },
      },
    });
    expect(error).toBeNull();
    expect(data.accepted).toBe(true);
    const events = await getEvents(data.case_id);
    expect(events[0].actor_label).toBe(`demo:${DIRECTOR}`);
  });

  it('AT-018 RLS: director sees only own program; administrative never sees sensitive; anon sees nothing', async () => {
    const r = await ingest(payload());
    const other = await userClient(OTHER_DIRECTOR);
    const { data: own } = await other.from('cases').select('academic_program');
    expect(own!.every((c) => c.academic_program === 'Ingeniería Civil')).toBe(true);
    const { data: hidden } = await other.from('cases').select('id').eq('id', r.case_id!);
    expect(hidden).toHaveLength(0);
    const { error: upd } = await other.rpc('update_case', { p_case_id: r.case_id, p_changes: { current_priority: 'low' } });
    expect(upd?.message).toMatch(/NOT_FOUND/);

    const adm = await userClient('administrativo@example.edu');
    const { data: admCases } = await adm.from('cases').select('assigned_to,sensitive');
    expect(admCases!.every((c) => c.assigned_to === 'Asistente administrativo' && !c.sensitive)).toBe(true);

    const anon = (await import('@supabase/supabase-js')).createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { data: anonCases } = await anon.from('cases').select('id');
    expect(anonCases ?? []).toHaveLength(0);
  });

  it('roles: administrative cannot override priority; IT is read-only', async () => {
    const r = await ingest(payload({ subject: 'Certificado', body: '¿Dónde puedo solicitar un certificado de estudios?' }));
    const adm = await userClient('administrativo@example.edu');
    const { error } = await adm.rpc('update_case', { p_case_id: r.case_id, p_changes: { current_priority: 'urgent' } });
    expect(error?.message).toMatch(/FORBIDDEN/);
    const { error: ok } = await adm.rpc('update_case', { p_case_id: r.case_id, p_changes: { status: 'under_review' } });
    expect(ok).toBeNull();
    const it = await userClient('ti@example.edu');
    const { error: itErr } = await it.rpc('update_case', { p_case_id: r.case_id, p_changes: { status: 'in_progress' } });
    expect(itErr?.message).toMatch(/FORBIDDEN/);
    const { error: direct } = await it.from('cases').update({ current_priority: 'low' }).eq('id', r.case_id!);
    expect(direct).not.toBeNull();
  });

  it('audit trail is immutable (no update/delete, even with service role)', async () => {
    const r = await ingest(payload());
    const events = await getEvents(r.case_id!);
    const { error: upd } = await service().from('case_events').update({ actor_label: 'tampered' }).eq('id', events[0].id);
    expect(upd?.message).toMatch(/IMMUTABLE_AUDIT/);
    const { error: del } = await service().from('case_events').delete().eq('id', events[0].id);
    expect(del?.message).toMatch(/IMMUTABLE_AUDIT/);
  });
});
