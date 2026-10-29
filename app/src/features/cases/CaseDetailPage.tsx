import { PRIORITIES, type CaseStatus, type Priority } from '@core';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CaseFlags,
  Empty,
  ErrorState,
  Loading,
  PriorityBadge,
  SlaBadge,
  StatusBadge,
  Toast,
  useAsync,
} from '../../components/ui';
import {
  acceptSuggestion,
  acknowledgeAlert,
  addNote,
  fetchAlerts,
  fetchCase,
  fetchCatalogs,
  fetchEvents,
  fetchRuns,
  updateCase,
  type CaseChanges,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  ALERT_LABEL,
  EVENT_LABEL,
  LEVEL_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  errorMessage,
  fmtDateTime,
  fmtValue,
} from '../../lib/format';
import type { CaseEvent } from '../../types/db';

export function CaseDetailPage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const caseQ = useAsync(() => fetchCase(id), [id]);
  const events = useAsync(() => fetchEvents(id), [id]);
  const alerts = useAsync(() => fetchAlerts({ caseId: id }), [id]);
  const runs = useAsync(() => fetchRuns(id), [id]);
  const catalogs = useAsync(fetchCatalogs);
  const [toast, setToast] = useState<{ msg: string; kind: 'info' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  const c = caseQ.data;
  const [draft, setDraft] = useState<{ category: string; priority: Priority | ''; assigned: string; note: string }>({
    category: '',
    priority: '',
    assigned: '',
    note: '',
  });
  useEffect(() => {
    if (c) setDraft({ category: c.category ?? '', priority: c.current_priority ?? '', assigned: c.assigned_to ?? '', note: '' });
  }, [c]);

  if (caseQ.loading && !c) return <Loading label="Cargando caso…" />;
  if (caseQ.error) return <ErrorState message={caseQ.error} onRetry={caseQ.reload} />;
  if (!c) return <Empty>Caso no encontrado o sin permisos para verlo.</Empty>;

  const role = profile?.role;
  const canDecide = role === 'director' || role === 'admin';
  const canChangeStatus = canDecide || role === 'administrative';
  const transitions = (catalogs.data?.transitions ?? []).filter(
    (t) => t.from_status === c.status && (!t.admin_only || role === 'admin'),
  );
  const isOpen = c.status !== 'resolved' && c.status !== 'closed';

  const refreshAll = async () => {
    await Promise.all([caseQ.reload(), events.reload(), alerts.reload()]);
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setToast({ msg: `${label}: registrado en auditoría`, kind: 'info' });
      await refreshAll();
    } catch (e) {
      setToast({ msg: errorMessage(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const changes: CaseChanges = {};
  if (draft.category && draft.category !== c.category) changes.category = draft.category;
  if (draft.priority && draft.priority !== c.current_priority) changes.current_priority = draft.priority;
  if (draft.assigned !== (c.assigned_to ?? '')) changes.assigned_to = draft.assigned || null;
  const hasChanges = Object.keys(changes).length > 0;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="small">
            <Link to="/cases">← Bandeja</Link>
          </p>
          <h1>
            <span className="mono">{c.case_number}</span> · {c.subject}
          </h1>
          <div className="actions">
            <PriorityBadge priority={c.current_priority} />
            <StatusBadge status={c.status} />
            <SlaBadge c={c} warningHours={catalogs.data?.config.sla_warning_hours ?? 4} />
            <CaseFlags c={c} />
          </div>
        </div>
        <button className="btn" onClick={() => void refreshAll()}>
          ↻ Actualizar
        </button>
      </div>

      {c.sensitive && (
        <div className="warning-box" role="alert">
          <strong>🔒 Caso sensible</strong> ({c.sensitive_reason ?? 'información de tratamiento especial'}). No se ejecutan acciones
          automáticas; el tratamiento y cualquier respuesta requieren decisión humana. Acceso restringido por rol.
        </div>
      )}
      {c.needs_human_review && (
        <div className="review-box" role="note">
          <strong>👁 Revisión humana requerida.</strong> Motivos posibles: confianza baja, información insuficiente, caso sensible o
          fallo de IA. Confirme o corrija la clasificación.
        </div>
      )}

      <div className="detail-grid">
        <div>
          <section className="card" aria-labelledby="msg-h">
            <h2 id="msg-h">Mensaje original</h2>
            <dl className="kv">
              <dt>Remitente</dt>
              <dd>{c.sender_email ?? '—'}</dd>
              <dt>Destinatario</dt>
              <dd>{c.recipient_email ?? '—'}</dd>
              <dt>Programa</dt>
              <dd>{c.academic_program ?? '—'}</dd>
              <dt>Canal</dt>
              <dd>{c.source_channel}</dd>
              <dt>Recibido</dt>
              <dd>{fmtDateTime(c.received_at)}</dd>
              <dt>Asunto</dt>
              <dd>{c.subject}</dd>
            </dl>
            <div className="message-body">{c.message_body}</div>
          </section>

          <section className="card" aria-labelledby="ai-h">
            <h2 id="ai-h">Análisis IA (sugerencia)</h2>
            <dl className="kv">
              <dt>Resumen</dt>
              <dd>{c.ai_summary ?? '—'}</dd>
              <dt>Categoría sugerida</dt>
              <dd>{c.suggested_category ?? '—'}</dd>
              <dt>Confianza</dt>
              <dd>
                {c.ai_confidence !== null ? `${Math.round(Number(c.ai_confidence) * 100)} %` : '—'}
                {c.ai_confidence !== null && Number(c.ai_confidence) < (catalogs.data?.config.ai_low_confidence_threshold ?? 0.7) && (
                  <span className="small muted"> (bajo el umbral)</span>
                )}
              </dd>
              <dt>Urgencia</dt>
              <dd>{LEVEL_LABEL[c.ai_urgency ?? 'unknown'] ?? c.ai_urgency}</dd>
              <dt>Impacto</dt>
              <dd>{LEVEL_LABEL[c.ai_impact ?? 'unknown'] ?? c.ai_impact}</dd>
              <dt>Fecha límite detectada</dt>
              <dd>
                {fmtDateTime(c.detected_deadline)}
                {c.detected_deadline && <span className="small muted"> {c.ai_deadline_explicit ? '(explícita)' : '(inferida)'}</span>}
              </dd>
              <dt>Responsable sugerido</dt>
              <dd>{c.suggested_responsible ?? '—'}</dd>
              <dt>Justificación</dt>
              <dd>{c.ai_reasoning_summary || '—'}</dd>
              <dt>Reglas aplicadas</dt>
              <dd className="mono">{c.rule_hits.length ? c.rule_hits.join(', ') : '—'}</dd>
            </dl>
            {runs.data && runs.data.length > 0 && (
              <p className="small muted" style={{ marginTop: '0.75rem' }}>
                Ejecución del clasificador:{' '}
                {runs.data
                  .map(
                    (r) =>
                      `${r.provider}${r.model ? ` (${r.model})` : ''} · ${r.success ? 'ok' : `falló: ${r.error_message ?? ''}`} · ${r.latency_ms ?? '?'} ms`,
                  )
                  .join(' | ')}
              </p>
            )}
          </section>

          <section className="card" aria-labelledby="tl-h">
            <h2 id="tl-h">Historial / auditoría</h2>
            {events.loading && !events.data ? <Loading /> : events.error ? <ErrorState message={events.error} /> : <Timeline events={events.data ?? []} />}
          </section>
        </div>

        <div>
          <section className="card" aria-labelledby="op-h">
            <h2 id="op-h">Decisión operativa</h2>
            <div className="compare">
              <div>
                <div className="caption">Sugerido por el sistema</div>
                <PriorityBadge priority={c.suggested_priority} />
                <div className="small">{c.suggested_category}</div>
                <div className="small muted">{c.suggested_responsible}</div>
              </div>
              <div>
                <div className="caption">Decisión vigente</div>
                <PriorityBadge priority={c.current_priority} />
                <div className="small">{c.category}</div>
                <div className="small muted">{c.assigned_to ?? 'Sin asignar'}</div>
              </div>
            </div>

            {canDecide && isOpen && (
              <>
                {(c.needs_human_review || !c.first_reviewed_at) && (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', marginBottom: '0.75rem' }}
                    disabled={busy}
                    onClick={() => run('Sugerencia aceptada', () => acceptSuggestion(c.id, draft.note || undefined))}
                  >
                    ✓ Aceptar sugerencia y pasar a revisión
                  </button>
                )}
                <div className="grid" style={{ gap: '0.5rem' }}>
                  <label className="field">
                    Categoría
                    <select aria-label="Categoría" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                      {(catalogs.data?.categories ?? []).filter((x) => x.active || x.name === c.category).map((x) => (
                        <option key={x.id} value={x.name}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Prioridad
                    <select aria-label="Prioridad" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                          {p === c.suggested_priority ? ' (sugerida)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Responsable
                    <select aria-label="Responsable" value={draft.assigned} onChange={(e) => setDraft({ ...draft, assigned: e.target.value })}>
                      <option value="">Sin asignar</option>
                      {(catalogs.data?.responsibles ?? []).filter((r) => r.active || r.label === c.assigned_to).map((r) => (
                        <option key={r.id} value={r.label}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Nota / justificación (queda en auditoría)
                    <textarea rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                  </label>
                  <div className="actions">
                    <button
                      className="btn btn-primary"
                      disabled={busy || !hasChanges}
                      onClick={() => run('Cambios guardados', () => updateCase(c.id, changes, draft.note || undefined))}
                    >
                      Guardar cambios
                    </button>
                    <button
                      className="btn"
                      disabled={busy || !draft.note.trim()}
                      onClick={() => run('Nota agregada', () => addNote(c.id, draft.note))}
                    >
                      Agregar sólo nota
                    </button>
                  </div>
                </div>
              </>
            )}
            {!canDecide && <p className="small muted">Su rol no permite modificar categoría, prioridad ni responsable.</p>}
          </section>

          <section className="card" aria-labelledby="st-h">
            <h2 id="st-h">Estado</h2>
            <p>
              Actual: <StatusBadge status={c.status} />
            </p>
            <dl className="kv small">
              <dt>Primera revisión</dt>
              <dd>{fmtDateTime(c.first_reviewed_at)}</dd>
              <dt>SLA primera revisión</dt>
              <dd>{fmtDateTime(c.sla_due_at)}</dd>
              <dt>Resuelto</dt>
              <dd>{fmtDateTime(c.resolved_at)}</dd>
              <dt>Cerrado</dt>
              <dd>{fmtDateTime(c.closed_at)}</dd>
            </dl>
            {canChangeStatus && transitions.length > 0 ? (
              <div className="actions" style={{ marginTop: '0.75rem' }}>
                {transitions.map((t) => (
                  <button
                    key={t.to_status}
                    className={`btn ${t.to_status === 'resolved' || t.to_status === 'closed' ? 'btn-primary' : ''}`}
                    disabled={busy}
                    onClick={() =>
                      run(`Estado → ${STATUS_LABEL[t.to_status]}`, () =>
                        updateCase(c.id, { status: t.to_status as CaseStatus }, draft.note || undefined),
                      )
                    }
                  >
                    → {STATUS_LABEL[t.to_status]}
                    {t.admin_only ? ' (admin)' : ''}
                  </button>
                ))}
              </div>
            ) : (
              <p className="small muted">No hay transiciones disponibles para su rol.</p>
            )}
          </section>

          <section className="card" aria-labelledby="al-h">
            <h2 id="al-h">Alertas</h2>
            {alerts.data && alerts.data.length === 0 && <p className="muted small">Sin alertas.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(alerts.data ?? []).map((a) => (
                <li key={a.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--grid)' }}>
                  <strong className={`sev-${a.severity}`}>
                    {a.severity === 'critical' ? '⛔' : '⚠'} {ALERT_LABEL[a.alert_type] ?? a.alert_type}
                  </strong>{' '}
                  <span className="small muted">
                    {a.active ? 'activa' : 'resuelta'}
                    {a.acknowledged_at ? ` · reconocida por ${a.acknowledged_by}` : ''}
                  </span>
                  <div className="small">{a.message}</div>
                  {a.active && !a.acknowledged_at && role !== 'it' && (
                    <button className="btn btn-sm" disabled={busy} onClick={() => run('Alerta reconocida', () => acknowledgeAlert(a.id))}>
                      Reconocer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </>
  );
}

function Timeline({ events }: { events: CaseEvent[] }) {
  if (events.length === 0) return <p className="muted">Sin eventos.</p>;
  return (
    <ol className="timeline">
      {events.map((e) => {
        const human = !e.actor_label.startsWith('system') && !e.actor_label.startsWith('script') && !e.actor_label.startsWith('n8n');
        const note = typeof e.metadata?.note === 'string' ? e.metadata.note : null;
        return (
          <li key={e.id} className={human ? 'human' : undefined}>
            <div>
              <strong>{EVENT_LABEL[e.event_type] ?? e.event_type}</strong> <span className="small">por {e.actor_label}</span>
            </div>
            <div className="when">{fmtDateTime(e.created_at)}</div>
            {e.field_name && (
              <div className="change">
                <span className="mono">{e.field_name}</span>: {fmtValue(e.old_value)} → <strong>{fmtValue(e.new_value)}</strong>
              </div>
            )}
            {!e.field_name && e.new_value != null && e.event_type !== 'case_created' && (
              <div className="change">{typeof e.new_value === 'string' ? e.new_value : summarize(e.new_value)}</div>
            )}
            {note && <div className="change">Nota: “{note}”</div>}
          </li>
        );
      })}
    </ol>
  );
}

function summarize(v: unknown): string {
  if (!v || typeof v !== 'object') return fmtValue(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${k}: ${fmtValue(val)}`)
    .join(' · ');
}
