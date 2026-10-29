import { writeFileSync } from 'node:fs';
import { pageFor } from './cdp';
import { N8N } from './n8n-api';
const page = await pageFor(N8N);
const res = await page.context().request.get(N8N + '/types/nodes.json', { timeout: 120000 });
const text = await res.text();
writeFileSync(process.env.TEMP + '/n8n-nodes.json', text);
console.log(res.status(), text.length);
process.exit(0);
