import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { LogEvent, AuthErrorMessage } from '../auth/constants/auth.enums';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  SESSION_REPOSITORY,
  ISessionRepository,
  SessionRecord,
} from './repositories/session.repository.interface';
import {
  REFRESH_TOKEN_REPOSITORY,
  IRefreshTokenRepository,
} from './repositories/refresh-token.repository.interface';
import {
  CSRF_TOKEN_REPOSITORY,
  ICsrfTokenRepository,
} from './repositories/csrf-token.repository.interface';

export interface IssuedTokenSet {
  rawRefreshToken: string;
  csrfToken: string;
}

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly rtRepo: IRefreshTokenRepository,
    @Inject(CSRF_TOKEN_REPOSITORY) private readonly csrfRepo: ICsrfTokenRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(SessionsService.name);
  }

  // ─── Session ──────────────────────────────────────────────────────────────

  async createSession(
    userId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<SessionRecord> {
    const session = await this.sessionRepo.create({ userId, ipAddress, userAgent });
    this.logger.event(LogEvent.SESSION_CREATED, {
      userId,
      sessionId: session.id,
      ip: ipAddress,
    });
    return session;
  }

  async findActiveSession(sessionId: string): Promise<SessionRecord | null> {
    const session = await this.sessionRepo.findActiveById(sessionId);
    if (!session) {
      this.logger.warn(LogEvent.SESSION_INVALID, { sessionId });
    }
    return session;
  }

  async revokeSession(sessionId: string, userId?: string): Promise<void> {
    await this.sessionRepo.revoke(sessionId);
    this.logger.event(LogEvent.SESSION_REVOKED, { sessionId, userId });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepo.revokeAllForUser(userId);
    this.logger.event(LogEvent.SESSION_ALL_REVOKED, { userId });
  }

  // ─── Full token set issuance ──────────────────────────────────────────────

  async issueTokenSet(sessionId: string, userId: string): Promise<IssuedTokenSet> {
    const familyId = uuidv4();
    const rawRefreshToken = randomBytes(48).toString('hex');
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    await this.rtRepo.create({ sessionId, tokenHash, familyId });
    const csrfToken = await this.csrfRepo.upsert(sessionId);

    this.logger.event(LogEvent.SESSION_CREATED, { sessionId, userId });
    return { rawRefreshToken, csrfToken };
  }

  // ─── Refresh token rotation ───────────────────────────────────────────────

  async rotateRefreshToken(
    rawToken: string,
    ip: string,
  ): Promise<{
    newRawToken: string;
    sessionId: string;
    csrfToken: string;
  }> {
    const result = await this.rtRepo.rotate(rawToken).catch((err) => {
      // rotate() throws UnauthorizedException for reuse — log it as a warning
      if (err instanceof UnauthorizedException) {
        this.logger.warn(LogEvent.TOKEN_REFRESH_REUSE, { ip });
      }
      throw err;
    });

    const csrfToken = await this.csrfRepo.upsert(result.sessionId);

    this.logger.event(LogEvent.TOKEN_REFRESH, {
      sessionId: result.sessionId,
      ip,
    });

    return { ...result, csrfToken };
  }

  // ─── CSRF validation ─────────────────────────────────────────────────────

  async validateCsrfToken(sessionId: string, rawToken: string): Promise<boolean> {
    const valid = await this.csrfRepo.isValid(sessionId, rawToken);
    if (!valid) {
      this.logger.warn(LogEvent.CSRF_INVALID, { sessionId });
    }
    return valid;
  }
}
