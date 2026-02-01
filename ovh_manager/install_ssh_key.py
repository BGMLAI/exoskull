import ovh
import json
import sys

with open('ovh_credentials.json') as f:
    c = json.load(f)

client = ovh.Client(
    endpoint='ovh-eu',
    application_key=c['application_key'],
    application_secret=c['application_secret'],
    consumer_key=c['consumer_key']
)

vps = c['vps_name']

# Klucz SSH do dodania
ssh_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC4TM4xIvot6jbmHi+VvRMl6Z9hMG7n43GCZpiWZ+hXg openclaw"

print('='*60)
print('DODAWANIE KLUCZA SSH DO VPS')
print('='*60)
print(f'VPS: {vps}')
print(f'Klucz: {ssh_key[:50]}...')
print()

# Proba dodania przez rozne endpointy
endpoints_to_try = [
    f'/vps/{vps}/sshKeys',
    f'/vps/{vps}/openSshKeys', 
]

for endpoint in endpoints_to_try:
    print(f'Probuje: {endpoint}')
    try:
        result = client.post(endpoint, key=ssh_key)
        print(f'SUKCES! {result}')
        sys.exit(0)
    except Exception as e:
        print(f'  Blad: {e}')
        print()

print('Nie udalo sie przez API.')
print('MUSISZ dodac klucz recznie przez panel OVH:')
print('1. https://www.ovh.com/manager/')
print('2. VPS -> Twoj VPS -> Klucze SSH')
print('3. Wklej klucz:')
print(ssh_key)
