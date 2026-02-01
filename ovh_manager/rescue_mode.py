#!/usr/bin/env python3
"""Enable rescue mode on VPS and add SSH key"""

import ovh
import json
import time

with open('ovh_credentials.json', 'r') as f:
    creds = json.load(f)

client = ovh.Client(
    endpoint=creds['endpoint'],
    application_key=creds['application_key'],
    application_secret=creds['application_secret'],
    consumer_key=creds['consumer_key']
)

VPS_NAME = "vps-147f7906.vps.ovh.net"

print("=" * 60)
print("RESCUE MODE - VPS")
print("=" * 60)

# Check current state
print("\n[1] Sprawdzam status VPS...")
try:
    vps = client.get(f'/vps/{VPS_NAME}')
    print(f"  Stan: {vps.get('state', 'unknown')}")
    print(f"  NetbootMode: {vps.get('netbootMode', 'unknown')}")
except Exception as e:
    print(f"  Error: {e}")

# Enable rescue mode
print("\n[2] Wlaczam tryb rescue...")
try:
    result = client.post(f'/vps/{VPS_NAME}/reboot')
    print(f"  Reboot requested: {result}")
except Exception as e:
    print(f"  Reboot error: {e}")

# Try to set netboot to rescue
print("\n[3] Ustawiam netboot na rescue...")
try:
    # First check available options
    options = client.get(f'/vps/{VPS_NAME}/option')
    print(f"  Dostepne opcje: {options}")
except Exception as e:
    print(f"  Options error: {e}")

try:
    result = client.put(f'/vps/{VPS_NAME}', netbootMode='rescue')
    print(f"  Netboot set to rescue: {result}")
except Exception as e:
    print(f"  Netboot error: {e}")

# Get rescue credentials
print("\n[4] Pobieram dane rescue...")
try:
    rescue = client.get(f'/vps/{VPS_NAME}/rescue')
    print(f"  Rescue info: {rescue}")
except Exception as e:
    print(f"  Rescue error: {e}")

print("\n" + "=" * 60)
print("Po restarcie w trybie rescue:")
print("1. Otrzymasz email z haslem do rescue")
print("2. Polacz sie: ssh root@57.128.253.15")
print("3. Zamontuj dysk: mount /dev/sda1 /mnt")
print("4. Dodaj klucz SSH:")
print("   echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC4TM4xIvot6jbmHi+VvRMl6Z9hMG7n43GCZpiWZ+hXg openclaw' >> /mnt/root/.ssh/authorized_keys")
print("5. Wyjdz z rescue i zrestartuj normalnie")
print("=" * 60)
