import { browser } from './cdp';
const b = await browser();
const ctx = b.contexts()[0];
for (const url of process.argv.slice(2)) { const p = await ctx.newPage(); await p.goto(url).catch(() => {}); }
process.exit(0);
