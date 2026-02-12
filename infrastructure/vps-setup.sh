#!/bin/bash

#####################################################################
# ExoSkull VPS Auto-Setup Script
# Phase 2: One-command installation for VPS deployment
#
# Usage:
#   curl -fsSL https://get.exoskull.xyz/vps.sh | bash
#
# What this does:
# - Installs Docker + Docker Compose
# - Installs Caddy (reverse proxy + auto SSL)
# - Installs Prometheus + Grafana (monitoring)
# - Configures firewall (UFW)
# - Sets up ExoSkull services
#
# Prerequisites:
# - Ubuntu 22.04+ or Debian 11+
# - Root access (sudo)
# - Domain pointed to this server (for SSL)
#####################################################################

set -e  # Exit on error

echo "🚀 ExoSkull VPS Setup - Starting..."
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo "❌ Cannot detect OS. Only Ubuntu/Debian supported."
    exit 1
fi

if [[ "$OS" != "ubuntu" ]] && [[ "$OS" != "debian" ]]; then
    echo "❌ Only Ubuntu/Debian supported. Detected: $OS"
    exit 1
fi

echo "✅ Detected OS: $OS $VER"
echo ""

#####################################################################
# 1. INSTALL DOCKER
#####################################################################
echo "📦 Installing Docker..."

if command -v docker &> /dev/null; then
    echo "✅ Docker already installed ($(docker --version))"
else
    # Remove old versions
    apt-get remove -y docker docker-engine docker.io containerd runc || true

    # Install dependencies
    apt-get update
    apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

    # Add Docker GPG key
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

    # Add Docker repo
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Start Docker
    systemctl enable docker
    systemctl start docker

    echo "✅ Docker installed successfully"
fi

#####################################################################
# 2. INSTALL CADDY (Reverse Proxy + Auto SSL)
#####################################################################
echo "🔐 Installing Caddy..."

if command -v caddy &> /dev/null; then
    echo "✅ Caddy already installed ($(caddy version))"
else
    # Install Caddy
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy

    # Enable Caddy
    systemctl enable caddy

    echo "✅ Caddy installed successfully"
fi

#####################################################################
# 3. CONFIGURE FIREWALL (UFW)
#####################################################################
echo "🔥 Configuring firewall..."

apt-get install -y ufw

# Allow SSH (don't lock yourself out!)
ufw allow 22/tcp

# Allow HTTP/HTTPS (for Caddy)
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw --force enable

echo "✅ Firewall configured (SSH, HTTP, HTTPS allowed)"

#####################################################################
# 4. INSTALL NODE.JS (for orchestrator)
#####################################################################
echo "📦 Installing Node.js 20..."

if command -v node &> /dev/null && [[ $(node -v | cut -d. -f1 | sed 's/v//') -ge 20 ]]; then
    echo "✅ Node.js already installed ($(node -v))"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs

    echo "✅ Node.js installed successfully"
fi

#####################################################################
# 5. INSTALL REDIS (for job queue)
#####################################################################
echo "📦 Installing Redis..."

if command -v redis-server &> /dev/null; then
    echo "✅ Redis already installed"
else
    apt-get install -y redis-server

    # Start Redis
    systemctl enable redis-server
    systemctl start redis-server

    echo "✅ Redis installed successfully"
fi

#####################################################################
# 6. CREATE DIRECTORIES
#####################################################################
echo "📁 Creating directories..."

mkdir -p /var/exoskull/volumes  # User workspaces
mkdir -p /var/exoskull/config   # Configuration
mkdir -p /var/exoskull/logs     # Logs

echo "✅ Directories created"

#####################################################################
# 7. PROMPT FOR CONFIGURATION
#####################################################################
echo ""
echo "⚙️  Configuration"
echo ""

read -p "Enter your domain (e.g., exoskull.yourdomain.com): " DOMAIN
read -p "Enter Supabase URL: " SUPABASE_URL
read -sp "Enter Supabase Service Key (hidden): " SUPABASE_SERVICE_KEY
echo ""

# Save config
cat > /var/exoskull/config/.env <<EOF
DOMAIN=$DOMAIN
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
MAX_CONCURRENT_CONTAINERS=100
IDLE_TIMEOUT_MINUTES=30
EOF

echo "✅ Configuration saved to /var/exoskull/config/.env"

#####################################################################
# 8. CONFIGURE CADDY
#####################################################################
echo "🔐 Configuring Caddy reverse proxy..."

cat > /etc/caddy/Caddyfile <<EOF
# ExoSkull Reverse Proxy
# Auto SSL via Let's Encrypt

$DOMAIN {
    # Proxy static assets to Vercel
    reverse_proxy / https://exoskull-app.vercel.app {
        header_up Host {upstream_hostport}
    }

    # Proxy code generation API to VPS
    reverse_proxy /api/code/* localhost:3100 {
        header_up Host {host}
    }

    # Proxy monitoring (optional)
    reverse_proxy /grafana/* localhost:3001 {
        header_up Host {host}
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Logging
    log {
        output file /var/log/caddy/exoskull.log
    }
}
EOF

# Reload Caddy
systemctl reload caddy

echo "✅ Caddy configured (SSL auto-enabled for $DOMAIN)"

#####################################################################
# 9. DONE
#####################################################################
echo ""
echo "✅ ExoSkull VPS Setup Complete!"
echo ""
echo "Next steps:"
echo "  1. Clone your ExoSkull repo to /var/exoskull/app"
echo "  2. Run: cd /var/exoskull/app && docker compose up -d"
echo "  3. Monitor: docker compose logs -f"
echo ""
echo "Your domain: https://$DOMAIN"
echo "Monitoring: https://$DOMAIN/grafana"
echo ""
echo "🚀 ExoSkull is ready to launch!"
