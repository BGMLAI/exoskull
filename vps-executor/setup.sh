#!/bin/bash
# ExoSkull VPS Executor — Setup Script
# Run on a fresh DigitalOcean Ubuntu 24.04 droplet
#
# Usage:
#   1. Create droplet: doctl compute droplet create exoskull-executor \
#        --region fra1 --size s-1vcpu-2gb --image ubuntu-24-04-x64 \
#        --ssh-keys $(doctl compute ssh-key list --format ID --no-header)
#   2. SSH in: ssh root@<droplet-ip>
#   3. Clone repo and run: cd vps-executor && bash setup.sh
#
# Or automated:
#   scp -r vps-executor/ root@<ip>:/opt/exoskull-executor/
#   ssh root@<ip> "cd /opt/exoskull-executor && bash setup.sh"

set -euo pipefail

echo "=== ExoSkull VPS Executor Setup ==="

# 1. System updates
echo "[1/6] Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# 3. Install Node.js 22
echo "[3/6] Installing Node.js 22..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# 4. Build runner images
echo "[4/6] Building runner Docker images..."
docker build -t exoskull-runner-node:latest -f runners/node.Dockerfile runners/
docker build -t exoskull-runner-python:latest -f runners/python.Dockerfile runners/

# 5. Build executor server
echo "[5/6] Building executor server..."
npm install
npm run build

# 6. Setup systemd service
echo "[6/6] Setting up systemd service..."

# Generate secret if not set
if [ ! -f .env ]; then
  SECRET=$(openssl rand -hex 32)
  echo "VPS_EXECUTOR_SECRET=${SECRET}" > .env
  echo ""
  echo "=========================================="
  echo "  GENERATED SECRET (save this!):"
  echo "  ${SECRET}"
  echo "=========================================="
  echo ""
fi

# Load env
source .env

cat > /etc/systemd/system/exoskull-executor.service << EOF
[Unit]
Description=ExoSkull VPS Code Executor
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
User=root

# Resource limits
LimitNOFILE=65536
MemoryMax=1G

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable exoskull-executor
systemctl start exoskull-executor

echo ""
echo "=== Setup Complete ==="
echo "Executor running on port 3500"
echo "Status: systemctl status exoskull-executor"
echo "Logs:   journalctl -u exoskull-executor -f"
echo ""
echo "Add to ExoSkull .env:"
echo "  VPS_EXECUTOR_URL=http://<this-droplet-ip>:3500"
echo "  VPS_EXECUTOR_SECRET=${VPS_EXECUTOR_SECRET}"
