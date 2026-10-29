import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveConfig, type AppConfig } from '../../core/src';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// ENV_FILE permite apuntar a otro entorno (p. ej. .env.local-supabase para pruebas locales)
loadEnv({ path: path.resolve(ROOT, process.env.ENV_FILE ?? '.env'), quiet: true });

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

/** Cliente con service role: SÓLO para scripts de servidor (nunca en el frontend). */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadAppConfig(sb: SupabaseClient): Promise<AppConfig> {
  const { data, error } = await sb.from('app_config').select('key,value');
  if (error) throw new Error(`Cannot read app_config: ${error.message}`);
  return resolveConfig(data);
}

export { parseCsv } from '../../core/src';
