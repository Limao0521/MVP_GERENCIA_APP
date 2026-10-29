/**
 * Conecta con la ventana de Edge abierta con --remote-debugging-port=9222 (sesiones iniciadas por el usuario).
 * Sólo para automatizar el despliegue; nunca imprime secretos.
 */
import { chromium, type Page } from '@playwright/test';

export async function browser() {
  return chromium.connectOverCDP('http://127.0.0.1:9222');
}

export async function pageFor(prefix: string, openUrl?: string): Promise<Page> {
  const b = await browser();
  const ctx = b.contexts()[0];
  let page = ctx.pages().find((p) => p.url().startsWith(prefix));
  if (!page) {
    page = await ctx.newPage();
    await page.goto(openUrl ?? prefix, { waitUntil: 'domcontentloaded' });
  }
  return page;
}
