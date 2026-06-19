import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import {
  ISessionRepository,
  SessionRecord,
  CreateSessionDto,
} from './session.repository.interface';

interface SessionRow {
  id: string;
  user_id: string;
  ip_address: string;
  user_agent: string;
  is_revoked: boolean;
  created_at: Date;
  expires_at: Date;
}

@Injectable()
export class SessionRepository implements ISessionRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(dto: CreateSessionDto): Promise<SessionRecord> {
    const { rows } = await this.pool.query<SessionRow>(
      `INSERT INTO sessions (user_id, ip_address, user_agent)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, ip_address, user_agent,
                 is_revoked, created_at, expires_at`,
      [dto.userId, dto.ipAddress, dto.userAgent],
    );
    return this.toRecord(rows[0]);
  }

  async findActiveById(sessionId: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT id, user_id, ip_address, user_agent,
              is_revoked, created_at, expires_at
       FROM sessions
       WHERE id         = $1
         AND is_revoked = false
         AND expires_at > now()`,
      [sessionId],
    );
    return rows.length ? this.toRecord(rows[0]) : null;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.pool.query(`UPDATE sessions SET is_revoked = true WHERE id = $1`, [sessionId]);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query(`UPDATE sessions SET is_revoked = true WHERE user_id = $1`, [userId]);
  }

  // ─── Mapping ───────────────────────────────────────────────────────────────

  private toRecord(row: SessionRow): SessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      isRevoked: row.is_revoked,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }
}
