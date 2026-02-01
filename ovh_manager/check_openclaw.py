import ovh
import json
import socket

with open('ovh_credentials.json') as f:
    c = json.load(f)

# Check exoskull.xyz DNS
print('='*60)
print('Checking exoskull.xyz...')
print('='*60)

try:
    ip = socket.gethostbyname('exoskull.xyz')
    print(f'DNS resolved to: {ip}')
except:
    print('DNS resolution failed')

print()

# Check VPS details
client = ovh.Client(
    endpoint='ovh-eu',
    application_key=c['application_key'],
    application_secret=c['application_secret'],
    consumer_key=c['consumer_key']
)

vps = c['vps_name']
print('Recent VPS tasks:')
try:
    tasks = client.get(f'/vps/{vps}/tasks')
    for task_id in tasks[:5]:
        task = client.get(f'/vps/{vps}/tasks/{task_id}')
        print(f'  - {task.get("type")}: {task.get("state")}')
except Exception as e:
    print(f'  Error: {e}')

print()
print('Resource usage:')
try:
    use = client.get(f'/vps/{vps}/use')
    cpu = use.get('cpu', {}).get('current', 0)
    ram = use.get('ram', {}).get('current', 0)
    print(f'  CPU: {cpu}%')
    print(f'  RAM: {ram}%')
except Exception as e:
    print(f'  Error: {e}')

print()
print('='*60)
print('OpenClaw Gateway check:')
print('='*60)
print('VPS IP: 57.128.253.15')
print('exoskull.xyz should point to this IP')
print()
print('To fix OpenClaw, you need to:')
print('1. SSH to: 57.128.253.15')
print('2. Check if OpenClaw service is running')
print('3. Restart OpenClaw gateway if needed')
