import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorState, Loading, PriorityBadge, Toast, useAsync } from '../../components/ui';
import { acknowledgeAlert, fetchAlerts, fetchCases, fetchCatalogs, recomputeAlerts } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ALERT_LABEL, errorMessage, fmtDateTime } from '../../lib/format';

export function AlertsPage() {
  const { profile } = useAuth();
  const [showInactive, setShowInactive] = useState(false);
  const alerts = useAsync(() => fetchAlerts({ activeOnly: !showInactive }), [showInactive]);
  const cases = useAsync(fetchCases);
  const catalogs = useAsync(fetchCatalogs);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'info' | 'error' } | null>(null);

  const caseById = useMemo(() => new Map((cases.data ?? []).map((c) => [c.id, c])), [cases.data]);
  const canRecompute = profile?.role === 'admin' || profile?.role === 'director' || profile?.role === 'it';

  const recompute = async () => {
    if (!catalogs.data) return;
    setBusy(true);
    try {
      const r = await recomputeAlerts(catalogs.data.config);
      setToast({ msg: `Alertas recalculadas: ${r.created} nuevas, ${r.deactivated} resueltas, ${r.active_total} activas`, kind: 'info' });
      await alerts.reload();
    } catch (e) {
      setToast({ msg: errorMessage(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const ack = async (id: string) => {
    try {
      await acknowledgeAlert(id);
      await alerts.reload();
    } catch (e) {
      setToast({ msg: errorMessage(e), kind: 'error' });
    }
  };

  if (alerts.loading && !alerts.data) return <Loading label="Cargando alertas…" />;
  if (alerts.error) return <ErrorState message={alerts.error} onRetry={alerts.reload} />;
  const list = alerts.data ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Alertas internas</h1>
          <p>
            SLA de primera revisión, seguimiento sin gestión ({catalogs.data?.config.followup_business_days ?? 2} días hábiles), fechas
            límite y casos sensibles. n8n las recalcula cada hora (Workflow C).
          </p>
        </div>
        <div className="actions">
          <label className="small">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Incluir resueltas
          </label>
          {canRecompute && (
            <button className="btn btn-primary" disabled={busy || !catalogs.data} onClick={() => void recompute()}>
              {busy ? 'Recalculando…' : '↻ Recalcular ahora'}
            </button>
          )}
        </div>
      </div>
      {list.length === 0 ? (
        <Empty>No hay alertas {showInactive ? '' : 'activas'}.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severidad</th>
                <th>Tipo</th>
                <th>Caso</th>
                <th>Prioridad</th>
                <th>Mensaje</th>
                <th>Generada</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const c = caseById.get(a.case_id);
                return (
                  <tr key={a.id}>
                    <td className={`sev-${a.severity}`}>
                      <strong>
                        {a.severity === 'critical' ? '⛔ Crítica' : '⚠ Advertencia'}
                      </strong>
                    </td>
                    <td>
                      {ALERT_LABEL[a.alert_type] ?? a.alert_type}
                      <div className="small muted mono">{a.alert_type}</div>
                    </td>
                    <td className="mono">{c ? <Link to={`/cases/${c.id}`}>{c.case_number}</Link> : '—'}</td>
                    <td>{c && <PriorityBadge priority={c.current_priority} />}</td>
                    <td>{a.message}</td>
                    <td className="num">{fmtDateTime(a.triggered_at)}</td>
                    <td className="small">
                      {!a.active ? (
                        `Resuelta ${fmtDateTime(a.resolved_at)}`
                      ) : a.acknowledged_at ? (
                        `Reconocida por ${a.acknowledged_by}`
                      ) : profile?.role !== 'it' ? (
                        <button className="btn btn-sm" onClick={() => void ack(a.id)}>
                          Reconocer
                        </button>
                      ) : (
                        'Activa'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </>
  );
}
