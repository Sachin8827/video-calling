#!/bin/bash

# ==============================================================================
# Oracle Cloud Ubuntu 22.04 ARM Deployment Script
# This script installs Docker, clones the repository (if not present),
# configures the environment, and boots the platform.
# ==============================================================================

set -e # Exit immediately if a command exits with a non-zero status.

echo "==============================================="
echo " Starting Platform Deployment on Oracle Cloud "
echo "==============================================="

# 1. System Update
echo "[1/6] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. Install Docker & Docker Compose
echo "[2/6] Installing Docker & Docker Compose..."
if ! command -v docker &> /dev/null; then
    sudo apt-get install -y ca-certificates curl gnupg lsb-release git
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-compose
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker $USER
    echo "Docker installed successfully."
else
    echo "Docker is already installed. Skipping."
fi

# 3. Setup Project Directory
echo "[3/6] Setting up project directory..."
PROJECT_DIR="$HOME/auth-module"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Project directory not found at $PROJECT_DIR."
    echo "Please clone your repository first, e.g.:"
    echo "git clone <YOUR_REPO_URL> $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# 4. Environment Configuration
echo "[4/6] Configuring Environment Variables..."

PUBLIC_IP=$(curl -s ifconfig.me)
echo "Detected Public IP: $PUBLIC_IP"

if [ ! -f .env ]; then
    cp .env.example .env
    
    # Generate secure random secrets
    JWT_SECRET=$(openssl rand -hex 32)
    TURN_SECRET=$(openssl rand -hex 16)
    
    # Replace default secrets in .env
    sed -i "s/CHANGE_ME_MINIMUM_64_CHARS_RANDOM_HEX_STRING_NEVER_COMMIT_THIS/$JWT_SECRET/g" .env
    sed -i "s/TURN_CREDENTIAL=/TURN_CREDENTIAL=$TURN_SECRET/g" .env
    
    echo ".env created with secure defaults."
fi

# Dynamically set the MEDIASOUP_ANNOUNCED_IP to the Oracle Public IP
sed -i "s/^MEDIASOUP_ANNOUNCED_IP=.*/MEDIASOUP_ANNOUNCED_IP=$PUBLIC_IP/g" .env

# Set TURN configuration
sed -i "s/^TURN_SERVER_URL=.*/TURN_SERVER_URL=turn:$PUBLIC_IP:3478/g" .env

echo "Environment configured for $PUBLIC_IP."

# 5. Open Iptables (Ubuntu specific firewall rules)
# Note: You still MUST open the VCN ingress rules in the Oracle Cloud Console!
echo "[5/6] Opening local firewall ports..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
sudo iptables -I INPUT -p tcp --dport 3478 -j ACCEPT || true
sudo iptables -I INPUT -p udp --dport 3478 -j ACCEPT || true
sudo iptables -I INPUT -p tcp --dport 5349 -j ACCEPT || true
sudo iptables -I INPUT -p udp --dport 5349 -j ACCEPT || true
sudo iptables -I INPUT -p udp --dport 40000:49999 -j ACCEPT || true
sudo netfilter-persistent save || true

# 6. Boot the Stack
echo "[6/6] Building and starting the Docker stack..."
# Ensure the ports are standard internal Docker ports, as fixed previously
docker-compose up -d --build

echo "==============================================="
echo " Deployment Complete! "
echo "==============================================="
echo "Your app should soon be available at: http://$PUBLIC_IP:3001"
echo "API running at: http://$PUBLIC_IP:3000"
echo "Remember to open the ports in your Oracle Cloud VCN Security List!"
