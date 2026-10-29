import { pageFor } from './cdp';
const page = await pageFor(process.argv[2], process.argv[3]);
if (process.argv[3]) { await page.goto(process.argv[3], { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); }
console.log(page.url());
console.log((await page.innerText('body')).slice(0, Number(process.argv[4] ?? 3000)));
const links = await page.$$eval('a', (as) => as.map((a) => (a as HTMLAnchorElement).href).filter((h) => h.includes('n8n.cloud')));
console.log([...new Set(links)].slice(0, 20).join('\n'));
process.exit(0);
