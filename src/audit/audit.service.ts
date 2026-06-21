import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { AuditEventType } from './audit-event.enum';

function isValidIp(ip: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[0-9a-fA-F:]+$/.test(ip);
}

export interface AuditEntry {
  userId?: string;
  anonymousId?: string;
  eventType: AuditEventType;
  payload?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Append-only write — never updates or deletes.
   * Fire-and-forget: errors are logged but never thrown to callers.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO audit_logs
           (user_id, anonymous_id, event_type, payload, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5::inet, $6)`,
        [
          entry.userId ?? null,
          entry.anonymousId ?? null,
          entry.eventType,
          JSON.stringify(entry.payload ?? {}),
          entry.ipAddress && isValidIp(entry.ipAddress) ? entry.ipAddress : null,
          entry.userAgent ?? null,
        ],
      );
    } catch (err) {
      // Audit failure must never crash the application
      console.error(
        JSON.stringify({
          level: 'ERROR',
          event: 'audit.write_failed',
          message: err instanceof Error ? err.message : String(err),
          entry: { eventType: entry.eventType, userId: entry.userId },
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  /** Query audit logs for a specific user (admin use). */
  async findByUser(userId: string, limit = 100, offset = 0): Promise<AuditEntry[]> {
    const result = await this.pool.query(
      `SELECT user_id, anonymous_id, event_type, payload, ip_address, user_agent, occurred_at
         FROM audit_logs
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows;
  }
}
