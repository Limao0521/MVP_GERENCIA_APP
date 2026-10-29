import { CATEGORIES, PRIORITIES, STATUSES } from '@core';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, ColumnChart, ErrorState, Loading, useAsync } from '../../components/ui';
import { fetchCases, fetchMetrics } from '../../lib/api';
import { PRIORITY_LABEL, STATUS_LABEL } from '../../lib/format';

const dayFmt = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });

export function DashboardPage() {
  const metrics = useAsync(fetchMetrics);
  const cases = useAsync(fetchCases);

  const charts = useMemo(() => {
    const list = cases.data ?? [];
    const count = <T extends string>(keys: readonly T[], get: (c: (typeof list)[number]) => string | null) =>
      keys.map((k) => ({ key: k, value: list.filter((c) => get(c) === k).length }));
    const byDay = new Map<string, { label: string; value: number }>();
    for (const c of [...list].sort((a, b) => a.received_at.localeCompare(b.received_at))) {
      const d = new Date(c.received_at);
      const k = dayKey.format(d);
      const prev = byDay.get(k) ?? { label: dayFmt.format(d), value: 0 };
      byDay.set(k, { ...prev, value: prev.value + 1 });
    }
    return {
      category: count(CATEGORIES, (c) => c.category)
        .map((d) => ({ label: d.key, value: d.value }))
        .sort((a, b) => b.value - a.value),
      priority: count(PRIORITIES, (c) => c.current_priority).map((d) => ({ label: PRIORITY_LABEL[d.key], value: d.value })),
      status: count(STATUSES, (c) => c.status).map((d) => ({ label: STATUS_LABEL[d.key], value: d.value })),
      trend: [...byDay.values()],
    };
  }, [cases.data]);

  if ((metrics.loading && !metrics.data) || (cases.loading && !cases.data)) return <Loading label="Calculando indicadores…" />;
  if (metrics.error) return <ErrorState message={metrics.error} onRetry={metrics.reload} />;
  if (cases.error) return <ErrorState message={cases.error} onRetry={cases.reload} />;
  const m = metrics.data!.cases;
  const cm = metrics.data!.classification;
  const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} %`);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard operativo</h1>
          <p>Indicadores calculados en vivo desde la base de datos (vista <code>case_metrics</code>) según su rol.</p>
        </div>
        <button className="btn" onClick={() => void Promise.all([metrics.reload(), cases.reload()])}>
          ↻ Actualizar
        </button>
      </div>

      <div className="tiles">
        <Tile hero label="Casos recibidos" value={m.total_received} to="/cases" />
        <Tile label="Pendientes" value={m.pending} hint="abiertos" to="/cases?status=open" />
        <Tile label="Urgentes abiertos" value={m.urgent_open} to="/cases?status=open&priority=urgent" status={m.urgent_open > 0 ? 'critical' : undefined} />
        <Tile label="SLA vencido" value={m.overdue} hint="sin primera revisión" to="/alerts" status={m.overdue > 0 ? 'critical' : undefined} />
        <Tile label="Próximos a vencer" value={m.due_soon} to="/alerts" status={m.due_soon > 0 ? 'warning' : undefined} />
        <Tile label="Cumplimiento SLA" value={pct(m.sla_compliance_percent)} hint="primera revisión a tiempo" />
        <Tile label="Overrides humanos" value={m.overridden_cases} hint={`tasa ${pct(m.override_rate_percent)} de revisados`} />
        <Tile label="Revisión humana pendiente" value={m.review_pending} to="/cases?status=open&review=1" />
        <Tile label="Cerrados" value={m.closed} hint={`${m.resolved} resueltos sin cerrar`} to="/cases?status=closed" />
        <Tile
          label="Primera revisión promedio"
          value={m.avg_first_review_hours === null ? '—' : `${Number(m.avg_first_review_hours).toFixed(1)} h`}
        />
        <Tile label="Latencia clasificación" value={cm.avg_latency_ms === null ? '—' : `${cm.avg_latency_ms} ms`} hint={`${cm.runs} ejecuciones · ${cm.failed_runs} fallidas`} />
        <Tile label="Proveedor IA" value={`${cm.openai_runs} / ${cm.mock_runs}`} hint="OpenAI / Mock" />
      </div>

      <div className="grid grid-2">
        <BarChart title="Casos por categoría" data={charts.category} />
        <div>
          <BarChart title="Casos por prioridad vigente" data={charts.priority} />
          <BarChart title="Casos por estado" data={charts.status} />
        </div>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <ColumnChart title="Casos recibidos por día" data={charts.trend} />
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  hint,
  to,
  hero,
  status,
}: {
  label: string;
  value: number | string;
  hint?: string;
  to?: string;
  hero?: boolean;
  status?: 'critical' | 'warning';
}) {
  const body = (
    <div className={`tile ${hero ? 'hero' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {status && (
        <div className="status-line">
          <span className={`sev-${status}`} aria-hidden="true">
            {status === 'critical' ? '⛔' : '⚠'}
          </span>
          {status === 'critical' ? 'Requiere atención' : 'Vigilar'}
        </div>
      )}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    body
  );
}
