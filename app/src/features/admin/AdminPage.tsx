import { RESPONSIBLE_ROLES } from '@core';
import { useState } from 'react';
import { ErrorState, Loading, Toast, useAsync } from '../../components/ui';
import { fetchCatalogs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PRIORITY_LABEL, errorMessage, fmtDateTime } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { ConfigRow } from '../../types/db';

interface OpsLog {
  id: number;
  level: string;
  source: string;
  event: string;
  message: string | null;
  created_at: string;
}

export function AdminPage() {
  const { profile } = useAuth();
  const catalogs = useAsync(fetchCatalogs);
  const logs = useAsync(async () => {
    const { data, error } = await supabase.from('ops_log').select('id,level,source,event,message,created_at').order('created_at', { ascending: false }).limit(40);
    if (error) throw new Error(error.message);
    return data as OpsLog[];
  });
  const [toast, setToast] = useState<{ msg: string; kind: 'info' | 'error' } | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newResp, setNewResp] = useState({ label: '', role_label: RESPONSIBLE_ROLES[0] as string, academic_program: '' });

  if (profile?.role !== 'admin' && profile?.role !== 'it') return <ErrorState message="Sólo administradores y TI pueden ver esta sección." />;
  if (catalogs.loading && !catalogs.data) return <Loading />;
  if (catalogs.error) return <ErrorState message={catalogs.error} onRetry={catalogs.reload} />;
  const cat = catalogs.data!;
  const readOnly = profile.role !== 'admin';

  const save = async (label: string, op: PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const { error } = await op;
      if (error) throw new Error(error.message);
      setToast({ msg: `${label} guardado`, kind: 'info' });
      await Promise.all([catalogs.reload(), logs.reload()]);
    } catch (e) {
      setToast({ msg: errorMessage(e), kind: 'error' });
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Administración</h1>
          <p>Parámetros configurables (sin magic numbers). Cada cambio queda registrado en el log operativo.{readOnly && ' Vista de solo lectura (rol TI).'}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>SLA de primera revisión</h2>
          <p className="small muted">Días hábiles (lunes–viernes, sin festivos). 0 = mismo día hábil. Aplica a casos nuevos y a casos aún no revisados cuya prioridad cambie.</p>
          <table>
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Días hábiles</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {['urgent', 'high', 'medium', 'low'].map((p) => {
                const row = cat.sla.find((s) => s.priority === p);
                if (!row) return null;
                return (
                  <tr key={p}>
                    <td>{PRIORITY_LABEL[row.priority]}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        aria-label={`Días SLA ${PRIORITY_LABEL[row.priority]}`}
                        defaultValue={row.first_review_business_days}
                        disabled={readOnly}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== row.first_review_business_days && Number.isInteger(v) && v >= 0)
                            void save('SLA', supabase.from('sla_config').update({ first_review_business_days: v }).eq('priority', p));
                        }}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`SLA activo ${PRIORITY_LABEL[row.priority]}`}
                        checked={row.enabled}
                        disabled={readOnly}
                        onChange={(e) => void save('SLA', supabase.from('sla_config').update({ enabled: e.target.checked }).eq('priority', p))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Reglas y umbrales</h2>
          <p className="small muted">Usados por n8n y por el motor de reglas en cada ingesta.</p>
          <div className="grid" style={{ gap: '0.5rem' }}>
            {cat.configRows
              .filter((r) => typeof r.value !== 'object' || r.value === null)
              .map((r) => (
                <ConfigField key={r.key} row={r} readOnly={readOnly} onSave={(value) => save(r.key, supabase.from('app_config').update({ value, updated_by: profile.email }).eq('key', r.key))} />
              ))}
          </div>
          <details style={{ marginTop: '0.75rem' }}>
            <summary className="small">Parámetros estructurados (JSON)</summary>
            {cat.configRows
              .filter((r) => typeof r.value === 'object' && r.value !== null)
              .map((r) => (
                <JsonField key={r.key} row={r} readOnly={readOnly} onSave={(value) => save(r.key, supabase.from('app_config').update({ value, updated_by: profile.email }).eq('key', r.key))} />
              ))}
          </details>
        </section>

        <section className="card">
          <h2>Categorías</h2>
          <p className="small muted">La IA sólo puede usar categorías activas del catálogo; lo que no encaje va a “Otros”.</p>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Responsable por defecto</th>
                <th>Activa</th>
              </tr>
            </thead>
            <tbody>
              {cat.categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <select
                      value={c.default_responsible ?? ''}
                      disabled={readOnly}
                      aria-label={`Responsable de ${c.name}`}
                      onChange={(e) => void save('Categoría', supabase.from('categories').update({ default_responsible: e.target.value }).eq('id', c.id))}
                    >
                      {RESPONSIBLE_ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Activa ${c.name}`}
                      checked={c.active}
                      disabled={readOnly || c.name === 'Otros'}
                      onChange={(e) => void save('Categoría', supabase.from('categories').update({ active: e.target.checked }).eq('id', c.id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <label className="field">
                Nueva categoría
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </label>
              <button
                className="btn"
                disabled={!newCategory.trim()}
                onClick={() => {
                  void save('Categoría', supabase.from('categories').insert({ name: newCategory.trim(), default_responsible: 'Director de programa' }));
                  setNewCategory('');
                }}
              >
                Agregar
              </button>
            </div>
          )}
          <p className="small muted">Nota: el prompt del clasificador usa las 8 categorías del proyecto; nuevas categorías se asignan manualmente.</p>
        </section>

        <section className="card">
          <h2>Responsables</h2>
          <table>
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th>Rol</th>
                <th>Programa</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {cat.responsibles.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td className="small">{r.role_label}</td>
                  <td className="small">{r.academic_program ?? 'Todos'}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Activo ${r.label}`}
                      checked={r.active}
                      disabled={readOnly}
                      onChange={(e) => void save('Responsable', supabase.from('responsibles').update({ active: e.target.checked }).eq('id', r.id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="grid" style={{ gap: '0.5rem', marginTop: '0.75rem', gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end' }}>
              <label className="field">
                Etiqueta
                <input value={newResp.label} onChange={(e) => setNewResp({ ...newResp, label: e.target.value })} />
              </label>
              <label className="field">
                Rol
                <select value={newResp.role_label} onChange={(e) => setNewResp({ ...newResp, role_label: e.target.value })}>
                  {RESPONSIBLE_ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Programa (opcional)
                <input value={newResp.academic_program} onChange={(e) => setNewResp({ ...newResp, academic_program: e.target.value })} />
              </label>
              <button
                className="btn"
                disabled={!newResp.label.trim()}
                onClick={() => {
                  void save(
                    'Responsable',
                    supabase.from('responsibles').insert({ label: newResp.label.trim(), role_label: newResp.role_label, academic_program: newResp.academic_program.trim() || null }),
                  );
                  setNewResp({ ...newResp, label: '', academic_program: '' });
                }}
              >
                Agregar
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Log operativo (observabilidad)</h2>
        <p className="small muted">Procesamiento, duplicados, fallos de IA, sincronización de alertas, errores de n8n y cambios de configuración.</p>
        {logs.error ? (
          <ErrorState message={logs.error} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nivel</th>
                  <th>Origen</th>
                  <th>Evento</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {(logs.data ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="num">{fmtDateTime(l.created_at)}</td>
                    <td className={l.level === 'error' ? 'sev-critical' : l.level === 'warning' ? 'sev-warning' : ''}>{l.level}</td>
                    <td>{l.source}</td>
                    <td className="mono">{l.event}</td>
                    <td className="small">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </>
  );
}

function ConfigField({ row, readOnly, onSave }: { row: ConfigRow; readOnly: boolean; onSave: (v: unknown) => void }) {
  const [value, setValue] = useState(String(row.value));
  const isBool = typeof row.value === 'boolean';
  const isNum = typeof row.value === 'number';
  const commit = () => {
    const parsed = isBool ? value === 'true' : isNum ? Number(value) : value;
    if (isNum && !Number.isFinite(parsed)) return;
    if (parsed !== row.value) onSave(parsed);
  };
  return (
    <label className="field">
      <span>
        <span className="mono">{row.key}</span> — {row.description}
      </span>
      {isBool ? (
        <select value={value} disabled={readOnly} onChange={(e) => { setValue(e.target.value); onSave(e.target.value === 'true'); }}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input type={isNum ? 'number' : 'text'} step="any" value={value} disabled={readOnly} onChange={(e) => setValue(e.target.value)} onBlur={commit} />
      )}
    </label>
  );
}

function JsonField({ row, readOnly, onSave }: { row: ConfigRow; readOnly: boolean; onSave: (v: unknown) => void }) {
  const [text, setText] = useState(JSON.stringify(row.value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <label className="field" style={{ marginTop: '0.5rem' }}>
      <span>
        <span className="mono">{row.key}</span> — {row.description}
      </span>
      <textarea className="mono" rows={4} value={text} disabled={readOnly} onChange={(e) => setText(e.target.value)} />
      {err && <span className="sev-critical small">{err}</span>}
      {!readOnly && (
        <button
          className="btn btn-sm"
          type="button"
          onClick={() => {
            try {
              onSave(JSON.parse(text));
              setErr(null);
            } catch {
              setErr('JSON inválido');
            }
          }}
        >
          Guardar {row.key}
        </button>
      )}
    </label>
  );
}
