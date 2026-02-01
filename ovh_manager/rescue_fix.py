#!/usr/bin/env python3
"""
Włączenie rescue mode i naprawa SSH
"""

import ovh
import json
import time

with open('ovh_credentials.json') as f:
    c = json.load(f)

client = ovh.Client(
    endpoint='ovh-eu',
    application_key=c['application_key'],
    application_secret=c['application_secret'],
    consumer_key=c['consumer_key']
)

vps = c['vps_name']

print('='*60)
print('RESCUE MODE - NAPRAWA SSH')
print('='*60)
print(f'VPS: {vps}')
print()

# Sprawdź dostępne metody
print('Sprawdzam dostępne operacje...')
try:
    # Pobierz info o VPS
    info = client.get(f'/vps/{vps}')
    print(f"Model: {info.get('model')}")
    print(f"Strefa: {info.get('zone')}")
    print(f"Stan: {info.get('state')}")
    print()
    
    # Spróbuj włączyć rescue
    print('Próbuję włączyć rescue mode...')
    try:
        # Dla starszych VPS może być inny endpoint
        result = client.post(f'/vps/{vps}/rescue', {
            'type': 'linux'
        })
        print(f'Rescue włączony!')
        print(f'Hasło: {result.get("password")}')
        print(f'Instrukcje: {result.get("instructions")}')
        
        # Zrestartuj do rescue
        print()
        print('Restartowanie do rescue mode...')
        client.post(f'/vps/{vps}/rescue/reboot')
        print('VPS restartuje się do rescue mode...')
        print('Czekaj 2-3 minuty na start.')
        print()
        print(f'Połącz się: ssh root@{c["vps_name"]}')
        print(f'Hasło: (powyżej)')
        
    except Exception as e:
        print(f'Błąd rescue: {e}')
        print()
        print('ALTERNATYWA:')
        print('1. Wejdź na https://www.ovh.com/manager/')
        print('2. VPS -> Twój VPS -> Boot (Rescue mode)')
        print('3. Włącz rescue i zrestartuj')
        
except Exception as e:
    print(f'Błąd: {e}')
