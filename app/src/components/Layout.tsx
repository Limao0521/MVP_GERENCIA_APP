import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { DEMO_MODE } from '../lib/supabase';

const ROLE_LABEL = { director: 'Director de programa', administrative: 'Personal administrativo', admin: 'Administrador', it: 'Equipo TI' };

export function Layout() {
  const { profile, signOut } = useAuth();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navegación principal">
        <div className="brand">
          Gestión de Solicitudes
          <small>Facultad de Ingeniería · MVP</small>
        </div>
        <NavLink to="/" end>
          📊 Dashboard
        </NavLink>
        <NavLink to="/cases">📥 Bandeja</NavLink>
        <NavLink to="/alerts">🔔 Alertas</NavLink>
        {profile?.role === 'admin' || profile?.role === 'it' ? <NavLink to="/admin">⚙️ Administración</NavLink> : null}
        {DEMO_MODE && <NavLink to="/demo">🧪 Demo Injector</NavLink>}
        <div className="spacer" />
        {profile && (
          <div className="user">
            <strong>{profile.full_name ?? profile.email}</strong>
            {ROLE_LABEL[profile.role]}
            {profile.academic_program ? ` · ${profile.academic_program}` : ''}
            <div style={{ marginTop: '0.5rem' }}>
              <button className="btn btn-sm" onClick={() => void signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </nav>
      <main className="main">
        <div className="hitl-banner" role="note">
          La categoría y la prioridad son <strong>sugerencias del sistema</strong>. Las decisiones académicas y las respuestas al
          estudiante son siempre humanas.
          {DEMO_MODE && <span className="demo-badge">DEMO MODE · datos 100 % sintéticos</span>}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
