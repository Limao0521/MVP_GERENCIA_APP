import type { CaseStatus, Priority } from '@core';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PRIORITY_LABEL, STATUS_LABEL, errorMessage, fmtDateTime } from '../lib/format';
import type { CaseRow } from '../types/db';

// ---------------------------------------------------------------- data hook
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

// ---------------------------------------------------------------- states
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      {label}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <strong>Error:</strong> {message}
      {onRetry && (
        <div style={{ marginTop: '0.5rem' }}>
          <button className="btn btn-sm" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}

export function Toast({ message, kind = 'info', onDone }: { message: string; kind?: 'info' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div className={`toast ${kind === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------- badges
const PRIORITY_ICON: Record<Priority, string> = { urgent: '▲▲', high: '▲', medium: '■', low: '▽' };

/** Prioridad: nunca depende sólo del color (icono + texto). */
export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="badge s-neutral">—</span>;
  return (
    <span className={`badge p-${priority}`} title={`Prioridad ${PRIORITY_LABEL[priority]}`}>
      <span aria-hidden="true">{PRIORITY_ICON[priority]}</span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const cls = status === 'resolved' || status === 'closed' ? 's-done' : status === 'received' || status === 'classified' ? 's-neutral' : 's-active';
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export type SlaState = { kind: 'ok' | 'warn' | 'bad' | 'none'; label: string; detail: string };

export function slaState(c: Pick<CaseRow, 'sla_due_at' | 'first_reviewed_at' | 'status'>, warningHours: number, now = Date.now()): SlaState {
  if (!c.sla_due_at) return { kind: 'none', label: 'Sin SLA', detail: 'SLA deshabilitado para esta prioridad' };
  const due = new Date(c.sla_due_at).getTime();
  const detail = `Primera revisión antes de ${fmtDateTime(c.sla_due_at)}`;
  if (c.first_reviewed_at) {
    const onTime = new Date(c.first_reviewed_at).getTime() <= due;
    return onTime
      ? { kind: 'ok', label: '✓ Revisado a tiempo', detail }
      : { kind: 'warn', label: '✓ Revisado tarde', detail };
  }
  if (c.status === 'resolved' || c.status === 'closed') return { kind: 'none', label: 'Cerrado', detail };
  if (now > due) return { kind: 'bad', label: '✕ SLA vencido', detail };
  const hours = (due - now) / 3_600_000;
  if (hours <= warningHours) return { kind: 'warn', label: `! Vence en ${Math.max(1, Math.round(hours))} h`, detail };
  return { kind: 'ok', label: 'En plazo', detail };
}

export function SlaBadge({ c, warningHours }: { c: Pick<CaseRow, 'sla_due_at' | 'first_reviewed_at' | 'status'>; warningHours: number }) {
  const s = slaState(c, warningHours);
  return (
    <span className={`badge sla-${s.kind}`} title={s.detail}>
      {s.label}
    </span>
  );
}

export function CaseFlags({ c }: { c: Pick<CaseRow, 'needs_human_review' | 'sensitive'> }) {
  return (
    <>
      {c.needs_human_review && (
        <span className="flag flag-review" title="Requiere revisión humana">
          👁 Revisión humana
        </span>
      )}
      {c.sensitive && (
        <span className="flag flag-sensitive" title="Caso sensible: tratamiento restringido">
          🔒 Sensible
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------- charts
export interface BarDatum {
  label: string;
  value: number;
}

/** Barras horizontales de una sola serie (sin leyenda: el título nombra la serie). Incluye vista de tabla. */
export function BarChart({ title, data, unit = 'casos' }: { title: string; data: BarDatum[]; unit?: string }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <h2>{title}</h2>
        <button className="btn btn-sm chart-toggle" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {data.length === 0 ? (
        <Empty>Sin datos</Empty>
      ) : asTable ? (
        <table className="data-view">
          <thead>
            <tr>
              <th>Valor</th>
              <th>{unit}</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="num">{d.value}</td>
                <td className="num">{total ? ((100 * d.value) / total).toFixed(1) : '0'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="bars" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          {data.map((d) => (
            <div className="bar-row" key={d.label}>
              <span className="bar-label" title={d.label}>
                {d.label}
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(100 * d.value) / max}%` }} />
              </span>
              <span className="bar-value">{d.value}</span>
              <span className="tooltip">
                {d.label}: {d.value} {unit} ({total ? ((100 * d.value) / total).toFixed(0) : 0}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Columnas por fecha (tendencia diaria), una serie. */
export function ColumnChart({ title, data }: { title: string; data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((m, d) => (d.value > m.value ? d : m), data[0] ?? { label: '', value: 0 });
  return (
    <div className="card">
      <h2>{title}</h2>
      {data.length < 2 ? (
        <Empty>Datos insuficientes para tendencia</Empty>
      ) : (
        <>
          <div className="columns" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
            {data.map((d) => (
              <div className="col" key={d.label}>
                {(d === peak || d === data[data.length - 1]) && <span className="col-value">{d.value}</span>}
                <span className="col-fill" style={{ height: `${(100 * d.value) / max}%` }} />
                <span className="tooltip">
                  {d.label}: {d.value} casos
                </span>
              </div>
            ))}
          </div>
          <div className="col-axis">
            {data.map((d) => (
              <span key={d.label}>{d.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
