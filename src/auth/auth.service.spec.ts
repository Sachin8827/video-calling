import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { AppLogger } from '../common/logger/app-logger.service';

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: '',
  mfaEnabled: false,
  failedAttempts: 0,
  lockedUntil: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSession = {
  id: 'session-uuid-1',
  userId: mockUser.id,
  ipAddress: '127.0.0.1',
  userAgent: 'Jest',
  isRevoked: false,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 86_400_000),
};

const mockLogger = {
  setContext: jest.fn().mockReturnThis(),
  event: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
};

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let sessionsService: jest.Mocked<SessionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            incrementFailedAttempts: jest.fn(),
            resetFailedAttempts: jest.fn(),
            isLocked: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: SessionsService,
          useValue: {
            createSession: jest.fn().mockResolvedValue(mockSession),
            issueTokenSet: jest
              .fn()
              .mockResolvedValue({ rawRefreshToken: 'raw-rt', csrfToken: 'raw-csrf' }),
            findActiveSession: jest.fn().mockResolvedValue(mockSession),
            revokeSession: jest.fn(),
            revokeAllUserSessions: jest.fn(),
            rotateRefreshToken: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k: string, d: unknown) => d), getOrThrow: jest.fn() },
        },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    sessionsService = module.get(SessionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Registration ─────────────────────────────────────────────────────────

  describe('register()', () => {
    it('returns identical message when email already exists (anti-enumeration)', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      const result = await authService.register({
        email: 'test@example.com',
        password: 'Str0ng!Pass#2026',
      });
      expect(result.message).toContain('If this email is new');
    });

    it('rejects passwords scoring below FAIR (score < 2)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        authService.register({ email: 'a@b.com', password: 'password' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new user and returns success message', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      const result = await authService.register({
        email: 'new@example.com',
        password: 'Str0ng!Pass#2026',
      });
      expect(result.message).toContain('If this email is new');
      expect(usersService.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  describe('login()', () => {
    beforeEach(async () => {
      mockUser.passwordHash = await argon2.hash('Correct!Pass#2026');
      usersService.findByEmail.mockResolvedValue({ ...mockUser });
    });

    it('returns all three tokens on valid credentials', async () => {
      const result = await authService.login(
        { email: mockUser.email, password: 'Correct!Pass#2026' },
        '127.0.0.1',
        'Jest',
      );
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.csrfToken).toBeDefined();
    });

    it('throws UnauthorizedException on wrong password', async () => {
      await expect(
        authService.login({ email: mockUser.email, password: 'WrongPass' }, '127.0.0.1', 'Jest'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns same error when user does not exist (no timing enumeration)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        authService.login({ email: 'nobody@x.com', password: 'whatever' }, '127.0.0.1', 'Jest'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws same error message for locked account (no lock disclosure)', async () => {
      usersService.isLocked.mockReturnValue(true);
      const err = await authService
        .login({ email: mockUser.email, password: 'Correct!Pass#2026' }, '127.0.0.1', 'Jest')
        .catch((e: UnauthorizedException) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe('Invalid email or password.');
    });

    it('increments failed attempts counter on wrong password', async () => {
      await authService
        .login({ email: mockUser.email, password: 'wrong' }, '127.0.0.1', 'Jest')
        .catch(() => {});
      expect(usersService.incrementFailedAttempts).toHaveBeenCalledWith(mockUser.id, '127.0.0.1');
    });

    it('resets failed attempts on successful login', async () => {
      await authService.login(
        { email: mockUser.email, password: 'Correct!Pass#2026' },
        '127.0.0.1',
        'Jest',
      );
      expect(usersService.resetFailedAttempts).toHaveBeenCalledWith(mockUser.id);
    });

    it('logs LOGIN_SUCCESS event', async () => {
      await authService.login(
        { email: mockUser.email, password: 'Correct!Pass#2026' },
        '127.0.0.1',
        'Jest',
      );
      expect(mockLogger.event).toHaveBeenCalledWith(
        expect.stringContaining('AUTH_LOGIN_SUCCESS'),
        expect.any(Object),
      );
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('revokes the specified session', async () => {
      await authService.logout('session-uuid-1', 'user-uuid-1');
      expect(sessionsService.revokeSession).toHaveBeenCalledWith('session-uuid-1', 'user-uuid-1');
    });
  });

  describe('logoutAll()', () => {
    it('revokes all sessions for the user', async () => {
      await authService.logoutAll('user-uuid-1');
      expect(sessionsService.revokeAllUserSessions).toHaveBeenCalledWith('user-uuid-1');
    });
  });
});
