# ── STAGE 1: Builder ──
FROM node:20-bookworm AS builder

# Install heavy C++ compilers for MediaSoup
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-setuptools \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
# Install ALL dependencies (including MediaSoup C++ workers)
RUN npm install --legacy-peer-deps
COPY . .
# Build the NestJS app (compiles TypeScript to dist/)
RUN npm run build


# ── STAGE 2: Production Runtime ──
# Use 'slim' version which is 800MB smaller than standard bookworm
FROM node:20-bookworm-slim 

WORKDIR /app

# Only copy what's absolutely necessary from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Optional: MediaSoup runtime dependencies (much smaller than build tools)
RUN apt-get update && apt-get install -y net-tools iproute2 && rm -rf /var/lib/apt/lists/*

# Run production command
CMD ["npm", "run", "start:prod"]
