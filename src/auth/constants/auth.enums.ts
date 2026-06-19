// =============================================================================
// auth.enums.ts
// Single source of truth for every enum used across the auth module.
// No magic strings anywhere else in the codebase — import from here.
// =============================================================================

// ─── Error messages ───────────────────────────────────────────────────────────

/**
 * Client-facing error messages.
 *
 * Security rule: login/reset errors are intentionally identical whether the
 * email exists or not — prevents account enumeration.
 */
export enum AuthErrorMessage {
  INVALID_CREDENTIALS = 'Invalid email or password.',
  SESSION_INVALID = 'Session is no longer valid.',
  CSRF_MISSING = 'CSRF token missing.',
  CSRF_INVALID = 'Invalid or expired CSRF token.',
  NO_ACTIVE_SESSION = 'No active session.',
  INVALID_REFRESH_TOKEN = 'Invalid refresh token.',
  REFRESH_TOKEN_EXPIRED = 'Refresh token has expired.',
  NO_REFRESH_TOKEN = 'No refresh token provided.',
  AUTH_REQUIRED = 'Authentication required.',
  PASSWORD_TOO_WEAK = 'Password is too weak. Use a mix of letters, numbers, and symbols.',
  UNEXPECTED_ERROR = 'An unexpected error occurred. Please try again later.',
}

/**
 * Anti-enumeration registration message.
 * Identical whether the email already exists or a new account was created.
 */
export enum RegisterMessage {
  SUCCESS = 'If this email is new, your account has been created.',
}

// ─── Cookie names ─────────────────────────────────────────────────────────────

export enum CookieName {
  REFRESH_TOKEN = 'refresh_token',
  XSRF_TOKEN = 'XSRF-TOKEN',
}

// ─── HTTP header names ────────────────────────────────────────────────────────

export enum HttpHeader {
  AUTHORIZATION = 'authorization',
  CSRF_TOKEN = 'x-csrf-token',
  FORWARDED_FOR = 'x-forwarded-for',
  USER_AGENT = 'user-agent',
  CACHE_CONTROL = 'Cache-Control',
  PRAGMA = 'Pragma',
  EXPIRES = 'Expires',
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export enum JwtAlgorithm {
  HS256 = 'HS256',
}

// ─── Password strength ────────────────────────────────────────────────────────

/** zxcvbn score thresholds (0–4). We require at least FAIR. */
export enum PasswordStrengthScore {
  VERY_WEAK = 0,
  WEAK = 1,
  FAIR = 2,
  STRONG = 3,
  VERY_STRONG = 4,
}

export const MINIMUM_PASSWORD_SCORE = PasswordStrengthScore.FAIR;

// ─── Brute-force / lockout ────────────────────────────────────────────────────

export enum LockoutPolicy {
  MAX_FAILED_ATTEMPTS = 5,
  LOCKOUT_MINUTES = 15,
}

// ─── Token TTL (seconds) ──────────────────────────────────────────────────────

export enum TokenTtlSeconds {
  ACCESS_TOKEN = 900, // 15 minutes
  REFRESH_TOKEN = 604_800, // 7 days
  CSRF_TOKEN = 86_400, // 24 hours
}

// ─── Session ──────────────────────────────────────────────────────────────────

export enum SessionPolicy {
  MAX_CONCURRENT = 5,
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

/** Throttle limits applied per route via @Throttle() */
export enum RateLimitPolicy {
  LOGIN_MAX = 10,
  LOGIN_TTL_MS = 900_000, // 15 min
  REGISTER_MAX = 5,
  REGISTER_TTL_MS = 3_600_000, // 1 hour
  REFRESH_MAX = 30,
  REFRESH_TTL_MS = 900_000,
}

// ─── HTTP methods that mutate state ───────────────────────────────────────────

export enum UnsafeHttpMethod {
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

// ─── PostgreSQL error codes ───────────────────────────────────────────────────

export enum PgErrorCode {
  UNIQUE_VIOLATION = '23505',
  FK_VIOLATION = '23503',
}

// ─── Log event keys ───────────────────────────────────────────────────────────

/** Structured log event identifiers for SIEM ingestion */
export enum LogEvent {
  // Auth
  REGISTER_ATTEMPT = 'AUTH_REGISTER_ATTEMPT',
  REGISTER_SUCCESS = 'AUTH_REGISTER_SUCCESS',
  REGISTER_DUPLICATE = 'AUTH_REGISTER_DUPLICATE_EMAIL',
  LOGIN_ATTEMPT = 'AUTH_LOGIN_ATTEMPT',
  LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS',
  LOGIN_INVALID_CREDS = 'AUTH_LOGIN_INVALID_CREDENTIALS',
  LOGIN_ACCOUNT_LOCKED = 'AUTH_LOGIN_ACCOUNT_LOCKED',
  LOGIN_INACTIVE_ACCOUNT = 'AUTH_LOGIN_INACTIVE_ACCOUNT',
  LOGOUT = 'AUTH_LOGOUT',
  LOGOUT_ALL = 'AUTH_LOGOUT_ALL',

  // Tokens
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REFRESH_REUSE = 'TOKEN_REFRESH_REUSE_DETECTED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',

  // Session
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SESSION_ALL_REVOKED = 'SESSION_ALL_REVOKED',
  SESSION_INVALID = 'SESSION_INVALID',

  // CSRF
  CSRF_MISSING = 'CSRF_TOKEN_MISSING',
  CSRF_INVALID = 'CSRF_TOKEN_INVALID',

  // Brute force
  FAILED_ATTEMPT_INC = 'AUTH_FAILED_ATTEMPT_INCREMENTED',
  ACCOUNT_LOCKED = 'AUTH_ACCOUNT_LOCKED',
  ACCOUNT_LOCK_CLEARED = 'AUTH_ACCOUNT_LOCK_CLEARED',

  // System
  DB_POOL_ERROR = 'DB_POOL_ERROR',
  STARTUP = 'APP_STARTUP',
}

// ─── Environment ─────────────────────────────────────────────────────────────

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

// ─── Metadata keys (used by decorators + reflector) ──────────────────────────

export enum MetadataKey {
  IS_PUBLIC = 'isPublic',
}
