# Despliegue en la nube (estado real, 2026-10-09)

| Componente | Recurso | URL / identificador |
|---|---|---|
| Frontend | Vercel, proyecto `mvp-gerencia` (cuenta limao0521) | https://mvp-gerencia.vercel.app |
| Base de datos | Supabase Cloud, proyecto `mvp-gerencia`, ref `kvpburaufvrnywainsbh`, `us-east-1` | https://kvpburaufvrnywainsbh.supabase.co · dashboard: https://supabase.com/dashboard/project/kvpburaufvrnywainsbh |
| Orquestación | n8n Cloud, instancia `tarean8n` (n8n 2.42.5, trial) | https://tarean8n.app.n8n.cloud |
| Webhook de ingesta | Workflow B (publicado) | `POST https://tarean8n.app.n8n.cloud/webhook/student-request-demo` |
| IA | Nodo OpenAI `gpt-4o-mini` con **Gateway credits** de n8n (sin API key propia) | — |

Workflows en n8n Cloud:

| Workflow | ID | Estado |
|---|---|---|
| MVP · B · Ingesta webhook demo (pipeline compartido) | `VRx0opSecuCaQply` | Publicado |
| MVP · C · Seguimiento y alertas SLA | `a0BtzRAMWchkEi4V` | Publicado (cada hora) |
| MVP · Error handler | `3ZZmr1Uc2GSunX31` | Asignado como Error workflow de A, B y C |
| MVP · A · Ingesta Outlook (opcional) | `DS7v3K40N4BX1dI1` | Importado, inactivo (requiere cuenta Outlook de prueba) |

Credenciales en n8n: `Supabase MVP (service role)` (tipo Supabase API) y Gateway credits gestionado por n8n para el nodo OpenAI.

## Cómo se automatizó

- **Supabase**: Supabase CLI con un Personal Access Token ingresado por el usuario en un formulario local
  (`scripts/cloud/secret-form.ts`, guardado sólo en `.env.cloud`, gitignored). `supabase projects create` → `link` → `db push`;
  claves con `supabase projects api-keys`; Auth (Site URL y redirects) con la Management API.
- **Vercel**: Vercel CLI (login por device code) → `vercel link` → `vercel env add` (sólo variables públicas `VITE_*`) → `vercel deploy --prod`.
  Configuración en `vercel.json` (raíz; build del workspace `app`, rewrites SPA).
- **n8n Cloud**: la API pública no está disponible en el trial, por lo que `scripts/cloud/n8n-deploy.ts` usa la API REST
  interna de la instancia con la sesión del navegador del usuario (Edge con depuración remota): crea la credencial Supabase,
  genera los workflows con las URLs cloud (`npm run build:n8n`), los crea/actualiza, asigna el Error workflow y publica B y C.

## Incompatibilidades encontradas y corregidas

| Problema | Corrección |
|---|---|
| El trial actual de n8n Cloud ya **no emite "free OpenAI API credits"** (`Free n8n AI credits are not issued to instances licensed for AI Gateway`). | El nodo OpenAI usa **Gateway credits** (`credentials.openAiApi.__aiGatewayManaged = true`), generado por `build-n8n.ts`; `--openai-credential-id` permite usar una credencial propia en otros entornos. |
| El sandbox de nodos Code no resolvía los getters de exports de esbuild (`MVPCore.resolveConfig is not a function`). | El bundle copia las exportaciones a un objeto plano (`build-n8n.ts`). Detectado en n8n local antes de subir. |
| El workflow Outlook referenciaba una credencial inexistente (error 400 al importar). | La credencial Outlook se omite salvo que se defina `N8N_OUTLOOK_CREDENTIAL_ID`. |
| Vercel rechaza variables `VITE_*` con apariencia de credencial. | La anon key se registra como `--type config` (es pública por diseño; los datos los protege RLS). La service role **nunca** se sube a Vercel. |
| Calibración del prompt v1: prioridad 50 % (urgencia `low` en trámites que requieren acción). | Prompt v2 con definiciones de categoría y escala urgencia/impacto, calibrado **sólo** con el split de desarrollo; el split de evaluación mejoró de 50 % a 81,3 % sin usarse para calibrar. |

## Re-desplegar

```bash
# .env apunta a la nube (copia local en .env.local-supabase); .env.cloud guarda el token de Supabase CLI
npx supabase db push -p "$SUPABASE_DB_PASSWORD"         # nuevas migraciones
MSYS_NO_PATHCONV=1 npx tsx scripts/cloud/n8n-deploy.ts  # workflows (requiere sesión n8n abierta en Edge con --remote-debugging-port=9222)
npx vercel deploy --prod --yes                           # frontend
npm run seed:demo                                        # datos demo (Mock) o:
npm run reset:demo && npm run eval:n8n -- --provider openai   # datos demo clasificados por OpenAI real
```
