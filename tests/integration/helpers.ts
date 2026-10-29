import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, loadAppConfig, serviceClient } from '../../scripts/lib/env';
import { processAndIngest, providerFromName } from '../../scripts/lib/pipeline';
import type { AiProvider, IngestionPayload } from '../../core/src';

export const RUN = `IT-${Date.now().toString(36)}`;
export const hasDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const service = (): SupabaseClient => serviceClient();

const clients = new Map<string, SupabaseClient>();
/** Cliente autenticado como usuario demo (RLS real). Requiere `npm run seed:users`. */
export async function userClient(email: string): Promise<SupabaseClient> {
  if (clients.has(email)) return clients.get(email)!;
  const c = createClient(env('SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: env('DEMO_USER_PASSWORD', 'Demo-MVP-2026!') });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  clients.set(email, c);
  return c;
}

let counter = 0;
export function payload(over: Partial<IngestionPayload> = {}): IngestionPayload {
  counter++;
  return {
    source_message_id: `${RUN}-${counter}`,
    source_channel: 'demo',
    sender_email: `estudiante.test${counter}@example.edu`,
    recipient_email: 'director.informatica@example.edu',
    academic_program: 'Ingeniería Informática',
    subject: 'Duda sobre electiva',
    body: '¿Qué electivas puedo tomar el próximo semestre?',
    received_at: new Date().toISOString(),
    ...over,
  };
}

export async function ingest(p: IngestionPayload, provider: AiProvider = providerFromName('mock')) {
  const sb = service();
  const cfg = await loadAppConfig(sb);
  return processAndIngest(sb, p, cfg, provider);
}

export async function getCase(id: string) {
  const { data, error } = await service().from('cases').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getEvents(id: string) {
  const { data, error } = await service().from('case_events').select('*').eq('case_id', id).order('created_at');
  if (error) throw error;
  return data;
}

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
