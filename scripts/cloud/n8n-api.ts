/** Llama a la API REST interna de la instancia n8n con la sesión del navegador (cookies compartidas). */
import { pageFor } from './cdp';
export const N8N = 'https://tarean8n.app.n8n.cloud';
export async function n8n(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const page = await pageFor(N8N);
  const browserId = await page.evaluate(() => localStorage.getItem('n8n-browserId') ?? '');
  const res = await page.context().request.fetch(N8N + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'browser-id': browserId },
    data: body === undefined ? undefined : JSON.stringify(body),
    timeout: 60000,
  });
  const text = await res.text();
  let json: unknown = text;
  try { json = JSON.parse(text); } catch { /* text */ }
  return { status: res.status(), json };
}
if (process.argv[1]?.endsWith('n8n-api.ts')) {
  const [, , method, path, body] = process.argv;
  const r = await n8n(method, path, body ? JSON.parse(body) : undefined);
  console.log(r.status, JSON.stringify(r.json, null, 1).slice(0, Number(process.env.MAX ?? 4000)));
  process.exit(0);
}
