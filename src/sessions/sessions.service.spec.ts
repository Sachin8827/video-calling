import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SESSION_REPOSITORY } from './repositories/session.repository.interface';
import { REFRESH_TOKEN_REPOSITORY } from './repositories/refresh-token.repository.interface';
import { CSRF_TOKEN_REPOSITORY } from './repositories/csrf-token.repository.interface';
import { AppLogger } from '../common/logger/app-logger.service';

const mockLogger = {
  setContext: jest.fn().mockReturnThis(),
  event: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
};

const mockSession = {
  id: 'sess-1',
  userId: 'user-1',
  ipAddress: '1.2.3.4',
  userAgent: 'Jest',
  isRevoked: false,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 86_400_000),
};

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionRepo: {
    create: jest.Mock;
    findActiveById: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  let rtRepo: { create: jest.Mock; rotate: jest.Mock };
  let csrfRepo: { upsert: jest.Mock; isValid: jest.Mock };

  beforeEach(async () => {
    sessionRepo = {
      create: jest.fn().mockResolvedValue(mockSession),
      findActiveById: jest.fn().mockResolvedValue(mockSession),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    rtRepo = {
      create: jest.fn().mockResolvedValue({ id: 'rt-1', familyId: 'fam-1' }),
      rotate: jest.fn(),
    };
    csrfRepo = {
      upsert: jest.fn().mockResolvedValue('raw-csrf-token'),
      isValid: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: rtRepo },
        { provide: CSRF_TOKEN_REPOSITORY, useValue: csrfRepo },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Session creation ──────────────────────────────────────────────────────

  describe('createSession()', () => {
    it('creates and returns a session', async () => {
      const result = await service.createSession('user-1', '1.2.3.4', 'Jest');
      expect(result.id).toBe('sess-1');
      expect(sessionRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        ipAddress: '1.2.3.4',
        userAgent: 'Jest',
      });
    });

    it('logs SESSION_CREATED event', async () => {
      await service.createSession('user-1', '1.2.3.4', 'Jest');
      expect(mockLogger.event).toHaveBeenCalledWith(
        expect.stringContaining('SESSION_CREATED'),
        expect.any(Object),
      );
    });
  });

  // ── Session revocation ────────────────────────────────────────────────────

  describe('revokeSession()', () => {
    it('calls repo.revoke with the session id', async () => {
      await service.revokeSession('sess-1');
      expect(sessionRepo.revoke).toHaveBeenCalledWith('sess-1');
    });
  });

  describe('revokeAllUserSessions()', () => {
    it('calls revokeAllForUser with the user id', async () => {
      await service.revokeAllUserSessions('user-1');
      expect(sessionRepo.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  // ── Token rotation ────────────────────────────────────────────────────────

  describe('rotateRefreshToken()', () => {
    it('delegates to repo.rotate and returns new token + csrf', async () => {
      rtRepo.rotate.mockResolvedValueOnce({ newRawToken: 'new-raw', sessionId: 'sess-1' });
      const result = await service.rotateRefreshToken('old-raw', '1.2.3.4');
      expect(result.newRawToken).toBe('new-raw');
      expect(result.csrfToken).toBe('raw-csrf-token');
      expect(result.sessionId).toBe('sess-1');
    });

    it('logs warning and re-throws on reuse detection', async () => {
      rtRepo.rotate.mockRejectedValueOnce(new UnauthorizedException('Invalid refresh token.'));
      await expect(service.rotateRefreshToken('stolen-token', '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('TOKEN_REFRESH_REUSE'),
        expect.any(Object),
      );
    });
  });

  // ── CSRF validation ───────────────────────────────────────────────────────

  describe('validateCsrfToken()', () => {
    it('returns true for a valid token', async () => {
      const valid = await service.validateCsrfToken('sess-1', 'good-csrf');
      expect(valid).toBe(true);
    });

    it('returns false and logs warning for invalid token', async () => {
      csrfRepo.isValid.mockResolvedValueOnce(false);
      const valid = await service.validateCsrfToken('sess-1', 'bad-csrf');
      expect(valid).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('CSRF_TOKEN_INVALID'),
        expect.any(Object),
      );
    });
  });
});
