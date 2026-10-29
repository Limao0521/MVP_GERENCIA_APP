import { serviceClient } from '../lib/env';
const sb = serviceClient();
const { data } = await sb.from('cases').select('case_number,academic_program,subject,category,suggested_priority,status,sensitive,needs_human_review,assigned_to').order('case_number');
for (const c of data ?? []) console.log([c.case_number, c.academic_program.replace('Ingeniería ', ''), c.subject, c.category, c.suggested_priority, c.sensitive ? 'SENS' : '', c.needs_human_review ? 'REV' : '', c.assigned_to].join(' | '));
const { data: m } = await sb.from('case_metrics').select('*').single();
console.log(m);
process.exit(0);
