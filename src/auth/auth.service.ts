import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as zxcvbn from 'zxcvbn';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  AuthErrorMessage,
  RegisterMessage,
  LogEvent,
  MINIMUM_PASSWORD_SCORE,
} from './constants/auth.enums';
import { AuthTokens } from './interfaces/auth-tokens.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly argon2Options: argon2.Options;

  // Dummy hash used during constant-time comparison when the user is not found.
  // Prevents timing-based email enumeration — the hash computation always runs.
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaasfasdf';

  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(AuthService.name);

    this.argon2Options = {
      type: argon2.argon2id,
      memoryCost: this.config.get<number>('auth.argon2.memoryCost', 65536),
      timeCost: this.config.get<number>('auth.argon2.timeCost', 3),
      parallelism: this.config.get<number>('auth.argon2.parallelism', 4),
      hashLength: 32,
    };
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ message: string }> {
    this.logger.event(LogEvent.REGISTER_ATTEMPT, { email: dto.email });

    const strength = zxcvbn(dto.password, [dto.email]);
    if (strength.score < MINIMUM_PASSWORD_SCORE) {
      throw new BadRequestException(
        strength.feedback.suggestions[0] ?? AuthErrorMessage.PASSWORD_TOO_WEAK,
      );
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      this.logger.warn(LogEvent.REGISTER_DUPLICATE, { email: dto.email });
      // Identical response — no enumeration
      return { message: RegisterMessage.SUCCESS };
    }

    const passwordHash = (await argon2.hash(
      dto.password,
      this.argon2Options as any,
    )) as unknown as string;

    try {
      await this.usersService.create(dto.email, passwordHash);
    } catch (err) {
      if (err instanceof ConflictException) {
        return { message: RegisterMessage.SUCCESS };
      }
      throw err;
    }

    return { message: RegisterMessage.SUCCESS };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress: string, userAgent: string): Promise<AuthTokens> {
    this.logger.event(LogEvent.LOGIN_ATTEMPT, { email: dto.email, ip: ipAddress });

    const user = await this.usersService.findByEmail(dto.email);

    // Always run hash — prevents timing-based enumeration
    const hashToVerify = user?.passwordHash ?? AuthService.DUMMY_HASH;
    const passwordValid = await argon2.verify(hashToVerify, dto.password);

    if (!user || !passwordValid || !user.isActive) {
      if (user) {
        if (!user.isActive) {
          this.logger.warn(LogEvent.LOGIN_INACTIVE_ACCOUNT, {
            userId: user.id,
            ip: ipAddress,
          });
        } else if (!this.usersService.isLocked(user)) {
          await this.usersService.incrementFailedAttempts(user.id, ipAddress);
        }
      }
      this.logger.warn(LogEvent.LOGIN_INVALID_CREDS, { ip: ipAddress, email: dto.email });
      throw new UnauthorizedException(AuthErrorMessage.INVALID_CREDENTIALS);
    }

    if (this.usersService.isLocked(user)) {
      this.logger.warn(LogEvent.LOGIN_ACCOUNT_LOCKED, {
        userId: user.id,
        ip: ipAddress,
      });
      // Same message — do not reveal locked state
      throw new UnauthorizedException(AuthErrorMessage.INVALID_CREDENTIALS);
    }

    await this.usersService.resetFailedAttempts(user.id);

    const tokens = await this.issueTokens(user.id, ipAddress, userAgent);

    this.logger.event(LogEvent.LOGIN_SUCCESS, {
      userId: user.id,
      sessionId: undefined, // session id is inside tokens but not exposed here
      ip: ipAddress,
      email: dto.email,
    });

    return tokens;
  }

  // ─── Token refresh ────────────────────────────────────────────────────────

  async refresh(
    rawRefreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const { newRawToken, sessionId, csrfToken } = await this.sessionsService.rotateRefreshToken(
      rawRefreshToken,
      ipAddress,
    );

    const session = await this.sessionsService.findActiveSession(sessionId);
    if (!session) {
      throw new UnauthorizedException(AuthErrorMessage.SESSION_INVALID);
    }

    const accessToken = this.signAccessToken(session.userId, sessionId);

    return {
      accessToken,
      refreshToken: newRawToken,
      csrfToken,
      expiresIn: this.accessTokenExpirySeconds(),
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.sessionsService.revokeSession(sessionId, userId);
    this.logger.event(LogEvent.LOGOUT, { sessionId, userId });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionsService.revokeAllUserSessions(userId);
    this.logger.event(LogEvent.LOGOUT_ALL, { userId });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const session = await this.sessionsService.createSession(userId, ipAddress, userAgent);
    const { rawRefreshToken, csrfToken } = await this.sessionsService.issueTokenSet(
      session.id,
      userId,
    );
    const accessToken = this.signAccessToken(userId, session.id);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      csrfToken,
      expiresIn: this.accessTokenExpirySeconds(),
    };
  }

  private signAccessToken(userId: string, sessionId: string): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, sid: sessionId };
    return this.jwtService.sign(payload);
  }

  private accessTokenExpirySeconds(): number {
    const expiry = this.config.get<string>('JWT_ACCESS_EXPIRY', '15m');
    const match = expiry.match(/^(\d+)(m|h|d)$/);
    if (!match) return 900;
    const [, val, unit] = match;
    const n = parseInt(val, 10);
    if (unit === 'm') return n * 60;
    if (unit === 'h') return n * 3600;
    if (unit === 'd') return n * 86400;
    return 900;
  }
}
