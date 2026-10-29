/**
 * Formulario local (127.0.0.1) para que el usuario ingrese un secreto sin pegarlo en el chat.
 * Guarda NAME=valor en .env.cloud (gitignored) y termina. Nunca imprime el valor.
 * Uso: npx tsx scripts/cloud/secret-form.ts SUPABASE_ACCESS_TOKEN "Token de Supabase (sbp_...)"
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [name, label = name, prefix = ''] = process.argv.slice(2);
const html = `<!doctype html><meta charset="utf-8"><title>MVP · ${label}</title>
<body style="font-family:system-ui;max-width:520px;margin:10vh auto">
<h2>${label}</h2><p>El valor se guarda sólo en <code>.env.cloud</code> de tu equipo (no se envía al chat).</p>
<form method="post"><input name="v" type="password" autofocus style="width:100%;padding:8px" required>
<p><button style="padding:8px 16px">Guardar</button></p></form></body>`;

const server = createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const v = new URLSearchParams(body).get('v')?.trim() ?? '';
      if (prefix && !v.startsWith(prefix)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html.replace('</h2>', `</h2><p style="color:#b00">El valor debe empezar por <code>${prefix}</code> (parece que pegaste otra cosa, p. ej. el nombre del token). Intenta de nuevo.</p>`));
        return;
      }
      const file = '.env.cloud';
      const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith(`${name}=`)) : [];
      writeFileSync(file, [...lines, `${name}=${v}`].join('\n') + '\n');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<body style="font-family:system-ui;margin:10vh auto;max-width:520px"><h2>✓ Guardado</h2><p>Puedes cerrar esta pestaña.</p></body>');
      console.log(`${name} saved (${v.length} chars)`);
      setTimeout(() => process.exit(0), 300);
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
server.listen(48787, '127.0.0.1', () => console.log('form at http://127.0.0.1:48787'));
