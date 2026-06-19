import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { CallSessionRecord, CallParticipantRecord } from './interfaces/call.interfaces';

@Injectable()
export class CallsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // ── Sessions ────────────────────────────────────────────────

  async createSession(params: {
    initiatorId: string;
    callType: 'voice' | 'video' | 'group';
    isAnonymous: boolean;
    roomId?: string;
  }): Promise<CallSessionRecord> {
    const { rows } = await this.pool.query<CallSessionRecord>(
      `INSERT INTO call_sessions (initiator_id, call_type, is_anonymous, room_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, initiator_id AS "initiatorId", call_type AS "callType",
                 status, is_anonymous AS "isAnonymous", room_id AS "roomId",
                 started_at AS "startedAt", answered_at AS "answeredAt",
                 ended_at AS "endedAt", duration_seconds AS "durationSeconds"`,
      [params.initiatorId, params.callType, params.isAnonymous, params.roomId ?? null],
    );
    return rows[0];
  }

  async updateStatus(
    callId: string,
    status: CallSessionRecord['status'],
    extra?: { answeredAt?: boolean; endedAt?: boolean; roomId?: string },
  ): Promise<void> {
    const sets: string[] = ['status = $2'];
    const values: unknown[] = [callId, status];
    let idx = 3;
    if (extra?.answeredAt) {
      sets.push(`answered_at = NOW()`);
    }
    if (extra?.endedAt) {
      sets.push(`ended_at = NOW()`);
    }
    if (extra?.roomId) {
      sets.push(`room_id = $${idx}`);
      values.push(extra.roomId);
      idx++;
    }

    await this.pool.query(`UPDATE call_sessions SET ${sets.join(', ')} WHERE id = $1`, values);
  }

  async findById(id: string): Promise<CallSessionRecord | null> {
    const { rows } = await this.pool.query<CallSessionRecord>(
      `SELECT id, initiator_id AS "initiatorId", call_type AS "callType",
              status, is_anonymous AS "isAnonymous", room_id AS "roomId",
              started_at AS "startedAt", answered_at AS "answeredAt",
              ended_at AS "endedAt", duration_seconds AS "durationSeconds"
         FROM call_sessions WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findHistory(userId: string, limit = 20, offset = 0): Promise<CallSessionRecord[]> {
    const { rows } = await this.pool.query<CallSessionRecord>(
      `SELECT cs.id, cs.initiator_id AS "initiatorId", cs.call_type AS "callType",
              cs.status, cs.is_anonymous AS "isAnonymous", cs.room_id AS "roomId",
              cs.started_at AS "startedAt", cs.answered_at AS "answeredAt",
              cs.ended_at AS "endedAt", cs.duration_seconds AS "durationSeconds"
         FROM call_sessions cs
         JOIN call_participants cp ON cp.call_session_id = cs.id
        WHERE cp.user_id = $1
        ORDER BY cs.started_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return rows;
  }

  // ── Participants ────────────────────────────────────────────

  async addParticipant(params: {
    callSessionId: string;
    userId?: string;
    anonymousId?: string;
    role: 'host' | 'guest';
    cameraEnabled: boolean;
  }): Promise<CallParticipantRecord> {
    const { rows } = await this.pool.query<CallParticipantRecord>(
      `INSERT INTO call_participants (call_session_id, user_id, anonymous_id, role, camera_enabled)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, call_session_id AS "callSessionId", user_id AS "userId",
                 anonymous_id AS "anonymousId", role, joined_at AS "joinedAt",
                 left_at AS "leftAt", mic_enabled AS "micEnabled",
                 camera_enabled AS "cameraEnabled"`,
      [
        params.callSessionId,
        params.userId ?? null,
        params.anonymousId ?? null,
        params.role,
        params.cameraEnabled,
      ],
    );
    return rows[0];
  }

  async updateParticipantMedia(
    callSessionId: string,
    userId: string,
    mic?: boolean,
    camera?: boolean,
    anonymousId?: string,
  ): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [callSessionId];

    // Determine participant identifier (user_id or anonymous_id)
    if (anonymousId) {
      values.push(anonymousId);
    } else {
      values.push(userId);
    }

    if (mic !== undefined) {
      updates.push(`mic_enabled = $${values.push(mic)}`);
    }
    if (camera !== undefined) {
      updates.push(`camera_enabled = $${values.push(camera)}`);
    }
    if (!updates.length) return;

    const identifierColumn = anonymousId ? 'anonymous_id' : 'user_id';
    await this.pool.query(
      `UPDATE call_participants SET ${updates.join(', ')}
        WHERE call_session_id = $1 AND ${identifierColumn} = $2 AND left_at IS NULL`,
      values,
    );
  }

  async markParticipantLeft(
    callSessionId: string,
    userId: string,
    anonymousId?: string,
  ): Promise<void> {
    // For anonymous users, query by anonymous_id since user_id is NULL
    if (anonymousId) {
      await this.pool.query(
        `UPDATE call_participants SET left_at = NOW()
          WHERE call_session_id = $1 AND anonymous_id = $2 AND left_at IS NULL`,
        [callSessionId, anonymousId],
      );
    } else {
      await this.pool.query(
        `UPDATE call_participants SET left_at = NOW()
          WHERE call_session_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [callSessionId, userId],
      );
    }
  }

  async getParticipants(callSessionId: string): Promise<CallParticipantRecord[]> {
    const { rows } = await this.pool.query<CallParticipantRecord>(
      `SELECT id, call_session_id AS "callSessionId", user_id AS "userId",
              anonymous_id AS "anonymousId", role, joined_at AS "joinedAt",
              left_at AS "leftAt", mic_enabled AS "micEnabled",
              camera_enabled AS "cameraEnabled"
         FROM call_participants WHERE call_session_id = $1`,
      [callSessionId],
    );
    return rows;
  }
}
