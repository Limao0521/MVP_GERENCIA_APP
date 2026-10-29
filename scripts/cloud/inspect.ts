import { pageFor } from './cdp';
const prefix = process.argv[2];
const page = await pageFor(prefix);
const keys = await page.evaluate(() => Object.keys(localStorage).map((k) => `${k} (${(localStorage.getItem(k) ?? '').length})`));
console.log(page.url(), '\n', keys.join('\n '));
process.exit(0);
