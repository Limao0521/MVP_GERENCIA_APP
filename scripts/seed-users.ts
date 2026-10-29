/**
 * Crea usuarios demo SINTÉTICOS (dominio example.edu) y sus perfiles/roles.
 * Idempotente. Uso: npm run seed:users
 */
import { env, serviceClient } from './lib/env';

export const DEMO_USERS = [
  { email: 'admin@example.edu', full_name: 'Administrador de la solución (demo)', role: 'admin', academic_program: null, responsible_label: null },
  { email: 'director.informatica@example.edu', full_name: 'Director Ing. Informática (demo)', role: 'director', academic_program: 'Ingeniería Informática', responsible_label: 'Director – Ing. Informática' },
  { email: 'director.industrial@example.edu', full_name: 'Directora Ing. Industrial (demo)', role: 'director', academic_program: 'Ingeniería Industrial', responsible_label: 'Director – Ing. Industrial' },
  { email: 'director.civil@example.edu', full_name: 'Director Ing. Civil (demo)', role: 'director', academic_program: 'Ingeniería Civil', responsible_label: 'Director – Ing. Civil' },
  { email: 'director.quimica@example.edu', full_name: 'Directora Ing. Química (demo)', role: 'director', academic_program: 'Ingeniería Química', responsible_label: 'Director – Ing. Química' },
  { email: 'administrativo@example.edu', full_name: 'Asistente administrativo (demo)', role: 'administrative', academic_program: null, responsible_label: 'Asistente administrativo' },
  { email: 'practicas@example.edu', full_name: 'Coordinación de prácticas (demo)', role: 'administrative', academic_program: null, responsible_label: 'Coordinación de prácticas' },
  { email: 'ti@example.edu', full_name: 'Equipo TI / DTI (demo)', role: 'it', academic_program: null, responsible_label: null },
] as const;

export async function seedUsers() {
  const sb = serviceClient();
  const password = env('DEMO_USER_PASSWORD', 'Demo-MVP-2026!');
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;

  for (const u of DEMO_USERS) {
    let user = list.users.find((x) => x.email === u.email);
    if (!user) {
      const { data, error } = await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true });
      if (error) throw new Error(`${u.email}: ${error.message}`);
      user = data.user;
    } else {
      await sb.auth.admin.updateUserById(user.id, { password });
    }
    const { error } = await sb.from('profiles').upsert({ id: user.id, ...u }, { onConflict: 'id' });
    if (error) throw new Error(`profile ${u.email}: ${error.message}`);
    console.log(`✓ ${u.role.padEnd(14)} ${u.email}`);
  }
  console.log(`\n${DEMO_USERS.length} demo users ready (password from DEMO_USER_PASSWORD).`);
}

if (process.argv[1]?.endsWith('seed-users.ts')) {
  seedUsers().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
