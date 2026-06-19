# Nexus Comms: Scalable Real-Time Video & Voice Platform

Nexus Comms is an enterprise-grade, highly scalable real-time voice and video communication platform. The stack features a secure NestJS backend, a Next.js 15 glassmorphic frontend, a MediaSoup SFU (Selective Forwarding Unit) media server, a Redis-backed FIFO queue matchmaking engine, and a PostgreSQL persistence layer with tamper-proof audit logging.

---

## 🚀 Key Architectural Features

### 1. Hybrid WebRTC Media Architecture (SFU + P2P)
*   **MediaSoup SFU**: High-performance multi-party group conferencing utilizing Node.js native bindings (GCC 12/Debian-Bookworm environment). Uses SFU architecture where participants send 1 stream and receive $N-1$ downstream feeds rather than a mesh network.
*   **1:1 P2P Fallback**: 1:1 calls fallback dynamically to secure, direct Peer-to-Peer connections, significantly reducing server bandwidth overhead.
*   **Coturn integration**: Integrated TURN/STUN relay server configuration for reliable NAT traversal and firewall bypass.

### 2. Atomic Matchmaking Queue (Omegle-Style)
*   **Redis FIFO**: Queue management uses atomic `LPUSH` and `LPOP` operations to pairing entrants.
*   **O(1) Cancellation**: Tracked via Redis hashes (`matchmaking:sockets`) for instantaneous queue exit upon user disconnection.
*   **Mutual Contact Handshake**: Enables anonymous matched users to request a contact save post-call. If both accept, a bidirectional friend connection is generated atomically in PostgreSQL.

### 3. Production-Grade Authentication & Session Security
*   **Argon2id Hashing**: High-entropy user password verification.
*   **Rotating Session Families**: Persistent JWT session tokens with automatic reuse detection. If a refresh token is reused, the entire session family is immediately invalidated to block token-theft attacks.
*   **Double-Submit CSRF Protection**: Enforced on all mutations via non-HttpOnly XSRF-TOKEN and custom validation headers.
*   **Brute-Force Protection**: Rolling IP and accounts rate limiting (using Throttler guards) alongside progressive user lockouts.

### 4. Code Standards & Observability
*   **Joi Validation**: Dynamic environment validation at startup. The platform crashes fast on boot if config parameters are missing or invalid.
*   **Swagger API Documentation**: Automated interactive endpoint specification visible at `/api/docs` in dev.
*   **Structured Audit Logger**: Immutable, append-only PostgreSQL logging module capturing 20+ user/comms lifecycle event types.
*   **Pre-commit Verification**: Strict ESLint rules, Prettier formatting, and Husky hooks ensuring only clean code is committed.

---

## 📁 System Topology & Code Structure

```
├── src/
│   ├── auth/                  # JWT auth, strategies, guards, cookies, decorators
│   ├── users/                 # User management, passwords (Argon2id), accounts lockouts
│   ├── sessions/              # Token family generation, rotating refresh tokens
│   ├── database/              # Raw Postgres PG Pool integration and migrations
│   ├── redis/                 # Global ioredis instance for matchmaking and Pub/Sub
│   ├── audit/                 # Append-only immutable log recorder (20+ event types)
│   ├── calls/                 # Call records, session metrics, active participant tables
│   ├── contacts/              # Handshake-based contacts save flow (REST & Gateway)
│   ├── matchmaking/           # Redis FIFO anonymous pairing implementation
│   ├── sfu/                   # MediaSoup SFU room creator, transport hooks, WebRtc configuration
│   ├── gateway/               # Socket.IO signaling hub orchestrating calls & WebRTC SDPs
│   ├── common/                # Exception filters, validation pipes, response interceptors
│   ├── config/                # Strong typed auth parameters
│   ├── main.ts                # App bootstrapper (Helmet, CORS, Swagger, CookieParser)
│   └── app.module.ts          # Root module incorporating Joi env schema validation
│
├── frontend/                  # Next.js 15 client dashboard & call views
│   ├── src/app/               # App router (dashboard, call rooms, match queue page)
│   ├── src/components/        # Glassmorphic layout tiles, grids, call overlays
│   ├── src/hooks/             # Custom triggers: useWebRTC, useSFU, useMediaDevices, useSignaling
│   └── src/lib/               # Axios, cookies, and socket.io socket connections
│
├── infra/
│   ├── coturn/                # TURN server configs (UDP/TCP relays)
│   ├── nginx/                 # Nginx proxy mapping HTTP to Next.js and WebSockets to NestJS
│   └── postgres/              # SQL setup schemas
```

---

## ⚙️ Environment Configurations

Create a `.env` file at the root. The Joi schema verifies the following:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `JWT_SECRET` | **Yes** | — | 32+ character key for JWT signing |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Lifetime of access tokens |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Lifetime of refresh tokens |
| `ALLOWED_ORIGIN` | No | `http://localhost:3001` | CORS permitted domain |
| `PORT` | No | `3000` | NestJS port |
| `MEDIASOUP_MIN_PORT` | No | `40000` | Start of MediaSoup media UDP range |
| `MEDIASOUP_MAX_PORT` | No | `49999` | End of MediaSoup media UDP range |
| `MEDIASOUP_LISTEN_IP` | No | `0.0.0.0` | IP MediaSoup binds to locally |
| `MEDIASOUP_ANNOUNCED_IP`| No | `127.0.0.1` | Public VPS IP announced to WebRTC clients |
| `TURN_SERVER_URL` | No | — | Coturn endpoint |
| `TURN_USERNAME` | No | — | Coturn authentication user |
| `TURN_CREDENTIAL` | No | — | Coturn authentication secret |
| `AUDIT_RETENTION_DAYS` | No | `90` | Period of audit logs retention |

---

## 🛠️ Installation & Setup

### Option A: Complete Docker Deployment (Recommended)
Bootstraps NestJS, Next.js, Postgres, Redis, Coturn, and Nginx. MediaSoup compiles inside the GCC 12 container environment automatically.

```bash
# 1. Fill environment variables
cp .env.example .env

# 2. Run the multi-container stack
docker-compose up --build -d

# 3. Apply SQL migrations inside postgres container
docker-compose exec -T postgres psql -U postgres -d nexus < src/database/migrations/001_create_auth_tables.sql
docker-compose exec -T postgres psql -U postgres -d nexus < src/database/migrations/002_create_comms_tables.sql
```

The application is now accessible at `http://localhost:3001/` (proxied through Nginx).

### Option B: Local Development
Ensure Postgres and Redis are running locally.

```bash
# 1. Install workspace dependencies
npm install

# 2. Apply DB migrations
psql $DATABASE_URL -f src/database/migrations/001_create_auth_tables.sql
psql $DATABASE_URL -f src/database/migrations/002_create_comms_tables.sql

# 3. Spin up NestJS server
npm run start:dev

# 4. Spin up Next.js client
cd frontend
npm install
npm run dev
```

---

## 📡 WebSocket Event Reference (Signaling Gateway)

Namespace: `/signal`

### 1:1 Calls
*   `call:initiate` (emit): Start a call. Body: `{ targetUserId: string, callType: 'voice' | 'video' }`.
*   `call:incoming` (listener): Notify receiver of incoming call request.
*   `call:accept` (emit): Callee answers call. Body: `{ callId: string, callType: 'voice' | 'video' }`.
*   `call:accepted` (listener): Notify caller that callee accepted.
*   `call:reject` (emit): Callee declines call. Body: `{ callId: string }`.
*   `call:end` (emit): Terminate an active call. Body: `{ callId: string }`.
*   `call:ended` (listener): Notify peer that call ended.
*   `signal:offer` / `signal:answer` / `signal:ice` (emit/listener): Relays ICE parameters and SDP configurations.

### Matchmaking Queue
*   `match:join-queue` (emit): Add socket to matchmaking list. Body: `{ preferredType: 'voice' | 'video' }`.
*   `match:queued` (listener): Receives queue depth position.
*   `match:found` (listener): Fired when a pair matches. Payload: `{ callId: string, callType: 'voice' | 'video', isInitiator: boolean, bothRegistered: boolean, partnerUserId?: string }`.
*   `match:leave-queue` (emit): Cancel queuing manually.

### MediaSoup Group Rooms (SFU)
*   `sfu:join` (emit): Joins MediaSoup room. Body: `{ roomId: string }`. Returns `routerRtpCapabilities`.
*   `sfu:create-transport` (emit): Request WebRtcTransport params.
*   `sfu:connect-transport` (emit): Link transport with client DTLS parameters.
*   `sfu:produce` (emit): Upload audio/video feed stream.
*   `sfu:consume` (emit): Request downstream feeds.
*   `sfu:new-producer` (listener): Notify room of a new media producer.

### Contacts Handshake
*   `contact:request-save` (emit): Ask to add user to contacts lists. Body: `{ callId: string, toUserId: string }`.
*   `contact:save-request` (listener): Received by destination user.

---

## 🛡️ API Endpoints Reference

| Method | Path | Authentication | Description |
|---|---|---|---|
| **POST** | `/api/v1/auth/register` | Public | Sign up user account |
| **POST** | `/api/v1/auth/login` | Public | Authenticates and drops cookies |
| **POST** | `/api/v1/auth/refresh` | Public (Refresh Cookie) | Issues new token family set |
| **POST** | `/api/v1/auth/logout` | JWT Bearer | Revokes current session tokens |
| **DELETE**| `/api/v1/auth/sessions` | JWT Bearer | Invalidates all active session keys |
| **GET** | `/api/v1/calls/history` | JWT Bearer | Fetches user's paginated call records |
| **GET** | `/api/v1/calls/:callId` | JWT Bearer | Details of specific call session |
| **GET** | `/api/v1/contacts` | JWT Bearer | Lists all added user contacts |
| **POST** | `/api/v1/contacts/accept` | JWT Bearer | Accepting a mutual handshake request |
| **POST** | `/api/v1/contacts/reject/:id`| JWT Bearer | Rejects a pending contact request |
| **PATCH** | `/api/v1/contacts/:id/nickname`| JWT Bearer | Customizes a contact nickname |
| **DELETE**| `/api/v1/contacts/:id` | JWT Bearer | Removes target user from contacts list |
