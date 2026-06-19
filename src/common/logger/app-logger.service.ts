import { Injectable, ConsoleLogger, LoggerService, Scope } from '@nestjs/common';
import { LogEvent } from '../../auth/constants/auth.enums';

export interface LogContext {
  event: LogEvent;
  userId?: string;
  sessionId?: string;
  ip?: string;
  email?: string; // only log hashed/partial in production
  [key: string]: unknown;
}

/**
 * AppLogger wraps NestJS Logger and emits structured JSON lines to stdout.
 *
 * In development: human-readable coloured output via NestJS default.
 * In production:  JSON lines compatible with most SIEM / log aggregators.
 *
 * Usage:
 *   this.logger.event(LogEvent.LOGIN_SUCCESS, { userId, ip });
 *   this.logger.warn(LogEvent.LOGIN_INVALID_CREDS, { ip });
 *   this.logger.error(LogEvent.DB_POOL_ERROR, error, { ip });
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private nest = new ConsoleLogger(AppLogger.name);
  private context = AppLogger.name;

  setContext(context: string): this {
    this.context = context;
    this.nest = new ConsoleLogger(context);
    return this;
  }

  /** Logs an informational auth/session event */
  event(event: LogEvent, meta: Omit<LogContext, 'event'> = {}): void {
    const entry = this.build('INFO', event, meta);
    this.nest.log(entry, this.context);
  }

  /** Logs a security-relevant warning (bad token, wrong password, etc.) */
  warn(event: LogEvent, meta: Omit<LogContext, 'event'> = {}): void {
    const entry = this.build('WARN', event, meta);
    this.nest.warn(entry, this.context);
  }

  /** Logs an error — stack is printed in development, suppressed in production */
  error(event: LogEvent, error: unknown, meta: Omit<LogContext, 'event'> = {}): void {
    const entry = this.build('ERROR', event, {
      ...meta,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    const stack =
      process.env.NODE_ENV !== 'production' && error instanceof Error ? error.stack : undefined;

    this.nest.error(entry, stack, this.context);
  }

  /** Standard NestJS LoggerService interface — used by the framework itself */
  log(message: unknown): void {
    this.nest.log(String(message), this.context);
  }
  verbose(message: unknown): void {
    this.nest.verbose?.(String(message), this.context);
  }
  debug(message: unknown): void {
    this.nest.debug?.(String(message), this.context);
  }
  fatal(message: unknown): void {
    this.nest.fatal?.(String(message), this.context);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private build(level: string, event: LogEvent, meta: Omit<LogContext, 'event'>): string {
    const payload: Record<string, unknown> = {
      level,
      event,
      timestamp: new Date().toISOString(),
      context: this.context,
      ...meta,
    };

    // Redact email in production — only keep domain for debugging
    if (payload.email && process.env.NODE_ENV === 'production') {
      const parts = (payload.email as string).split('@');
      payload.email = parts.length === 2 ? `***@${parts[1]}` : '***';
    }

    return JSON.stringify(payload);
  }
}
