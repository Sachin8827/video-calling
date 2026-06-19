import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit-event.enum';

export interface ContactRecord {
  id: string;
  ownerId: string;
  contactUserId: string;
  nickname: string | null;
  savedAt: Date;
}

export interface ContactSaveRequest {
  id: string;
  callSessionId: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: Date;
  resolvedAt: Date | null;
}

@Injectable()
export class ContactsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  /** Initiate a contact-save handshake after a call. */
  async requestContactSave(
    callSessionId: string,
    fromUserId: string,
    toUserId: string,
    ipAddress: string,
  ): Promise<ContactSaveRequest> {
    const { rows } = await this.pool.query<ContactSaveRequest>(
      `INSERT INTO contact_save_requests (call_session_id, from_user_id, to_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (call_session_id, from_user_id, to_user_id) DO NOTHING
       RETURNING id, call_session_id AS "callSessionId", from_user_id AS "fromUserId",
                 to_user_id AS "toUserId", status, created_at AS "createdAt",
                 resolved_at AS "resolvedAt"`,
      [callSessionId, fromUserId, toUserId],
    );

    // ON CONFLICT DO NOTHING returns zero rows — fetch the existing request
    if (!rows.length) {
      const { rows: existing } = await this.pool.query<ContactSaveRequest>(
        `SELECT id, call_session_id AS "callSessionId", from_user_id AS "fromUserId",
                to_user_id AS "toUserId", status, created_at AS "createdAt",
                resolved_at AS "resolvedAt"
           FROM contact_save_requests
          WHERE call_session_id = $1 AND from_user_id = $2 AND to_user_id = $3`,
        [callSessionId, fromUserId, toUserId],
      );
      if (!existing.length) {
        throw new ConflictException('Contact save request could not be created.');
      }
      return existing[0];
    }

    await this.auditService.log({
      userId: fromUserId,
      eventType: AuditEventType.CONTACT_SAVE_REQUESTED,
      payload: { callSessionId, toUserId },
      ipAddress,
    });
    return rows[0];
  }

  /** Accept a contact-save request — creates bidirectional contact records. */
  async acceptContactSave(
    requestId: string,
    acceptorId: string,
    ipAddress: string,
  ): Promise<{ saved: boolean }> {
    // Find the pending request
    const { rows: reqRows } = await this.pool.query<ContactSaveRequest>(
      `UPDATE contact_save_requests
          SET status = 'accepted', resolved_at = NOW()
        WHERE id = $1 AND to_user_id = $2 AND status = 'pending'
        RETURNING from_user_id AS "fromUserId", to_user_id AS "toUserId"`,
      [requestId, acceptorId],
    );
    if (!reqRows.length) return { saved: false };

    const { fromUserId, toUserId } = reqRows[0];

    // Bidirectional insert
    await this.pool.query(
      `INSERT INTO contacts (owner_id, contact_user_id) VALUES ($1, $2), ($2, $1)
       ON CONFLICT (owner_id, contact_user_id) DO NOTHING`,
      [fromUserId, toUserId],
    );

    await this.auditService.log({
      userId: acceptorId,
      eventType: AuditEventType.CONTACT_SAVED,
      payload: { fromUserId, toUserId, requestId },
      ipAddress,
    });

    return { saved: true };
  }

  /** Reject or let a contact-save request expire. */
  async rejectContactSave(requestId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE contact_save_requests SET status = 'rejected', resolved_at = NOW()
        WHERE id = $1 AND to_user_id = $2 AND status = 'pending'`,
      [requestId, userId],
    );
    await this.auditService.log({
      userId: userId,
      eventType: AuditEventType.CONTACT_SAVE_REJECTED,
      payload: { requestId },
    });
  }

  /** List all contacts for a user. */
  async listContacts(userId: string): Promise<ContactRecord[]> {
    const { rows } = await this.pool.query<ContactRecord>(
      `SELECT c.id, c.owner_id AS "ownerId", c.contact_user_id AS "contactUserId",
              c.nickname, c.saved_at AS "savedAt",
              u.email AS "contactEmail"
         FROM contacts c
         JOIN users u ON u.id = c.contact_user_id
        WHERE c.owner_id = $1
        ORDER BY c.saved_at DESC`,
      [userId],
    );
    return rows;
  }

  /** Update contact nickname. */
  async updateNickname(ownerId: string, contactId: string, nickname: string): Promise<void> {
    await this.pool.query(`UPDATE contacts SET nickname = $1 WHERE id = $2 AND owner_id = $3`, [
      nickname,
      contactId,
      ownerId,
    ]);
  }

  /** Remove a contact. */
  async removeContact(ownerId: string, contactId: string): Promise<void> {
    await this.pool.query(`DELETE FROM contacts WHERE id = $1 AND owner_id = $2`, [
      contactId,
      ownerId,
    ]);
  }
}
