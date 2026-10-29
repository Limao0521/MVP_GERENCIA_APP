/** Borra los casos de demo (reset_demo) sin volver a sembrar. Uso: npm run reset:demo */
import { serviceClient } from './lib/env';
const { data, error } = await serviceClient().rpc('reset_demo');
if (error) { console.error(error.message); process.exit(1); }
console.log('reset_demo:', JSON.stringify(data));
