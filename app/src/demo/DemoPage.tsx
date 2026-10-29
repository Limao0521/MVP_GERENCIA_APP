import { parseCsv, type IngestionPayload } from '@core';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import syntheticCsv from '../../../data/synthetic_cases.csv?raw';
import samples from '../../../data/sample_payloads.json';
import { Toast, useAsync } from '../components/ui';
import { fetchCatalogs, ingestLocally, resetDemo, sendToN8n, type IngestResponse } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { N8N_DEMO_WEBHOOK_URL } from '../lib/supabase';

const RECIPIENT: Record<string, string> = {
  'Ingeniería Informática': 'director.informatica@example.edu',
  'Ingeniería Industrial': 'director.industrial@example.edu',
  'Ingeniería Civil': 'director.civil@example.edu',
  'Ingeniería Química': 'director.quimica@example.edu',
};

function nowLocalInput(): string {
  const d = new Date(Date.now() - 5 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export function DemoPage() {
  const { profile } = useAuth();
  const catalogs = useAsync(fetchCatalogs);
  const scenarios = useMemo(() => {
    const rows = parseCsv(syntheticCsv);
    return [
      { id: 'demo-critico', label: '★ Caso crítico de la demo (cancelar materia antes de mañana)', ...samples.demo_ingestion },
      ...rows.map((r) => ({
        id: r.source_message_id,
        label: `${r.source_message_id} · ${r.subject}`,
        academic_program: r.academic_program,
        subject: r.subject,
        body: r.body,
        recipient_email: RECIPIENT[r.academic_program],
      })),
    ];
  }, []);

  const [form, setForm] = useState({
    sender_email: 'estudiante.demo@example.edu',
    recipient_email: 'director.informatica@example.edu',
    academic_program: 'Ingeniería Informática',
    subject: '',
    body: '',
    received_at: nowLocalInput(),
    ai_provider: 'openai',
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'info' | 'error' } | null>(null);

  const loadScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    setForm({
      ...form,
      academic_program: s.academic_program,
      recipient_email: s.recipient_email ?? RECIPIENT[s.academic_program] ?? form.recipient_email,
      subject: s.subject,
      body: s.body,
      received_at: nowLocalInput(),
    });
  };

  const payload = (): IngestionPayload => ({
    // ID único por envío; reenviar el mismo ID demuestra la idempotencia
    source_message_id: `demo-${Date.now()}`,
    source_channel: 'demo',
    sender_email: form.sender_email,
    recipient_email: form.recipient_email,
    academic_program: form.academic_program,
    subject: form.subject,
    body: form.body,
    received_at: new Date(`${form.received_at}:00-05:00`).toISOString(),
    ai_provider: form.ai_provider,
  });

  const submit = async (mode: 'n8n' | 'local', e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = mode === 'n8n' ? await sendToN8n(payload()) : await ingestLocally(payload(), catalogs.data!.config);
      setResult(res);
    } catch (err) {
      setToast({ msg: errorMessage(err), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm('¿Eliminar TODOS los casos, eventos y alertas de la demo? (sólo datos sintéticos)')) return;
    try {
      const r = await resetDemo();
      setToast({ msg: `Demo reiniciada: ${r.deleted_cases} casos eliminados. Ejecute npm run seed:demo para resembrar.`, kind: 'info' });
    } catch (err) {
      setToast({ msg: errorMessage(err), kind: 'error' });
    }
  };

  const canInject = profile?.role === 'admin' || profile?.role === 'director';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Demo Injector</h1>
          <p>Simula un correo estudiantil. Sólo datos sintéticos — no usar información real.</p>
        </div>
        {profile?.role === 'admin' && (
          <button className="btn btn-danger" onClick={() => void reset()}>
            Reiniciar datos demo
          </button>
        )}
      </div>

      <div className="grid grid-2">
        <form className="card" onSubmit={(e) => void submit('n8n', e)}>
          <label className="field" style={{ marginBottom: '0.75rem' }}>
            Cargar escenario de muestra
            <select defaultValue="" onChange={(e) => loadScenario(e.target.value)}>
              <option value="" disabled>
                Seleccione un escenario…
              </option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-2" style={{ gap: '0.6rem' }}>
            <label className="field">
              Remitente
              <input type="email" required value={form.sender_email} onChange={(e) => setForm({ ...form, sender_email: e.target.value })} />
            </label>
            <label className="field">
              Destinatario
              <input type="email" required value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} />
            </label>
            <label className="field">
              Programa académico
              <select value={form.academic_program} onChange={(e) => setForm({ ...form, academic_program: e.target.value, recipient_email: RECIPIENT[e.target.value] ?? form.recipient_email })}>
                {Object.keys(RECIPIENT).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Recibido (hora Bogotá)
              <input type="datetime-local" required value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
            </label>
          </div>
          <label className="field" style={{ marginTop: '0.6rem' }}>
            Asunto
            <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </label>
          <label className="field" style={{ marginTop: '0.6rem' }}>
            Cuerpo
            <textarea required rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <label className="field" style={{ marginTop: '0.6rem' }}>
            Proveedor de IA en n8n
            <select value={form.ai_provider} onChange={(e) => setForm({ ...form, ai_provider: e.target.value })}>
              <option value="openai">OpenAI (créditos n8n Cloud)</option>
              <option value="mock">MockAIProvider (determinístico)</option>
            </select>
          </label>
          <div className="actions" style={{ marginTop: '0.9rem' }}>
            <button className="btn btn-primary" type="submit" disabled={busy || !N8N_DEMO_WEBHOOK_URL}>
              {busy ? 'Enviando…' : 'Send to n8n webhook'}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || !canInject || !catalogs.data || !form.subject}
              onClick={() => void submit('local')}
              title="Ejecuta el mismo pipeline en el navegador con MockAIProvider (sin n8n)"
            >
              Procesar sin n8n (Mock)
            </button>
          </div>
          {!N8N_DEMO_WEBHOOK_URL && (
            <p className="small muted">
              Configure <code>VITE_N8N_DEMO_WEBHOOK_URL</code> para enviar a n8n. Mientras tanto puede usar el procesamiento local.
            </p>
          )}
        </form>

        <section className="card" aria-live="polite">
          <h2>Resultado</h2>
          {!result && <p className="muted">Envíe un mensaje para ver la respuesta del pipeline.</p>}
          {result && (
            <>
              {result.accepted ? (
                <p>
                  {result.duplicate ? 'Mensaje duplicado (idempotencia): ' : 'Caso creado: '}
                  <strong className="mono">{result.case_number}</strong> · estado <strong>{result.status}</strong>
                  {result.case_id && (
                    <>
                      {' '}
                      — <Link to={`/cases/${result.case_id}`}>abrir caso</Link>
                    </>
                  )}
                </p>
              ) : (
                <p className="sev-critical">No aceptado: {result.reason ?? result.error?.message}</p>
              )}
              <pre className="mono message-body">{JSON.stringify(result, null, 2)}</pre>
            </>
          )}
          <h3 style={{ marginTop: '1rem' }}>Flujo</h3>
          <p className="small">
            mensaje → n8n (normalizar, alcance, idempotencia) → IA (OpenAI o Mock) → validación del contrato JSON → reglas deterministas →
            Supabase (<code>ingest_case</code>) → alertas → bandeja.
          </p>
        </section>
      </div>
      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </>
  );
}
