import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// Sólo la anon key (pública) llega al navegador; la seguridad la impone RLS.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE ?? 'true') === 'true';
export const N8N_DEMO_WEBHOOK_URL = (import.meta.env.VITE_N8N_DEMO_WEBHOOK_URL as string | undefined) ?? '';
