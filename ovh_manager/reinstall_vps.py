#!/usr/bin/env python3
"""Reinstall VPS with fresh OS"""

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

print("=" * 60)
print("REINSTALACJA VPS")
print("=" * 60)

# Get available images
print("\n[1] Dostepne systemy operacyjne:")
try:
    images = client.get(f'/vps/{VPS_NAME}/images/available')
    for i, img in enumerate(images[:15]):
        print(f"  {i+1}. {img}")
except Exception as e:
    print(f"  Error: {e}")

# Get current image
print("\n[2] Aktualny system:")
try:
    current = client.get(f'/vps/{VPS_NAME}/images/current')
    print(f"  {current}")
except Exception as e:
    print(f"  Error: {e}")

print("\n" + "=" * 60)
print("Aby reinstalowac, uzyj:")
print("  client.post(f'/vps/{VPS_NAME}/rebuild', imageId='IMAGE_ID')")
print("=" * 60)
