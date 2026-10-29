import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { DEMO_MODE } from '../lib/supabase';

const DEMO_ACCOUNTS = [
  ['director.informatica@example.edu', 'Director · Ing. Informática'],
  ['director.civil@example.edu', 'Director · Ing. Civil'],
  ['administrativo@example.edu', 'Personal administrativo'],
  ['admin@example.edu', 'Administrador de la solución'],
  ['ti@example.edu', 'Equipo TI (solo lectura)'],
] as const;

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email.trim(), password));
    setBusy(false);
  };

  return (
    <div className="login">
      <form className="card" onSubmit={submit} aria-labelledby="login-title">
        <h1 id="login-title">Gestión de Solicitudes Estudiantiles</h1>
        <p className="muted">MVP IT Operations Management · Facultad de Ingeniería</p>
        <div className="grid" style={{ gap: '0.6rem' }}>
          <label className="field">
            Correo
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            Contraseña
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && (
            <div className="state error" role="alert" style={{ padding: '0.5rem' }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
        </div>
        {DEMO_MODE && (
          <>
            <hr style={{ border: 0, borderTop: '1px solid var(--grid)', margin: '1rem 0' }} />
            <h3>Usuarios demo (sintéticos)</h3>
            <p className="small muted">
              Seleccione un rol para completar el correo. La contraseña es <code>DEMO_USER_PASSWORD</code> del README.
            </p>
            <div className="demo-users">
              {DEMO_ACCOUNTS.map(([mail, label]) => (
                <button type="button" key={mail} className="btn btn-sm" onClick={() => setEmail(mail)}>
                  {label} — <span className="muted">{mail}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </form>
    </div>
  );
}
