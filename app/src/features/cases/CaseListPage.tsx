import { CATEGORIES, PRIORITIES, PRIORITY_RANK, STATUSES, type Priority } from '@core';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CaseFlags, Empty, ErrorState, Loading, PriorityBadge, SlaBadge, StatusBadge, useAsync } from '../../components/ui';
import { fetchCases, fetchCatalogs } from '../../lib/api';
import { PRIORITY_LABEL, STATUS_LABEL, fmtDate, fmtDateTime } from '../../lib/format';
import type { CaseRow } from '../../types/db';

type SortKey = 'priority' | 'deadline' | 'received';
const OPEN = new Set(['received', 'classified', 'under_review', 'in_progress', 'waiting_information']);

export function CaseListPage() {
  const cases = useAsync(fetchCases);
  const catalogs = useAsync(fetchCatalogs);
  const [params, setParams] = useSearchParams();
  const f = (k: string) => params.get(k) ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const sort = (f('sort') || 'priority') as SortKey;
  const warningHours = catalogs.data?.config.sla_warning_hours ?? 4;

  const programs = useMemo(() => [...new Set((cases.data ?? []).map((c) => c.academic_program).filter(Boolean))].sort() as string[], [cases.data]);
  const assignees = useMemo(() => [...new Set((cases.data ?? []).map((c) => c.assigned_to).filter(Boolean))].sort() as string[], [cases.data]);

  const rows = useMemo(() => {
    const q = f('q').toLowerCase();
    const filtered = (cases.data ?? []).filter((c) => {
      if (f('priority') && c.current_priority !== f('priority')) return false;
      if (f('category') && c.category !== f('category')) return false;
      if (f('status') === 'open' && !OPEN.has(c.status)) return false;
      if (f('status') && f('status') !== 'open' && c.status !== f('status')) return false;
      if (f('program') && c.academic_program !== f('program')) return false;
      if (f('assigned') && c.assigned_to !== f('assigned')) return false;
      if (f('from') && c.received_at < new Date(`${f('from')}T00:00:00-05:00`).toISOString()) return false;
      if (f('to') && c.received_at > new Date(`${f('to')}T23:59:59-05:00`).toISOString()) return false;
      if (f('deadline_before') && (!c.detected_deadline || c.detected_deadline > new Date(`${f('deadline_before')}T23:59:59-05:00`).toISOString())) return false;
      if (f('review') === '1' && !c.needs_human_review) return false;
      if (f('sensitive') === '1' && !c.sensitive) return false;
      if (q && !`${c.case_number} ${c.subject} ${c.sender_email ?? ''} ${c.ai_summary ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return filtered.sort((a, b) => compare(a, b, sort));
  }, [cases.data, params, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cases.loading && !cases.data) return <Loading label="Cargando bandeja…" />;
  if (cases.error) return <ErrorState message={cases.error} onRetry={cases.reload} />;

  const urgentOpen = rows.filter((c) => c.current_priority === 'urgent' && OPEN.has(c.status)).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bandeja de casos</h1>
          <p>
            {rows.length} de {cases.data?.length ?? 0} casos · <strong>{urgentOpen}</strong> urgentes abiertos en la vista
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => void cases.reload()}>
            ↻ Actualizar
          </button>
          <button className="btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Limpiar filtros
          </button>
        </div>
      </div>

      <section className="card" aria-label="Filtros" style={{ marginBottom: '1rem' }}>
        <div className="filters">
          <label className="field">
            Buscar
            <input value={f('q')} onChange={(e) => set('q', e.target.value)} placeholder="Asunto, número, remitente" />
          </label>
          <Select label="Prioridad" value={f('priority')} onChange={(v) => set('priority', v)} options={PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]])} />
          <Select label="Categoría" value={f('category')} onChange={(v) => set('category', v)} options={CATEGORIES.map((c) => [c, c])} />
          <Select
            label="Estado"
            value={f('status')}
            onChange={(v) => set('status', v)}
            options={[['open', 'Abiertos (todos)'], ...STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string])]}
          />
          <Select label="Programa" value={f('program')} onChange={(v) => set('program', v)} options={programs.map((p) => [p, p])} />
          <Select label="Responsable" value={f('assigned')} onChange={(v) => set('assigned', v)} options={assignees.map((p) => [p, p])} />
          <label className="field">
            Recibido desde
            <input type="date" value={f('from')} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className="field">
            Recibido hasta
            <input type="date" value={f('to')} onChange={(e) => set('to', e.target.value)} />
          </label>
          <label className="field">
            Fecha límite antes de
            <input type="date" value={f('deadline_before')} onChange={(e) => set('deadline_before', e.target.value)} />
          </label>
          <Select
            label="Ordenar por"
            value={sort}
            allowEmpty={false}
            onChange={(v) => set('sort', v)}
            options={[
              ['priority', 'Prioridad'],
              ['deadline', 'Fecha límite'],
              ['received', 'Recepción (más antiguo)'],
            ]}
          />
          <div className="checks">
            <label>
              <input type="checkbox" checked={f('review') === '1'} onChange={(e) => set('review', e.target.checked ? '1' : '')} /> Revisión humana
            </label>
            <label>
              <input type="checkbox" checked={f('sensitive') === '1'} onChange={(e) => set('sensitive', e.target.checked ? '1' : '')} /> Sensibles
            </label>
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <Empty>No hay casos que coincidan con los filtros.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Caso</th>
                <th>
                  <button onClick={() => set('sort', 'received')}>Recibido</button>
                </th>
                <th>Asunto</th>
                <th>Categoría</th>
                <th>
                  <button onClick={() => set('sort', 'priority')}>Prioridad</button>
                </th>
                <th>Estado</th>
                <th>
                  <button onClick={() => set('sort', 'deadline')}>Fecha límite</button>
                </th>
                <th>Responsable</th>
                <th>SLA</th>
                <th>Banderas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.current_priority === 'urgent' && OPEN.has(c.status) ? 'row-urgent' : undefined}>
                  <td className="num mono">
                    <Link to={`/cases/${c.id}`}>{c.case_number}</Link>
                  </td>
                  <td className="num">{fmtDateTime(c.received_at)}</td>
                  <td className="subject-cell">
                    <Link to={`/cases/${c.id}`}>{c.subject}</Link>
                    <small>{c.academic_program}</small>
                  </td>
                  <td>{c.category}</td>
                  <td>
                    <PriorityBadge priority={c.current_priority} />
                    {c.current_priority !== c.suggested_priority && (
                      <div className="small muted" title="Prioridad modificada por una persona">
                        sugerida: {c.suggested_priority ? PRIORITY_LABEL[c.suggested_priority] : '—'}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="num">{fmtDate(c.detected_deadline)}</td>
                  <td>{c.assigned_to ?? '—'}</td>
                  <td>
                    <SlaBadge c={c} warningHours={warningHours} />
                  </td>
                  <td>
                    <CaseFlags c={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function compare(a: CaseRow, b: CaseRow, sort: SortKey): number {
  const rank = (p: Priority | null) => (p ? PRIORITY_RANK[p] : -1);
  const deadline = (c: CaseRow) => (c.detected_deadline ? new Date(c.detected_deadline).getTime() : Number.POSITIVE_INFINITY);
  const received = (c: CaseRow) => new Date(c.received_at).getTime();
  const open = (c: CaseRow) => (OPEN.has(c.status) ? 0 : 1);
  if (sort === 'deadline') return deadline(a) - deadline(b) || rank(b.current_priority) - rank(a.current_priority);
  if (sort === 'received') return received(a) - received(b);
  // Prioridad: abiertos primero, luego prioridad, fecha límite más cercana y recepción más antigua
  return (
    open(a) - open(b) ||
    rank(b.current_priority) - rank(a.current_priority) ||
    deadline(a) - deadline(b) ||
    received(a) - received(b)
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
  allowEmpty?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">Todos</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
