import { endOfLocalDay, localDayIndex, dayOfWeek, toLocalIso } from './businessDays';
import type { AppConfig } from './config';
import { fold } from './normalize';
import type { AiResult, Category, Impact, Urgency } from './types';

/**
 * MockAIProvider determinístico para Demo Mode (06_AI_ANALYSIS_SPEC.md).
 * Usa un léxico de palabras clave genérico y devuelve EXACTAMENTE el mismo contrato que el
 * proveedor OpenAI. No pretende ser un modelo de NLP: sirve para pruebas reproducibles sin costo.
 */

export interface AiInput {
  subject: string;
  body: string;
  received_at: string;
  academic_program: string | null;
}

type Lexicon = Array<[RegExp, number]>;
const w = (pattern: string, weight: number): [RegExp, number] => [new RegExp(`\\b${pattern}`), weight];

const CATEGORY_LEXICON: Record<Category, Lexicon> = {
  'Matrícula': [
    w('matricul', 2), w('inscripcion', 1.5), w('inscribir', 1.5), w('registrar', 1.5),
    w('cancelar', 1.5), w('cancelacion', 1.5), w('pago', 1), w('siga\\b', 1), w('bloqueo', 0.5),
  ],
  'Asignaturas': [
    w('asignatura', 1.5), w('materia', 1), w('electiva', 2), w('grupo', 1.5), w('cupo', 1),
    w('nota\\b', 1.5), w('notas\\b', 1.5), w('prerrequisito', 2), w('retirar', 1.5), w('curso', 0.5),
    w('profesor', 1), w('clase\\b', 0.5),
  ],
  'Requisitos académicos': [
    w('requisito', 2), w('grado\\b', 1.5), w('homolog', 2), w('credito', 1.5), w('segunda lengua', 2),
    w('opcion de grado', 2), w('cumplo', 1), w('paz y salvo', 1.5),
  ],
  'Prácticas profesionales': [
    w('practica', 2.5), w('pasantia', 2), w('entrevista', 1), w('empresa', 1), w('seguro\\b', 0.5),
  ],
  'Fechas y plazos': [
    w('fecha', 1.5), w('plazo', 1), w('hasta cuando', 2.5), w('calendario', 2), w('vence', 0.5),
    w('vencio', 0.5), w('abierta', 1), w('cronograma', 2),
  ],
  'Situaciones académicas particulares': [
    w('situacion', 1), w('medic', 2), w('personal\\b', 1), w('emergencia', 2), w('familiar', 1),
    w('disciplinari', 2.5), w('salud', 2), w('incapacidad', 2), w('no podre asistir', 1.5),
    w('calamidad', 2), w('orientacion', 0.5),
  ],
  'Solicitudes generales': [
    w('certificado', 2.5), w('constancia', 2), w('horario de atencion', 2.5), w('plan de estudios', 2),
    w('informacion', 1), w('gracias', 1.5), w('aun no tengo respuesta', 2), w('no he recibido respuesta', 2),
    w('recordatorio', 1.5), w('respuesta sobre mi caso', 1.5),
  ],
  'Otros': [
    w('parqueadero', 2.5), w('biblioteca', 2), w('cafeteria', 2), w('carne\\b', 2), w('deportes', 2),
  ],
};

const CRITICAL_PATTERNS = [/\bvence hoy\b/, /\bcierra hoy\b/, /\bhoy cierra\b/, /\bhoy vence\b/];
const TIME_PRESSURE = /\b(hoy|manana|vence|vencio|cierra|plazo)\b/;
const HIGH_URGENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\bhoy\b/, 'menciona "hoy"'],
  [/\bmanana\b(?! en la| por la)/, 'menciona "mañana"'],
  [/\b(vence|vencio|cierra)\b/, 'plazo que vence o cierra'],
  [/\burgente\b/, 'marcado como urgente'],
  [/\bno me (permite|deja)\b/, 'bloqueo en el sistema'],
  [/\bbloqueo\b/, 'bloqueo en el sistema'],
  [/\bno aparece\b/, 'trámite no reflejado en el sistema'],
  [/\bperder\b/, 'riesgo de perder el plazo'],
  [/\bno podre\b/, 'consecuencia académica explícita'],
];
const LOW_URGENCY_PATTERNS = [
  /\bdonde puedo\b/, /\bcual es el horario\b/, /\bquiero conocer\b/, /\bgracias\b/, /\bme pueden indicar\b/,
  /\bno requiero\b/, /\btiene prerrequisito\b/,
];
const HIGH_IMPACT_PATTERNS = [
  /\bperder\b/, /\bplazo\b/, /\bgrado\b/, /\bno podre\b/, /\bbloqueo\b/, /\bno me (permite|deja)\b/,
  /\bno aparece aprobado\b/, /\bmedic/, /\bdisciplinari/, /\bfinancier/, /\bemergencia\b/, /\bcierra\b/,
];

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(medic|salud|enfermedad|incapacidad|psicolog|psiquiatr|discapacidad|embarazo)/, 'información médica o de salud'],
  [/\bdisciplinari/, 'proceso disciplinario'],
  [/\b(financier|bancari|cuenta bancaria|tarjeta de credito|deuda)/, 'información financiera'],
  [/\b(cedula|documento de identidad|pasaporte|tarjeta de identidad)/, 'documento de identidad'],
  [/\b(emergencia familiar|calamidad|fallecimiento|duelo|violencia|acoso)/, 'situación personal delicada'],
];

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};
const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};
const NUMBER_WORDS: Record<string, number> = { un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };

/** Extrae una fecha límite (fin del día local) a partir de expresiones relativas o explícitas. */
export function extractDeadline(text: string, receivedAt: Date, offset: number): Date | null {
  const t = fold(text);
  const today = localDayIndex(receivedAt, offset);
  const candidates: number[] = [];

  if (/\bayer\b/.test(t)) candidates.push(today - 1);
  if (/\bantes de manana\b/.test(t)) candidates.push(today);
  else if (/\bpasado manana\b/.test(t)) candidates.push(today + 2);
  else if (/\bmanana\b(?! en la| por la)/.test(t) && !/\b(en|por) la manana\b/.test(t)) candidates.push(today + 1);
  if (/\bhoy\b/.test(t)) candidates.push(today);

  const inDays = t.match(/\ben (\d+|un|uno|dos|tres|cuatro|cinco) dias?\b/);
  if (inDays) {
    const n = NUMBER_WORDS[inDays[1]] ?? Number(inDays[1]);
    if (Number.isFinite(n)) candidates.push(today + n);
  }

  const weekday = t.match(/\b(antes del?|hasta el|para el|el) (lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (weekday) {
    const target = WEEKDAYS[weekday[2]];
    let diff = (target - dayOfWeek(today) + 7) % 7;
    if (diff === 0) diff = 7;
    candidates.push(today + diff - (weekday[1].startsWith('antes') ? 1 : 0));
  }

  const numeric = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const d = absoluteDay(Number(numeric[1]), Number(numeric[2]) - 1, numeric[3], receivedAt, offset);
    if (d !== null) candidates.push(d);
  }
  const named = t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/);
  if (named) {
    const d = absoluteDay(Number(named[1]), MONTHS[named[2]], undefined, receivedAt, offset);
    if (d !== null) candidates.push(d);
  }

  if (candidates.length === 0) return null;
  return endOfLocalDay(Math.min(...candidates), offset);
}

function absoluteDay(day: number, month: number, yearText: string | undefined, ref: Date, offset: number): number | null {
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  const refLocal = new Date(ref.getTime() + offset * 60_000);
  let year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : refLocal.getUTCFullYear();
  let idx = Math.floor(Date.UTC(year, month, day) / 86_400_000);
  if (!yearText && idx < localDayIndex(ref, offset) - 180) {
    year += 1;
    idx = Math.floor(Date.UTC(year, month, day) / 86_400_000);
  }
  return idx;
}

export function mockAnalyze(input: AiInput, cfg: AppConfig): AiResult {
  const subject = fold(input.subject ?? '');
  const body = fold(input.body ?? '');
  const text = `${subject}\n${body}`;
  const received = new Date(input.received_at);
  const offset = cfg.tz_offset_minutes;

  // Categoría por puntaje de léxico (coincidencias en el asunto suman 0,5x adicional)
  const scores = (Object.keys(CATEGORY_LEXICON) as Category[]).map((category) => {
    let score = 0;
    for (const [re, weight] of CATEGORY_LEXICON[category]) {
      if (re.test(body)) score += weight;
      if (re.test(subject)) score += weight * 0.5;
    }
    return { category, score };
  });
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];
  const hasCategorySignal = top.score > 0;
  const category: Category = hasCategorySignal ? top.category : 'Otros';

  // Sensibilidad
  const sensitiveHit = SENSITIVE_PATTERNS.find(([re]) => re.test(text));
  const sensitive = Boolean(sensitiveHit);

  // Urgencia
  const signals: string[] = [];
  for (const [re, label] of HIGH_URGENCY_PATTERNS) {
    if (re.test(text) && !signals.includes(label)) signals.push(label);
  }
  let urgency: Urgency;
  if (CRITICAL_PATTERNS.some((re) => re.test(text)) || (/\burgente\b/.test(text) && TIME_PRESSURE.test(text))) {
    urgency = 'critical';
  } else if (signals.length > 0) {
    urgency = 'high';
  } else if (LOW_URGENCY_PATTERNS.some((re) => re.test(text)) || category === 'Solicitudes generales') {
    urgency = 'low';
  } else if (hasCategorySignal || sensitive) {
    urgency = 'medium';
  } else {
    urgency = 'unknown';
  }

  // Impacto
  let impact: Impact;
  if (HIGH_IMPACT_PATTERNS.some((re) => re.test(text))) impact = 'high';
  else if (!hasCategorySignal && !sensitive) impact = 'unknown';
  else if (category === 'Solicitudes generales' || category === 'Otros') impact = 'low';
  else impact = 'medium';

  // Fecha límite
  const deadlineDate = extractDeadline(`${input.subject}\n${input.body}`, received, offset);

  // Confianza del extractor (no es una probabilidad real)
  let confidence: number;
  if (!hasCategorySignal) confidence = 0.3;
  else {
    const margin = Math.min(top.score - second.score, 2);
    confidence = Math.min(0.95, 0.5 + 0.08 * Math.min(top.score, 4) + 0.1 * margin);
  }
  confidence = Math.round(confidence * 100) / 100;

  const summary = sensitive
    ? `Caso con ${sensitiveHit![1]}: el estudiante solicita orientación. Detalles omitidos del resumen.`
    : `Solicitud de ${category.toLowerCase()}: ${firstSentence(input.body || input.subject)}`;

  const reasoningParts: string[] = [];
  if (deadlineDate) reasoningParts.push(`fecha límite detectada (${toLocalIso(deadlineDate, offset).slice(0, 10)})`);
  if (signals.length) reasoningParts.push(signals.slice(0, 3).join('; '));
  if (impact === 'high') reasoningParts.push('posible impacto académico alto');
  if (sensitive) reasoningParts.push('contiene señales de información sensible');
  if (!hasCategorySignal) reasoningParts.push('información insuficiente para clasificar');

  return {
    category,
    summary,
    urgency,
    impact,
    deadline: deadlineDate ? toLocalIso(deadlineDate, offset) : null,
    deadline_explicit: Boolean(deadlineDate),
    suggested_responsible: cfg.responsible_by_category[category] ?? null,
    sensitive,
    sensitive_reason: sensitiveHit ? sensitiveHit[1] : null,
    confidence,
    needs_human_review: sensitive || !hasCategorySignal,
    reasoning_summary: reasoningParts.length
      ? capitalize(reasoningParts.join('; ')) + '.'
      : 'Sin señales de urgencia ni plazos explícitos.',
  };
}

function firstSentence(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  const cut = s.split(/(?<=[.!?])\s/)[0] ?? s;
  return cut.length > 160 ? `${cut.slice(0, 157)}...` : cut;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
