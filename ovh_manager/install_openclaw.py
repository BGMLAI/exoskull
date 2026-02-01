#!/usr/bin/env python3
import paramiko
import sys

HOST = "57.128.253.15"
USER = "ubuntu"
PASSWORD = "OpenClaw2026!"
SSH_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC4TM4xIvot6jbmHi+VvRMl6Z9hMG7n43GCZpiWZ+hXg openclaw"

def run(ssh, cmd, timeout=180):
    print(f"\n$ {cmd[:80]}...")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out:
        lines = out.strip().split('\n')
        for line in lines[:15]:
            print(f"  {line[:100]}")
        if len(lines) > 15:
            print(f"  ... ({len(lines)} lines total)")
    if err and 'warning' not in err.lower() and 'sudo' not in err.lower():
        print(f"  [err] {err[:150]}")
    return out

print("=" * 60)
print("INSTALACJA OPENCLAW - Ubuntu 22.04")
print("=" * 60)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
print("POLACZONO!")

# SSH key
print("\n[1] Klucz SSH...")
run(ssh, "mkdir -p ~/.ssh && chmod 700 ~/.ssh")
run(ssh, f"echo '{SSH_KEY}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys")
run(ssh, f"echo '{PASSWORD}' | sudo -S bash -c 'mkdir -p /root/.ssh; echo \"{SSH_KEY}\" >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys'")

# Update
print("\n[2] Aktualizacja systemu...")
run(ssh, f"echo '{PASSWORD}' | sudo -S apt-get update -qq", timeout=120)
run(ssh, f"echo '{PASSWORD}' | sudo -S apt-get install -y curl wget git ca-certificates gnupg", timeout=180)

# Node.js 20
print("\n[3] Node.js 20...")
run(ssh, f"echo '{PASSWORD}' | sudo -S mkdir -p /etc/apt/keyrings")
run(ssh, f"curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes")
run(ssh, f"echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main' | sudo tee /etc/apt/sources.list.d/nodesource.list")
run(ssh, f"echo '{PASSWORD}' | sudo -S apt-get update -qq", timeout=120)
run(ssh, f"echo '{PASSWORD}' | sudo -S apt-get install -y nodejs", timeout=180)
run(ssh, "node --version && npm --version")

# OpenClaw
print("\n[4] OpenClaw...")
run(ssh, f"echo '{PASSWORD}' | sudo -S npm install -g openclaw", timeout=300)
out = run(ssh, "which openclaw && openclaw --version")

if 'openclaw' not in out:
    print("OpenClaw nie zainstalowany - probuje alternatywnie...")
    run(ssh, f"echo '{PASSWORD}' | sudo -S npm install -g @anthropic/openclaw", timeout=300)

# Setup
print("\n[5] Konfiguracja...")
run(ssh, f"echo '{PASSWORD}' | sudo -S openclaw setup 2>/dev/null || echo 'setup skipped'")
run(ssh, f"echo '{PASSWORD}' | sudo -S openclaw config set gateway.mode local 2>/dev/null || true")
run(ssh, f"echo '{PASSWORD}' | sudo -S openclaw config set gateway.port 443 2>/dev/null || true")
run(ssh, f"echo '{PASSWORD}' | sudo -S openclaw config set gateway.bind 0.0.0.0 2>/dev/null || true")

# Systemd service
print("\n[6] Usluga systemowa...")
service = """[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/openclaw gateway --port 443
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target"""

run(ssh, f"echo '{PASSWORD}' | sudo -S bash -c 'echo \"{service}\" > /etc/systemd/system/openclaw.service'")
run(ssh, f"echo '{PASSWORD}' | sudo -S systemctl daemon-reload")
run(ssh, f"echo '{PASSWORD}' | sudo -S systemctl enable openclaw 2>/dev/null || true")
run(ssh, f"echo '{PASSWORD}' | sudo -S systemctl start openclaw 2>/dev/null || true")

# Status
print("\n[7] Status...")
run(ssh, f"echo '{PASSWORD}' | sudo -S systemctl status openclaw --no-pager 2>/dev/null | head -10 || echo 'status unavailable'")
run(ssh, f"echo '{PASSWORD}' | sudo -S ss -tlnp | grep LISTEN")
run(ssh, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:443 2>/dev/null || echo 'no response'")

ssh.close()
print("\n" + "=" * 60)
print("GOTOWE!")
print("=" * 60)
