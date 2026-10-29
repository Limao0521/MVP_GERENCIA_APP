import { pageFor } from './cdp';
import { N8N } from './n8n-api';
const page = await pageFor(N8N);
const scripts: string[] = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.endsWith('.js')));
const re = new RegExp(process.argv[2], 'g');
const seen = new Set<string>();
for (const u of scripts) {
  if (!u.startsWith(N8N)) continue;
  const t = await (await page.context().request.get(u)).text();
  for (const m of t.matchAll(re)) {
    const ctx = t.slice(Math.max(0, m.index! - 150), m.index! + 200).replace(/\s+/g, ' ');
    if (!seen.has(ctx)) { seen.add(ctx); console.log(u.split('/').pop(), '::', ctx, '\n'); }
    if (seen.size > Number(process.argv[3] ?? 15)) process.exit(0);
  }
}
process.exit(0);
