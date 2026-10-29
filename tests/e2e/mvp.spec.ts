/**
 * E2E (12_TEST_STRATEGY.md): mensaje -> caso -> bandeja -> override -> estado -> cierre,
 * y capturas para el Capítulo 8 (evidence/screenshots).
 * Pre-requisitos: supabase start, npm run seed:users, npm run seed:demo -- --simulate-activity,
 * y (opcional) n8n local o Cloud en VITE_N8N_DEMO_WEBHOOK_URL.
 */
import { expect, test, type Page } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });
const PASSWORD = process.env.DEMO_USER_PASSWORD || 'Demo-MVP-2026!';
const SHOTS = process.env.E2E_SHOTS_DIR ?? 'evidence/screenshots';
const AI_PROVIDER = process.env.E2E_AI_PROVIDER ?? 'mock';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard operativo' })).toBeVisible({ timeout: 20_000 });
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
}

test('flujo principal del director: demo -> bandeja -> override -> cierre', async ({ page }) => {
  await login(page, 'director.informatica@example.edu');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/01_dashboard.png`, fullPage: true });

  // 1. Inyectar el caso crítico de la demo (vía n8n si está configurado; si no, pipeline local)
  await page.getByRole('link', { name: /Demo Injector/ }).click();
  await page.getByLabel('Cargar escenario de muestra').selectOption({ label: '★ Caso crítico de la demo (cancelar materia antes de mañana)' });
  await page.getByLabel('Proveedor de IA en n8n').selectOption(AI_PROVIDER);
  const viaN8n = await page.getByRole('button', { name: 'Send to n8n webhook' }).isEnabled();
  if (viaN8n) await page.getByRole('button', { name: 'Send to n8n webhook' }).click();
  else await page.getByRole('button', { name: 'Procesar sin n8n (Mock)' }).click();
  await expect(page.getByText(/Caso creado:/)).toBeVisible({ timeout: 60_000 });
  const caseNumber = (await page.locator('strong.mono').first().textContent())!.trim();
  await page.screenshot({ path: `${SHOTS}/02_demo_injector_resultado.png`, fullPage: true });

  // 2. Bandeja: el caso urgente aparece arriba
  await page.getByRole('link', { name: /Bandeja/ }).click();
  await expect(page.getByRole('heading', { name: 'Bandeja de casos' })).toBeVisible();
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow.locator('.badge.p-urgent')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03_bandeja_priorizada.png`, fullPage: true });

  // Filtros: urgentes + abiertos
  await page.getByLabel('Prioridad', { exact: true }).selectOption('urgent');
  await page.getByLabel('Estado', { exact: true }).selectOption('open');
  const priorities = await page.locator('tbody tr td:nth-child(5) .badge').allTextContents();
  expect(priorities.length).toBeGreaterThan(0);
  expect(priorities.every((t) => t.includes('Urgente'))).toBe(true);

  // 3. Detalle del caso urgente
  await page.getByRole('link', { name: caseNumber }).click();
  await expect(page.getByRole('heading', { name: 'Análisis IA (sugerencia)' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04_caso_urgente_detalle.png`, fullPage: true });

  // 4. Override de prioridad (urgent -> high) con nota
  await page.getByLabel('Prioridad', { exact: true }).selectOption('high');
  await page.getByLabel(/Nota \/ justificación/).fill('El estudiante ya inició el trámite en SIGA; se baja a Alta.');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Prioridad modificada').first()).toBeVisible();
  await expect(page.locator('.compare').getByText('Urgente')).toBeVisible(); // la sugerencia se conserva
  await page.screenshot({ path: `${SHOTS}/05_caso_override_timeline.png`, fullPage: true });

  // 5. Estados hasta el cierre
  for (const s of ['En revisión', 'En gestión', 'Resuelto', 'Cerrado']) {
    await page.getByRole('button', { name: `→ ${s}` }).click();
    await expect(page.locator('.page-header .badge', { hasText: s })).toBeVisible();
  }
  await expect(page.getByText('Cambio de estado').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06_caso_cerrado_auditoria.png`, fullPage: true });

  // 6. Alertas
  await page.getByRole('link', { name: /Alertas/ }).click();
  await page.getByRole('button', { name: /Recalcular ahora/ }).click();
  await expect(page.getByText(/Alertas recalculadas/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07_alertas_sla.png`, fullPage: true });

  // 7. Dashboard actualizado
  await page.getByRole('link', { name: /Dashboard/ }).click();
  await expect(page.getByText('Overrides humanos')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08_metricas_dashboard.png`, fullPage: true });
  await logout(page);
});

test('caso sensible con revisión humana (director de Ing. Civil)', async ({ page }) => {
  await login(page, 'director.civil@example.edu');
  await page.goto('/cases?sensitive=1');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const programs = await page.locator('tbody tr .subject-cell small').allTextContents();
  expect(programs.every((p) => p === 'Ingeniería Civil')).toBe(true); // RLS por programa
  await page.locator('tbody tr .subject-cell a').first().click();
  await expect(page.getByText('🔒 Caso sensible')).toBeVisible();
  await expect(page.getByText('👁 Revisión humana requerida.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09_caso_sensible_revision_humana.png`, fullPage: true });
  await logout(page);
});

test('administración: SLA, umbrales y log operativo', async ({ page }) => {
  await login(page, 'admin@example.edu');
  await page.getByRole('link', { name: /Administración/ }).click();
  await expect(page.getByRole('heading', { name: 'SLA de primera revisión' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/10_administracion.png`, fullPage: true });
  await logout(page);
});
