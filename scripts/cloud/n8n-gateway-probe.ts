import { pageFor } from './cdp';
import { N8N } from './n8n-api';
const page = await pageFor(N8N);
const out = await page.evaluate(async () => {
  const h = { 'browser-id': localStorage.getItem('n8n-browserId') ?? '' };
  const settings = await (await fetch('/rest/settings', { headers: h })).json();
  const s = settings.data ?? settings;
  const flat = JSON.stringify(s);
  const keys = Object.keys(s).filter((k) => /gateway|ai|public|mcp/i.test(k));
  const picked: Record<string, unknown> = {};
  for (const k of keys) picked[k] = s[k];
  const types = await (await fetch('/types/credentials.json')).json().catch(() => []);
  const gw = (types as any[]).filter((t) => /gateway|openai/i.test(t.name + t.displayName)).map((t) => `${t.name} | ${t.displayName}`);
  return { picked, gw, hasGatewayWord: flat.includes('ateway') };
});
console.log(JSON.stringify(out, null, 1).slice(0, 5000));
process.exit(0);
