# OpenClaw na exoskull.xyz - Dokumentacja Instalacji

## Podsumowanie

Data: 2026-01-31
Czas trwania: ~2 godziny
Rezultat: OpenClaw Gateway dziala na https://exoskull.xyz

---

## 1. Problem poczatkowy

OpenClaw byl skonfigurowany lokalnie, ale uzytkownik chcial:
- Gateway na serwerze (exoskull.xyz)
- Lokalnie tylko node (klient)
- Polaczenie przez domene exoskull.xyz

Stan poczatkowy:
- VPS OVH: vps-147f7906.vps.ovh.net (IP: 57.128.253.15)
- DNS: exoskull.xyz -> 57.128.253.15 (OK)
- Caddy: dzialal, ale zwracal 502 (brak backendu)
- SSH: zablokowany (wymagal klucza, haslo nie dzialalo)

---

## 2. Konfiguracja OVH API

### Problem
Brak dostepu SSH do serwera - haslo nie dzialalo, klucz SSH nie byl dodany.

### Rozwiazanie
1. Utworzenie aplikacji OVH API z pelnym dostepem
2. Wygenerowanie consumer key z uprawnieniami:
   - GET/POST/PUT na /vps/*
   - GET/POST na /ip/*
   - GET na /me, /services

### Klucze (zapisane w ovh_manager/ovh_credentials.json):
- Application Key: 0b0e0c177d73fcbf
- Application Secret: 7b3166b9f1cc9fb278af1a32b2451e3e
- Consumer Key: fbb25582e9515788988f...

---

## 3. Reinstalacja VPS

### Problem
Ubuntu 24.10 (oracular) - repozytoria juz nie dzialaly (404 Not Found)

### Rozwiazanie
1. Pierwsza reinstalacja z Ubuntu 24.10 - nieudana (repozytoria 404)
2. Druga reinstalacja z Ubuntu 22.04 LTS - sukces

### Komenda API:
```python
client.post('/vps/vps-147f7906.vps.ovh.net/rebuild',
            imageId='a8366d65-9024-4286-9cd6-7387c2deda25')
```

---

## 4. Dostep SSH

### Problem
Haslo OVH wygasalo natychmiast po pierwszym logowaniu.

### Rozwiazanie
1. Polaczenie przez paramiko (Python)
2. Automatyczna zmiana hasla przez invoke_shell()
3. Dodanie klucza SSH do authorized_keys

### Klucz SSH:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC4TM4xIvot6jbmHi+VvRMl6Z9hMG7n43GCZpiWZ+hXg openclaw
```

Plik: ~/.ssh/exoskull (prywatny) i ~/.ssh/exoskull.pub (publiczny)

---

## 5. Instalacja OpenClaw na serwerze

### Kroki:
1. Aktualizacja systemu (apt update/upgrade)
2. Instalacja Node.js 22 przez nodesource
3. Instalacja OpenClaw przez oficjalny skrypt:
   ```bash
   curl -fsSL https://openclaw.ai/install.sh | sudo bash
   ```
4. Konfiguracja gateway:
   ```bash
   openclaw config set gateway.mode local
   openclaw config set gateway.port 18789
   openclaw config set gateway.bind lan
   openclaw config set gateway.auth.token exoskull2026secret
   ```

### Usluga systemd:
```ini
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/openclaw gateway
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## 6. Konfiguracja HTTPS (Caddy)

### Problem
Panel OpenClaw wymaga HTTPS (secure context) - HTTP nie dziala.

### Rozwiazanie
1. Instalacja Caddy:
   ```bash
   sudo apt install caddy
   ```
2. Konfiguracja /etc/caddy/Caddyfile:
   ```
   exoskull.xyz {
       reverse_proxy localhost:18789
   }
   ```
3. Caddy automatycznie pobiera certyfikat SSL od Let's Encrypt

### Architektura:
```
[Internet] -> exoskull.xyz:443 (Caddy/HTTPS) -> localhost:18789 (OpenClaw)
```

---

## 7. Parowanie urzadzen

### Problem
Polaczenie z gateway wymagalo parowania - blad "pairing required".

### Rozwiazanie
1. Na serwerze: `sudo openclaw devices list` - pokazuje pending requests
2. Zatwierdzenie: `sudo openclaw devices approve <request-id>`
3. Na kliencie: `openclaw health` - teraz dziala

### Sparowane urzadzenia (3):
- Glowny node (ten komputer)
- 2 dodatkowe urzadzenia testowe

---

## 8. Konfiguracja lokalna (node/klient)

### Plik: ~/.openclaw/moltbot.json
```json
{
  "gateway": {
    "mode": "remote",
    "auth": {
      "token": "exoskull2026secret"
    },
    "remote": {
      "url": "wss://exoskull.xyz",
      "token": "exoskull2026secret"
    }
  }
}
```

### Komendy onboardingu:
```bash
openclaw configure  # wybierz Remote, wss://exoskull.xyz, token
openclaw onboard    # pelny wizard
openclaw health     # test polaczenia
```

---

## 8.1 Konfiguracja modelu AI (Kimi K2.5)

### Problem
Domyslnie OpenClaw uzywal Anthropic Claude, ale uzytkownik nie mial kredytow.

### Rozwiazanie
1. Ustawienie modelu przez CLI:
   ```bash
   sudo openclaw models set moonshot/kimi-k2.5
   ```

2. Konfiguracja providera w `/root/.openclaw/agents/main/agent/models.json`:
   ```json
   {
     "providers": {
       "moonshot": {
         "baseUrl": "https://api.moonshot.ai/v1",
         "api": "openai-completions",
         "models": [{
           "id": "kimi-k2.5",
           "name": "Kimi K2.5",
           "contextWindow": 256000,
           "maxTokens": 8192
         }],
         "apiKey": "sk-IgtXpYOzukucrToQR1EIMPj198L68KcO3tcjW565JK5VsCzF"
       }
     }
   }
   ```

3. Restart uslugi:
   ```bash
   sudo systemctl restart openclaw
   ```

### Weryfikacja:
```bash
sudo journalctl -u openclaw -n 10 | grep "agent model"
# Powinno pokazac: [gateway] agent model: moonshot/kimi-k2.5
```

---

## 9. Problemy napotkane i rozwiazania

| Problem | Przyczyna | Rozwiazanie |
|---------|-----------|-------------|
| SSH permission denied | Brak klucza SSH | Reinstalacja VPS + dodanie klucza |
| apt 404 errors | Ubuntu 24.10 EOL | Reinstalacja z Ubuntu 22.04 LTS |
| Password expired | OVH wymusza zmiane | Automatyczna zmiana przez paramiko |
| Token mismatch | Rozne tokeny | Synchronizacja tokenu na obu stronach |
| Pairing required | Brak autoryzacji | Zatwierdzenie przez `devices approve` |
| HTTPS required | Secure context | Instalacja Caddy z auto-SSL |
| Model defaulting to Anthropic | Brak konfiguracji providera | `openclaw models set moonshot/kimi-k2.5` |

---

## 10. Struktura plikow

```
exoskull/
├── config/
│   ├── local-node.json      # konfiguracja klienta
│   ├── server-gateway.json  # konfiguracja serwera
│   └── server-info.txt      # dane dostepu
├── docs/
│   └── INSTALLATION_JOURNEY.md  # ta dokumentacja
└── ovh_manager/
    ├── ovh_credentials.json  # klucze API OVH
    ├── vps_manager.py        # skrypt zarzadzania VPS
    └── install_openclaw.py   # skrypt instalacji
```

---

## 11. Komendy utrzymania

### Serwer (SSH):
```bash
# Polaczenie
ssh -i ~/.ssh/exoskull ubuntu@57.128.253.15

# Status
sudo systemctl status openclaw
sudo systemctl status caddy

# Logi
sudo journalctl -u openclaw -f

# Restart
sudo systemctl restart openclaw

# Pending devices
sudo openclaw devices list
sudo openclaw devices approve <id>
```

### Lokalnie:
```bash
# Test polaczenia
openclaw health

# Dashboard
openclaw dashboard

# Agent
openclaw agent -m "wiadomosc"

# Rekonfiguracja
openclaw configure
```

---

## 12. Dane dostepu (POUFNE)

- VPS IP: 57.128.253.15
- SSH User: ubuntu
- SSH Key: ~/.ssh/exoskull
- Gateway Token: exoskull2026secret
- OVH API: ovh_manager/ovh_credentials.json

---

Autor: Claude Code (Opus 4.5)
Data: 2026-01-31
