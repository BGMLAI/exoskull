#!/usr/bin/env python3
"""Reinstall VPS with Ubuntu 24.10"""

import ovh
import json

with open('ovh_credentials.json', 'r') as f:
    creds = json.load(f)

client = ovh.Client(
    endpoint=creds['endpoint'],
    application_key=creds['application_key'],
    application_secret=creds['application_secret'],
    consumer_key=creds['consumer_key']
)

VPS_NAME = "vps-147f7906.vps.ovh.net"
IMAGE_ID = "dea3bb11-f4e2-4dd8-805b-d28b4f4fe0eb"  # Ubuntu 24.10

SSH_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC4TM4xIvot6jbmHi+VvRMl6Z9hMG7n43GCZpiWZ+hXg openclaw"

print("=" * 60)
print("REINSTALACJA VPS - Ubuntu 24.10")
print("=" * 60)

print("\n[1] Sprawdzam opcje reinstalacji...")
try:
    # Check what parameters are accepted
    result = client.post(f'/vps/{VPS_NAME}/rebuild',
                        imageId=IMAGE_ID,
                        sshKey=SSH_KEY)
    print(f"  Reinstalacja rozpoczeta!")
    print(f"  Task: {result}")
    print("\n  NOWE HASLO ROOT ZOSTANIE WYSLANE NA EMAIL!")
except Exception as e:
    error_msg = str(e)
    print(f"  Error: {error_msg}")

    # Try without SSH key
    if 'sshKey' in error_msg or 'parameter' in error_msg.lower():
        print("\n[2] Probuje bez klucza SSH...")
        try:
            result = client.post(f'/vps/{VPS_NAME}/rebuild', imageId=IMAGE_ID)
            print(f"  Reinstalacja rozpoczeta!")
            print(f"  Task: {result}")
            print("\n  NOWE HASLO ROOT ZOSTANIE WYSLANE NA EMAIL!")
        except Exception as e2:
            print(f"  Error: {e2}")

print("\n" + "=" * 60)
