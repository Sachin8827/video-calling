import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import { PgErrorCode, LockoutPolicy } from '../../auth/constants/auth.enums';
import { IUserRepository, UserRecord, CreateUserDto } from './user.repository.interface';

// Raw DB row shape — internal to this file only
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  mfa_enabled: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, mfa_enabled,
              failed_attempts, locked_until, is_active,
              created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email],
    );
    return rows.length ? this.toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, mfa_enabled,
              failed_attempts, locked_until, is_active,
              created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id],
    );
    return rows.length ? this.toRecord(rows[0]) : null;
  }

  async create(dto: CreateUserDto): Promise<UserRecord> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, password_hash, mfa_enabled,
                   failed_attempts, locked_until, is_active,
                   created_at, updated_at`,
        [dto.email, dto.passwordHash],
      );
      return this.toRecord(rows[0]);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === PgErrorCode.UNIQUE_VIOLATION) {
        // Bubble up as a typed error — service layer decides the response
        const conflict = new Error(`Email already registered: ${dto.email}`);
        (conflict as Error & { code: string }).code = PgErrorCode.UNIQUE_VIOLATION;
        throw conflict;
      }
      throw err;
    }
  }

  async incrementFailedAttempts(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ failed_attempts: number }>(
      `UPDATE users
       SET failed_attempts = failed_attempts + 1,
           locked_until    = CASE
             WHEN failed_attempts + 1 >= $2
             THEN now() + ($3 || ' minutes')::INTERVAL
             ELSE locked_until
           END
       WHERE id = $1
       RETURNING failed_attempts`,
      [userId, LockoutPolicy.MAX_FAILED_ATTEMPTS, LockoutPolicy.LOCKOUT_MINUTES],
    );
    return rows[0]?.failed_attempts ?? 0;
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_attempts = 0,
           locked_until    = NULL
       WHERE id = $1`,
      [userId],
    );
  }

  // ─── Mapping ───────────────────────────────────────────────────────────────

  private toRecord(row: UserRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      mfaEnabled: row.mfa_enabled,
      failedAttempts: row.failed_attempts,
      lockedUntil: row.locked_until,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
