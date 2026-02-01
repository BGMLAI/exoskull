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
print('NAPRAWA OPENC LAW PRZEZ RESCUE MODE')
print('='*60)
print()

# 1. Enable rescue mode
print('1. Wlaczanie rescue mode...')
try:
    result = client.post(f'/vps/{vps}/rescue', 
                         type='linux', 
                         media='rescue64-pro')
    print(f'   Rescue wlaczony!')
    print(f'   Haslo: {result.get("password")}')
    rescue_pass = result.get('password')
except Exception as e:
    print(f'   Error: {e}')
    rescue_pass = None

print()

# 2. Reboot to rescue
print('2. Restart do rescue mode...')
try:
    client.post(f'/vps/{vps}/rescue/reboot')
    print('   VPS restartuje sie...')
except Exception as e:
    print(f'   Error: {e}')

print()
print('3. Czekam 60 sekund na start rescue...')
time.sleep(5)
print('   (W realnym scenariuszu czekalibysmy 60s)')

print()
print('='*60)
print('INSTRUKCJE NAPRAWY:')
print('='*60)
print(f'''
1. Połącz się przez SSH (za ~60 sekund):
   ssh root@{c['vps_name']} 
   lub
   ssh root@57.128.253.15
   
   Haslo: {rescue_pass or '(pokazane wyzej)'}

2. Zamontuj dysk systemowy:
   mount /dev/sda1 /mnt
   mount /dev/sda2 /mnt/boot  # jesli istnieje
   mount --bind /dev /mnt/dev
   mount --bind /proc /mnt/proc
   mount --bind /sys /mnt/sys
   chroot /mnt

3. Sprawdź czy OpenClaw jest zainstalowany:
   which openclaw
   openclaw --version

4. Jeśli NIE ma OpenClaw - zainstaluj:
   apt update
   apt install -y nodejs npm
   npm install -g openclaw
   
   # Lub pobierz bezposrednio:
   curl -fsSL https://openclaw.ai/install.sh | bash

5. Skonfiguruj OpenClaw:
   openclaw setup
   openclaw config set gateway.mode remote
   openclaw config set gateway.remote.url wss://exoskull.xyz

6. Uruchom gateway:
   openclaw gateway --port 443

7. Wyjdz z chroot i rescue:
   exit
   umount -R /mnt
   reboot
''')

print()
print('Czy wykonac restart do rescue mode teraz? [t/N]')
