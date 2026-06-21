-- ============================================================
-- Migration 002: Communications Platform Tables
-- Extends auth-module with calls, contacts, audit, matchmaking
-- ============================================================

-- ── Call Sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id     UUID                 REFERENCES users(id) ON DELETE SET NULL,
  call_type        VARCHAR(10) NOT NULL CHECK (call_type IN ('voice', 'video', 'group')),
  status           VARCHAR(20) NOT NULL DEFAULT 'initiated'
                               CHECK (status IN ('initiated', 'active', 'ended', 'missed', 'rejected')),
  is_anonymous     BOOLEAN     NOT NULL DEFAULT FALSE,
  room_id          VARCHAR(64),          -- group call room identifier
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER     GENERATED ALWAYS AS (
                     EXTRACT(EPOCH FROM (ended_at - answered_at))::INTEGER
                   ) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_sessions_initiator  ON call_sessions(initiator_id);
CREATE INDEX idx_call_sessions_status     ON call_sessions(status);
CREATE INDEX idx_call_sessions_started_at ON call_sessions(started_at DESC);

-- ── Call Participants ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_participants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID        NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL, -- NULL for anonymous
  anonymous_id    VARCHAR(36),   -- ephemeral ID for non-registered users
  role            VARCHAR(10) NOT NULL DEFAULT 'guest' CHECK (role IN ('host', 'guest')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at         TIMESTAMPTZ,
  mic_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  camera_enabled  BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_call_participants_session ON call_participants(call_session_id);
CREATE INDEX idx_call_participants_user    ON call_participants(user_id);

-- ── Contacts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname        VARCHAR(100),
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, contact_user_id)
);

CREATE INDEX idx_contacts_owner ON contacts(owner_id);

-- ── Matchmaking Queue ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES users(id) ON DELETE CASCADE, -- NULL for anonymous
  anonymous_id   VARCHAR(36),
  socket_id      VARCHAR(100) NOT NULL,
  preferred_type VARCHAR(10) NOT NULL DEFAULT 'video' CHECK (preferred_type IN ('voice', 'video')),
  is_anonymous   BOOLEAN     NOT NULL DEFAULT FALSE,
  queued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matchmaking_queued_at ON matchmaking_queue(queued_at ASC);

-- ── Audit Log (append-only — no UPDATE/DELETE) ────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id VARCHAR(36),
  event_type   VARCHAR(60) NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  ip_address   INET,
  user_agent   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id     ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type  ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs(occurred_at DESC);

-- Revoke UPDATE/DELETE on audit_logs for the app user
-- (Run as superuser during setup; replace 'app_user' with your DB role)
-- REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- ── Contact Save Requests (handshake for both to agree) ───────
CREATE TABLE IF NOT EXISTS contact_save_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID        NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  from_user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  UNIQUE(call_session_id, from_user_id, to_user_id)
);
