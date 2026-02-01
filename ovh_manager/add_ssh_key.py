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

# Read SSH public key
with open('/home/bogum/.ssh/exoskull.pub') as f:
    ssh_key = f.read().strip()

print('Adding SSH key to VPS...')
print(f'Key: {ssh_key[:50]}...')

try:
    # Try to set SSH key via API
    result = client.post(f'/vps/{vps}/sshKeys', key=ssh_key)
    print(f'Success: {result}')
except Exception as e:
    print(f'Error: {e}')
    print()
    print('Alternative: Manual setup needed')
