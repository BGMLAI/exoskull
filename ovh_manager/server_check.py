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

print('='*60)
print('SERVER INFO')
print('='*60)

# IP details
print('\nIPs assigned to VPS:')
ips = client.get(f'/vps/{vps}/ips')
for ip in ips:
    ip_data = client.get(f'/vps/{vps}/ips/{ip}')
    print(f'  {ip}')
    print(f'    Type: {ip_data.get("type")}')
    print(f'    Version: IPv{ip_data.get("version")}')
    if ip_data.get('reverse'):
        print(f'    Reverse: {ip_data.get("reverse")}')

# Snapshots
print('\nSnapshots:')
try:
    snapshots = client.get(f'/vps/{vps}/snapshot')
    if snapshots:
        print(f'  Description: {snapshots.get("description")}')
        print(f'  Creation: {snapshots.get("creationDate")}')
    else:
        print('  No snapshots')
except:
    print('  No snapshots available')

# Automated backup
print('\nAutomated Backup:')
try:
    backup = client.get(f'/vps/{vps}/automatedBackup')
    print(f'  State: {backup.get("state")}')
    print(f'  Schedule: {backup.get("schedule")}')
except:
    print('  Not configured')

print('\n' + '='*60)
print('OPENCLAW FIX INSTRUCTIONS')
print('='*60)
print('''
1. SSH to your server:
   ssh root@57.128.253.15
   (or ssh root@exoskull.xyz)

2. Check if OpenClaw is installed:
   which openclaw
   openclaw --version

3. If installed, check status:
   openclaw health
   openclaw doctor

4. If not running, start gateway:
   openclaw gateway --port 443
   
   OR as service:
   openclaw gateway --service install
   openclaw gateway --service start

5. If not installed, install it:
   npm install -g openclaw
   openclaw setup
   openclaw configure

6. Configure OpenClaw:
   - gateway.mode: remote
   - gateway.remote.url: wss://exoskull.xyz
''')
