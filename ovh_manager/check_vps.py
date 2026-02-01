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
print('VPS STATUS:', vps)
print('='*60)
print()

try:
    status = client.get(f'/vps/{vps}')
    print('Stan:', status.get('state'))
    print('System:', status.get('distribution', {}).get('name', 'N/A'))
    print('Wersja:', status.get('version', 'N/A'))
    print('Lokalizacja:', status.get('location', 'N/A'))
    print()
    
    # IP
    ips = client.get(f'/vps/{vps}/ips')
    print('IP:')
    for ip in ips:
        print('  -', ip)
    print()
    
    # Dyski
    disks = client.get(f'/vps/{vps}/disks')
    print('Dyski:')
    for disk_id in disks:
        disk = client.get(f'/vps/{vps}/disks/{disk_id}')
        size_gb = disk.get('size', 0) / (1024**3)
        disk_type = disk.get('type', 'N/A')
        print(f'  - {disk_id}: {size_gb:.1f} GB ({disk_type})')
    
    # Czy dziala?
    if status.get('state') == 'running':
        print()
        print('[OK] VPS jest WLACZONY i dziala!')
    elif status.get('state') == 'stopped':
        print()
        print('[WARN] VPS jest WYLACZONY')
        
except Exception as e:
    print('ERROR:', e)
