/**
 * Cálculo de días hábiles (lunes a viernes, sin festivos — limitación documentada del MVP).
 * Se trabaja con un desplazamiento horario fijo porque Colombia no usa horario de verano;
 * así el mismo código corre igual en navegador, Node y nodos Code de n8n.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Índice de día local (días desde 1970-01-01 en la zona configurada). */
export function localDayIndex(date: Date, offsetMinutes: number): number {
  return Math.floor((date.getTime() + offsetMinutes * MINUTE) / DAY);
}

/** 0 = domingo ... 6 = sábado. 1970-01-01 fue jueves. */
export function dayOfWeek(dayIndex: number): number {
  return (((dayIndex + 4) % 7) + 7) % 7;
}

export function isBusinessDayIndex(dayIndex: number): boolean {
  const d = dayOfWeek(dayIndex);
  return d >= 1 && d <= 5;
}

export function localHour(date: Date, offsetMinutes: number): number {
  const ms = (((date.getTime() + offsetMinutes * MINUTE) % DAY) + DAY) % DAY;
  return ms / HOUR;
}

/** Instante correspondiente a una hora local de un día local. */
export function instantAt(dayIndex: number, hour: number, offsetMinutes: number): Date {
  return new Date(dayIndex * DAY + hour * HOUR - offsetMinutes * MINUTE);
}

/** Fin del día local (23:59:59). */
export function endOfLocalDay(dayIndex: number, offsetMinutes: number): Date {
  return new Date(instantAt(dayIndex + 1, 0, offsetMinutes).getTime() - 1000);
}

/** Cuenta días hábiles d tales que fromDay < d <= toDay. */
export function businessDaysBetween(from: Date, to: Date, offsetMinutes: number): number {
  const a = localDayIndex(from, offsetMinutes);
  const b = localDayIndex(to, offsetMinutes);
  let count = 0;
  for (let i = a + 1; i <= b; i++) if (isBusinessDayIndex(i)) count++;
  return count;
}

/**
 * Días hábiles hasta una fecha límite desde una referencia.
 * -1 = vencida; 0 = vence dentro del día hábil actual (o antes del siguiente día hábil);
 * n = vence en el n-ésimo día hábil siguiente.
 */
export function deadlineBusinessDays(reference: Date, deadline: Date, offsetMinutes: number): number {
  if (deadline.getTime() < reference.getTime()) return -1;
  return businessDaysBetween(reference, deadline, offsetMinutes);
}

/**
 * Vencimiento de SLA: fin del N-ésimo día hábil desde la recepción.
 * N=0 significa "mismo día hábil". Si se recibe en fin de semana o después del cierre
 * del día hábil, el conteo inicia el siguiente día hábil.
 */
export function addBusinessDays(from: Date, n: number, offsetMinutes: number, endHour: number): Date {
  let day = localDayIndex(from, offsetMinutes);
  if (!isBusinessDayIndex(day) || localHour(from, offsetMinutes) >= endHour) {
    day++;
    while (!isBusinessDayIndex(day)) day++;
  }
  let remaining = Math.max(0, Math.floor(n));
  while (remaining > 0) {
    day++;
    if (isBusinessDayIndex(day)) remaining--;
  }
  return instantAt(day, endHour, offsetMinutes);
}

/** ISO-8601 con desplazamiento local, p. ej. 2026-10-10T23:59:59-05:00. */
export function toLocalIso(date: Date, offsetMinutes: number): string {
  const local = new Date(date.getTime() + offsetMinutes * MINUTE);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = offsetMinutes <= 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
