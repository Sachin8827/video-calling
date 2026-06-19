import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { createHash, randomBytes } from 'crypto';
import { DATABASE_POOL } from '../../database/database.module';
import { AuthErrorMessage } from '../../auth/constants/auth.enums';
import {
  IRefreshTokenRepository,
  RefreshTokenRecord,
  CreateRefreshTokenDto,
  RotateRefreshTokenResult,
} from './refresh-token.repository.interface';

interface RefreshTokenRow {
  id: string;
  session_id: string;
  token_hash: string;
  family_id: string;
  is_used: boolean;
  created_at: Date;
  expires_at: Date;
}

@Injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(dto: CreateRefreshTokenDto): Promise<RefreshTokenRecord> {
    const { rows } = await this.pool.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (session_id, token_hash, family_id)
       VALUES ($1, $2, $3)
       RETURNING id, session_id, token_hash, family_id,
                 is_used, created_at, expires_at`,
      [dto.sessionId, dto.tokenHash, dto.familyId],
    );
    return this.toRecord(rows[0]);
  }

  /**
   * Atomically rotates the refresh token inside a serialised transaction.
   *
   * Happy path:
   *   1. Lock the row with FOR UPDATE (prevent concurrent rotation races).
   *   2. Mark is_used = true.
   *   3. Insert a new token in the same family.
   *   4. Return the new raw token.
   *
   * Reuse detected (is_used = true on arrival):
   *   - Revoke ALL tokens in the family.
   *   - Revoke the parent session.
   *   - Throw UnauthorizedException with a generic message.
   *   The caller must NOT reveal which path was taken to the client.
   */
  async rotate(rawToken: string): Promise<RotateRefreshTokenResult> {
    const tokenHash = this.hash(rawToken);
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query<RefreshTokenRow>(
        `SELECT id, session_id, family_id, is_used, expires_at
         FROM refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash],
      );

      if (!rows.length) {
        await client.query('ROLLBACK');
        throw new UnauthorizedException(AuthErrorMessage.INVALID_REFRESH_TOKEN);
      }

      const token = rows[0];

      if (new Date() > token.expires_at) {
        await client.query('ROLLBACK');
        throw new UnauthorizedException(AuthErrorMessage.REFRESH_TOKEN_EXPIRED);
      }

      if (token.is_used) {
        // ── Reuse detected ────────────────────────────────────────────────
        // Revoke the entire token family and the parent session atomically.
        await client.query(
          `UPDATE refresh_tokens
           SET is_used = true
           WHERE family_id = $1`,
          [token.family_id],
        );
        await client.query(
          `UPDATE sessions
           SET is_revoked = true
           WHERE id = $1`,
          [token.session_id],
        );
        await client.query('COMMIT');
        // Generic message — do not reveal reuse to the caller
        throw new UnauthorizedException(AuthErrorMessage.INVALID_REFRESH_TOKEN);
      }

      // ── Happy path ────────────────────────────────────────────────────────
      await client.query(`UPDATE refresh_tokens SET is_used = true WHERE id = $1`, [token.id]);

      const newRaw = randomBytes(48).toString('hex');
      const newHash = this.hash(newRaw);

      await client.query(
        `INSERT INTO refresh_tokens (session_id, token_hash, family_id)
         VALUES ($1, $2, $3)`,
        [token.session_id, newHash, token.family_id],
      );

      await client.query('COMMIT');

      return { newRawToken: newRaw, sessionId: token.session_id };
    } catch (err) {
      // ROLLBACK only if we haven't committed yet
      try {
        await client.query('ROLLBACK');
      } catch {
        /* already committed */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private toRecord(row: RefreshTokenRow): RefreshTokenRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      tokenHash: row.token_hash,
      familyId: row.family_id,
      isUsed: row.is_used,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }
}
