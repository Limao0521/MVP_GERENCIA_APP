import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { AdminPage } from './features/admin/AdminPage';
import { AlertsPage } from './features/alerts/AlertsPage';
import { CaseDetailPage } from './features/cases/CaseDetailPage';
import { CaseListPage } from './features/cases/CaseListPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DemoPage } from './demo/DemoPage';
import { AuthProvider, useAuth } from './lib/auth';
import { DEMO_MODE, supabaseConfigured } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import './styles.css';

function App() {
  const { session, profile, loading, error, signOut } = useAuth();
  if (!supabaseConfigured) {
    return (
      <div className="login card">
        <h1>Configuración incompleta</h1>
        <p>
          Defina <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env</code> (ver README).
        </p>
      </div>
    );
  }
  if (loading) return <Loading />;
  if (!session) return <LoginPage />;
  if (!profile) {
    return (
      <div className="login card">
        <h1>Perfil no encontrado</h1>
        <p>{error}</p>
        <button className="btn" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="cases" element={<CaseListPage />} />
        <Route path="cases/:id" element={<CaseDetailPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="admin" element={<AdminPage />} />
        {DEMO_MODE && <Route path="demo" element={<DemoPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
