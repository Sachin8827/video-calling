FROM node:20-bookworm

# Install build dependencies for MediaSoup and native compilation
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-setuptools \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies with legacy peer deps
RUN npm install --legacy-peer-deps

# Copy the rest of the application files
COPY . .

# Run development command by default
CMD ["npm", "run", "start:dev"]
