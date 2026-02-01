import ovh
import json

with open('ovh_credentials.json') as f:
    c = json.load(f)

client = ovh.Client(
    endpoint='ovh-eu',
    application_key=c['application_key'],
    application_secret=c['application_secret'],
    consumer_key=c['consumer_key']
)

vps = c['vps_name']

print('Resetowanie hasla root...')
try:
    # Create a password reset task
    result = client.post(f'/vps/{vps}/resetPassword')
    print(f'Task created: {result}')
    print('Nowe haslo zostanie wyslane na email przypisany do konta.')
except Exception as e:
    print(f'Error: {e}')
    print()
    print('Probuje uzyskac dostep przez KVM/rescue...')
