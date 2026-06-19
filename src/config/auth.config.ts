import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
  },
  argon2: {
    memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 65536),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
  },
  rateLimit: {
    ttlSeconds: Number(process.env.RATE_LIMIT_TTL ?? 900),
    maxPerIp: Number(process.env.RATE_LIMIT_MAX_PER_IP ?? 20),
    maxPerAccount: Number(process.env.RATE_LIMIT_MAX_PER_ACCOUNT ?? 5),
  },
  csrf: {
    expiryHours: Number(process.env.CSRF_TOKEN_EXPIRY_HOURS ?? 24),
  },
  session: {
    maxConcurrent: Number(process.env.SESSION_MAX_CONCURRENT ?? 5),
  },
}));
