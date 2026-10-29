# 13 — Runbook de despliegue y ejecución

Claude debe convertir este documento en instrucciones exactas según lo que implemente.

## Pre-requisitos esperados

- Node.js LTS
- npm/pnpm
- cuenta Supabase
- cuenta n8n Cloud o n8n compatible
- cuenta Vercel
- OpenAI API key opcional si no se usa Demo AI
- Outlook test account opcional

## Orden

### 1. Supabase
- crear proyecto;
- ejecutar migration/schema;
- seed configuraciones;
- copiar URL + anon key;
- configurar RLS.

### 2. Frontend
- copiar `.env.example` a `.env.local`;
- instalar;
- ejecutar;
- validar conexión.

### 3. n8n
- importar JSON;
- configurar Supabase;
- configurar OpenAI;
- probar webhook;
- opcional: Outlook credentials.

### 4. Demo
- `DEMO_MODE=true`;
- inyectar caso;
- comprobar DB;
- abrir bandeja;
- realizar override;
- cerrar.

### 5. Vercel
- conectar repo;
- variables de entorno;
- deploy.

## Variables esperadas

Ver `.env.example`.

## No hacer

- no commitear secretos;
- no poner service-role key en React;
- no depender de Entra ID para demo;
- no usar datos reales.

## Checklist de smoke test

- frontend carga;
- Supabase responde;
- seed existe;
- webhook responde;
- caso se crea;
- clasificación se almacena;
- reglas se aplican;
- UI muestra caso;
- override genera event;
- alerta se genera;
- dashboard actualiza.
