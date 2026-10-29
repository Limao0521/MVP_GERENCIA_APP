import { pageFor } from './cdp';
const page = await pageFor('https://app.n8n.cloud/dashboard');
const [popup] = await Promise.all([
  page.context().waitForEvent('page', { timeout: 20000 }).catch(() => null),
  page.getByText('Open instance').click(),
]);
const p = popup ?? page;
await p.waitForLoadState('domcontentloaded');
await p.waitForTimeout(8000);
console.log(p.url());
console.log((await p.innerText('body')).slice(0, 1500));
process.exit(0);
