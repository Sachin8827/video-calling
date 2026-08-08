import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthTokens } from './interfaces/auth-tokens.interface';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CookieName, HttpHeader, RateLimitPolicy, NodeEnv } from './constants/auth.enums';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: RateLimitPolicy.REGISTER_MAX, ttl: RateLimitPolicy.REGISTER_TTL_MS },
  })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 200, description: 'User successfully registered.' })
  @ApiResponse({ status: 400, description: 'Invalid email or weak password.' })
  async register(@Body() dto: RegisterDto): Promise<{ message: string }> {
    return this.authService.register(dto);
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RateLimitPolicy.LOGIN_MAX, ttl: RateLimitPolicy.LOGIN_TTL_MS } })
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const tokens = await this.authService.login(
      dto,
      this.resolveClientIp(req),
      req.headers[HttpHeader.USER_AGENT] ?? 'unknown',
    );
    this.attachCookies(res, tokens);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  // ─── Refresh ──────────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: RateLimitPolicy.REFRESH_MAX, ttl: RateLimitPolicy.REFRESH_TTL_MS },
  })
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing refresh token.' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const rawRefreshToken =
      (req.cookies as Record<string, string>)[CookieName.REFRESH_TOKEN] ??
      (req.body as { refreshToken?: string }).refreshToken;

    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided.');
    }

    const tokens = await this.authService.refresh(
      rawRefreshToken,
      this.resolveClientIp(req),
      req.headers[HttpHeader.USER_AGENT] ?? 'unknown',
    );
    this.attachCookies(res, tokens);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out the current session' })
  @ApiResponse({ status: 204, description: 'Successfully logged out.' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(user.sid, user.sub);
    this.clearCookies(res);
  }

  // ─── Logout all sessions ──────────────────────────────────────────────────

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out all active sessions for the user' })
  @ApiResponse({ status: 204, description: 'All sessions successfully invalidated.' })
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.sub);
    this.clearCookies(res);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private attachCookies(res: Response, tokens: AuthTokens): void {
    const isProd = process.env.NODE_ENV === NodeEnv.PRODUCTION;

    // HttpOnly — not readable by JS; only sent to /auth/refresh
    res.cookie(CookieName.REFRESH_TOKEN, tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: SEVEN_DAYS_MS,
      path: '/api/v1/auth/refresh',
    });

    // Non-HttpOnly — frontend JS reads this and sends as X-CSRF-Token header
    res.cookie(CookieName.XSRF_TOKEN, tokens.csrfToken, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      maxAge: ONE_DAY_MS,
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie(CookieName.REFRESH_TOKEN, { path: '/api/v1/auth/refresh' });
    res.clearCookie(CookieName.XSRF_TOKEN);
  }

  private resolveClientIp(req: Request): string {
    const forwarded = req.headers[HttpHeader.FORWARDED_FOR];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? '0.0.0.0';
  }
}
