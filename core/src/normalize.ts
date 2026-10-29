import type { AppConfig } from './config';
import type { IngestionPayload, NormalizedMessage } from './types';

export const MAX_SUBJECT_LENGTH = 300;
export const MAX_BODY_LENGTH = 8000;

/** Minúsculas y sin tildes, para comparar palabras clave. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Convierte HTML de Outlook a texto plano y limpia caracteres de control. */
export function sanitizeText(input: unknown, maxLength: number): string {
  let text = typeof input === 'string' ? input : input == null ? '' : String(input);
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }
  text = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().toLowerCase().match(/[^\s<>"']+@[^\s<>"']+\.[a-z]{2,}/);
  return match ? match[0] : null;
}

export interface ScopeResult {
  in_scope: boolean;
  reason: string | null;
}

export class ValidationError extends Error {
  code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
  }
}

/** Normaliza y valida el mensaje (FR-001, FR-004). Lanza ValidationError si falta lo mínimo. */
export function normalizeMessage(payload: IngestionPayload, cfg: AppConfig, now = new Date()): NormalizedMessage {
  const subject = sanitizeText(payload.subject, MAX_SUBJECT_LENGTH);
  const body = sanitizeText(payload.body, MAX_BODY_LENGTH);
  if (!subject && !body) throw new ValidationError('subject or body is required');

  const recipient = cleanEmail(payload.recipient_email);
  let program = sanitizeText(payload.academic_program, 120) || null;
  if (!program && recipient && cfg.program_by_recipient[recipient]) {
    program = cfg.program_by_recipient[recipient];
  }

  let receivedAt = payload.received_at ? new Date(payload.received_at) : now;
  if (Number.isNaN(receivedAt.getTime())) receivedAt = now;

  const sourceId =
    sanitizeText(payload.source_message_id, 300) ||
    `auto-${simpleHash(`${payload.sender_email}|${subject}|${body}|${receivedAt.toISOString()}`)}`;

  return {
    source_message_id: sourceId,
    source_channel: sanitizeText(payload.source_channel, 30).toLowerCase() || 'demo',
    sender_email: cleanEmail(payload.sender_email),
    recipient_email: recipient,
    academic_program: program,
    subject: subject || '(sin asunto)',
    body: body || subject,
    received_at: receivedAt.toISOString(),
  };
}

/** FR-002: determina si el mensaje pertenece al piloto. */
export function checkScope(msg: NormalizedMessage, cfg: AppConfig): ScopeResult {
  if (cfg.pilot_recipient_domains.length > 0 && msg.recipient_email) {
    const domain = msg.recipient_email.split('@')[1];
    if (!cfg.pilot_recipient_domains.includes(domain)) {
      return { in_scope: false, reason: `recipient domain '${domain}' is not part of the pilot` };
    }
  }
  if (!msg.academic_program) {
    return { in_scope: false, reason: 'academic program could not be determined' };
  }
  if (cfg.pilot_programs.length > 0 && !cfg.pilot_programs.includes(msg.academic_program)) {
    return { in_scope: false, reason: `program '${msg.academic_program}' is not part of the pilot` };
  }
  return { in_scope: true, reason: null };
}

/** Hash determinístico corto (FNV-1a) para IDs de mensaje cuando la fuente no trae uno. */
export function simpleHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
