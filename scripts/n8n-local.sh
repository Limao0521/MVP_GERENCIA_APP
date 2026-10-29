#!/usr/bin/env bash
# Levanta un n8n local (Docker) con los workflows generados, para probar antes de subir a n8n Cloud.
# Uso: bash scripts/n8n-local.sh     (requiere `supabase start` y .env con SUPABASE_SERVICE_ROLE_KEY)
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
IMG=docker.n8n.io/n8nio/n8n:latest
SRV=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-)
docker rm -f n8n-mvp >/dev/null 2>&1 || true
rm -rf .n8n-local && mkdir -p .n8n-local/home .n8n-local/creds
npx tsx scripts/build-n8n.ts --supabase-url http://host.docker.internal:54321 --webhook-base http://localhost:5678 --out .n8n-local/workflows
printf '[{"id":"supabase-mvp","name":"Supabase MVP (service role)","type":"supabaseApi","data":{"host":"http://host.docker.internal:54321","serviceRole":"%s"}}]' "$SRV" > .n8n-local/creds/creds.json
D="$(pwd -W 2>/dev/null || pwd)/.n8n-local"
C=(-e N8N_ENCRYPTION_KEY=localtestkey123 -e GENERIC_TIMEZONE=America/Bogota -v "$D:/data" -v "$D/home:/home/node/.n8n")
docker run --rm "${C[@]}" $IMG import:credentials --input=/data/creds/creds.json | tail -1
docker run --rm "${C[@]}" $IMG import:workflow --separate --input=/data/workflows | tail -1
for id in mvpIngestWebhook mvpFollowupAlerts; do docker run --rm "${C[@]}" $IMG publish:workflow --id=$id >/dev/null; done
docker run -d --name n8n-mvp -p 5678:5678 --add-host=host.docker.internal:host-gateway -e N8N_SECURE_COOKIE=false "${C[@]}" $IMG >/dev/null
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:5678/webhook/student-request-demo -H 'Content-Type: application/json' -d '{}' || true)
  [ "$code" != "404" ] && [ "$code" != "000" ] && break
  sleep 2
done
echo "n8n local listo: http://localhost:5678  ·  webhook: http://localhost:5678/webhook/student-request-demo"
