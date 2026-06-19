-- =============================================================================
-- Auth Module — PostgreSQL Schema
-- Migration: 001_create_auth_tables.sql
-- Run: psql $DATABASE_URL -f src/database/migrations/001_create_auth_tables.sql
-- =============================================================================

BEGIN;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT        NOT NULL UNIQUE,
  password_hash    TEXT        NOT NULL,
  mfa_enabled      BOOLEAN     NOT NULL DEFAULT false,
  failed_attempts  INT         NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ─── Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address   TEXT        NOT NULL,
  user_agent   TEXT        NOT NULL,
  is_revoked   BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id  ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON sessions (expires_at);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
-- Raw token is NEVER stored. Only SHA-256(token) is persisted.
-- family_id groups all rotations of the same session for reuse detection.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL UNIQUE,
  family_id    UUID        NOT NULL,
  is_used      BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_rt_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_family_id  ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_rt_session_id ON refresh_tokens (session_id);

-- ─── CSRF Tokens ──────────────────────────────────────────────────────────────
-- One row per session. Raw token sent in XSRF-TOKEN cookie (not HttpOnly).
-- Server validates SHA-256(incomingHeader) against stored token_hash.
CREATE TABLE IF NOT EXISTS csrf_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_csrf_session_id ON csrf_tokens (session_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Cleanup job (run via pg_cron or a cron job) ──────────────────────────────
-- DELETE FROM sessions       WHERE expires_at < now();
-- DELETE FROM refresh_tokens WHERE expires_at < now();
-- DELETE FROM csrf_tokens    WHERE expires_at < now();

COMMIT;
