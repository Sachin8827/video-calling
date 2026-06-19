import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { createHash, randomBytes } from 'crypto';
import { DATABASE_POOL } from '../../database/database.module';
import { ICsrfTokenRepository } from './csrf-token.repository.interface';

@Injectable()
export class CsrfTokenRepository implements ICsrfTokenRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async upsert(sessionId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const hash = this.hash(raw);

    await this.pool.query(
      `INSERT INTO csrf_tokens (session_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '24 hours')
       ON CONFLICT (session_id)
       DO UPDATE
         SET token_hash = $2,
             expires_at = now() + INTERVAL '24 hours'`,
      [sessionId, hash],
    );

    return raw;
  }

  async isValid(sessionId: string, rawToken: string): Promise<boolean> {
    const hash = this.hash(rawToken);

    const { rows } = await this.pool.query<{ exists: string }>(
      `SELECT 1 AS exists
       FROM csrf_tokens
       WHERE session_id = $1
         AND token_hash = $2
         AND expires_at > now()`,
      [sessionId, hash],
    );

    return rows.length > 0;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
