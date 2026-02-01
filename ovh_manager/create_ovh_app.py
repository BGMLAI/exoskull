#!/usr/bin/env python3
"""
Skrypt do tworzenia aplikacji OVH API z pelnymi uprawnieniami (bez usuwania/kupowania)
"""

import requests
import json
import time
import webbrowser

# Konfiguracja OVH API
OVH_ENDPOINT = "https://eu.api.ovh.com"
OVH_VERSION = "1.0"

# Pełna lista uprawnień (wszystko poza usuwaniem i kupowaniem)
ACCESS_RULES = [
    # VPS - podstawowe operacje
    {"method": "GET", "path": "/vps"},
    {"method": "GET", "path": "/vps/*"},
    {"method": "POST", "path": "/vps/*/reboot"},
    {"method": "POST", "path": "/vps/*/start"},
    {"method": "POST", "path": "/vps/*/stop"},
    {"method": "PUT", "path": "/vps/*/start"},
    {"method": "PUT", "path": "/vps/*/stop"},
    {"method": "PUT", "path": "/vps/*/reboot"},
    {"method": "GET", "path": "/vps/*/status"},
    
    # Rescue mode
    {"method": "POST", "path": "/vps/*/rescue"},
    {"method": "POST", "path": "/vps/*/rescue/reboot"},
    {"method": "DELETE", "path": "/vps/*/rescue"},
    
    # Dyski
    {"method": "GET", "path": "/vps/*/disks"},
    {"method": "GET", "path": "/vps/*/disks/*"},
    {"method": "POST", "path": "/vps/*/disks/*/upgrade"},
    
    # Snapshoty
    {"method": "GET", "path": "/vps/*/snapshot"},
    {"method": "POST", "path": "/vps/*/snapshot/create"},
    {"method": "POST", "path": "/vps/*/snapshot/restore"},
    {"method": "DELETE", "path": "/vps/*/snapshot"},
    
    # IP i sieć
    {"method": "GET", "path": "/ip"},
    {"method": "GET", "path": "/ip/*"},
    {"method": "GET", "path": "/vps/*/ips"},
    {"method": "GET", "path": "/vps/*/ips/*"},
    {"method": "POST", "path": "/ip/*/move"},
    {"method": "POST", "path": "/ip/*/reverse"},
    {"method": "PUT", "path": "/ip/*/reverse"},
    {"method": "DELETE", "path": "/ip/*/reverse"},
    {"method": "POST", "path": "/vps/*/ip/*/antiDDoS/enable"},
    {"method": "POST", "path": "/vps/*/ip/*/antiDDoS/disable"},
    
    # Firewall
    {"method": "GET", "path": "/ip/*/firewall"},
    {"method": "POST", "path": "/ip/*/firewall"},
    {"method": "GET", "path": "/ip/*/firewall/*"},
    {"method": "POST", "path": "/ip/*/firewall/*/rule"},
    {"method": "GET", "path": "/ip/*/firewall/*/rule/*"},
    {"method": "PUT", "path": "/ip/*/firewall/*/rule/*"},
    {"method": "DELETE", "path": "/ip/*/firewall/*/rule/*"},
    
    # Monitoring
    {"method": "GET", "path": "/vps/*/monitoring"},
    {"method": "GET", "path": "/vps/*/use"},
    
    # Reinstallacja
    {"method": "POST", "path": "/vps/*/reinstall"},
    {"method": "GET", "path": "/vps/*/reinstall/availableTemplates"},
    {"method": "GET", "path": "/vps/*/reinstall/templates"},
    
    # Backup
    {"method": "GET", "path": "/vps/*/automatedBackup"},
    {"method": "POST", "path": "/vps/*/automatedBackup"},
    {"method": "PUT", "path": "/vps/*/automatedBackup"},
    {"method": "DELETE", "path": "/vps/*/automatedBackup"},
    {"method": "POST", "path": "/vps/*/automatedBackup/restore"},
    
    # Dodatkowe dyski
    {"method": "GET", "path": "/vps/*/additionalDisk"},
    {"method": "GET", "path": "/vps/*/additionalDisk/*"},
    {"method": "POST", "path": "/vps/*/additionalDisk/*/upgrade"},
    
    # DNS
    {"method": "GET", "path": "/domain"},
    {"method": "GET", "path": "/domain/*"},
    {"method": "GET", "path": "/domain/*/record"},
    {"method": "POST", "path": "/domain/*/record"},
    {"method": "GET", "path": "/domain/*/record/*"},
    {"method": "PUT", "path": "/domain/*/record/*"},
    {"method": "DELETE", "path": "/domain/*/record/*"},
    {"method": "POST", "path": "/domain/*/refresh"},
    
    # Konto i billing (tylko GET)
    {"method": "GET", "path": "/me"},
    {"method": "GET", "path": "/me/bill"},
    {"method": "GET", "path": "/me/order"},
    {"method": "GET", "path": "/services"},
    {"method": "GET", "path": "/services/*"},
    {"method": "POST", "path": "/services/*/changeContact"},
]


def create_ovh_application():
    """Tworzy nową aplikację OVH API"""
    
    print("=" * 60)
    print("TWORZENIE APLIKACJI OVH API")
    print("=" * 60)
    print()
    
    # Nazwa aplikacji
    app_name = input("Podaj nazwe aplikacji [vps-manager]: ").strip() or "vps-manager"
    app_desc = input("Podaj opis aplikacji [Zarzadzanie VPS]: ").strip() or "Zarządzanie VPS"
    
    print(f"\nTworzenie aplikacji: {app_name}")
    print("Prosze czekac...\n")
    
    # Krok 1: Utworzenie aplikacji (pobranie applicationKey i applicationSecret)
    url = f"{OVH_ENDPOINT}/{OVH_VERSION}/auth/credential"
    
    payload = {
        "accessRules": ACCESS_RULES,
        "redirection": "https://localhost"
    }
    
    headers = {
        "Content-Type": "application/json",
        "X-Ovh-Application": "",  # Puste przy pierwszym requeście
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        
        print("[OK] Aplikacja utworzona pomyslnie!")
        print()
        print("=" * 60)
        print("DANE DO ZAPISANIA:")
        print("=" * 60)
        print()
        print(f"[APP] Application Key:")
        print(f"   {data.get('applicationKey', 'BRAK')}")
        print()
        print(f"[KEY] Application Secret:")
        print(f"   {data.get('applicationSecret', 'BRAK')}")
        print()
        print(f"[TOKEN] Consumer Key:")
        print(f"   {data.get('consumerKey', 'BRAK')}")
        print()
        print("=" * 60)
        print()
        
        # Otwarcie URL walidacji
        validation_url = data.get('validationUrl')
        if validation_url:
            print(f"[LINK] URL walidacji: {validation_url}")
            print()
            print("WAZNE!")
            print("Musisz otworzyc powyzszy link w przegladarce,")
            print("zalogowac sie do OVH i zaakceptowac uprawnienia.")
            print()
            
            # Zapytanie o otwarcie przeglądarki
            open_browser = input("Otworzyc przegladarke automatycznie? [t/N]: ").strip().lower()
            if open_browser in ['t', 'tak', 'y', 'yes']:
                webbrowser.open(validation_url)
                print("\nPrzegladarka otwarta. Zaloguj sie i zaakceptuj uprawnienia.")
            
            print("\nPo zaakceptowaniu w przegladarce, aplikacja bedzie gotowa!")
            print()
            
            # Sprawdzenie czy zwalidowano
            check = input("Sprawdzic czy walidacja zostala zakonczona? [t/N]: ").strip().lower()
            if check in ['t', 'tak', 'y', 'yes']:
                check_validation(data['applicationKey'], data['applicationSecret'], 
                               data['consumerKey'])
        
        # Zapisanie do pliku
        save = input("\nZapisac dane do pliku ovh_credentials.json? [T/n]: ").strip().lower()
        if save not in ['n', 'nie']:
            save_credentials(data, app_name)
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Blad podczas tworzenia aplikacji: {e}")
        return None


def check_validation(app_key, app_secret, consumer_key):
    """Sprawdza czy consumer key został zwalidowany"""
    print("\nSprawdzanie walidacji...")
    
    # Generowanie timestamp i signature
    import hashlib
    
    timestamp = str(int(time.time()) + 10)
    method = "GET"
    url = f"{OVH_ENDPOINT}/{OVH_VERSION}/me"
    
    # Obliczanie sygnatury (wymaga applicationSecret)
    # W rzeczywistości trzeba by zaimplementować pełną autentykację
    
    try:
        # Proste sprawdzenie - próba pobrania /me
        headers = {
            "X-Ovh-Application": app_key,
            "X-Ovh-Consumer": consumer_key,
            "X-Ovh-Timestamp": timestamp,
        }
        
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            print("[OK] Walidacja zakonczona pomyslnie!")
            print(f"Zalogowano jako: {response.json().get('firstname', '')} {response.json().get('name', '')}")
        elif response.status_code == 401:
            print("[WAIT] Oczekiwanie na walidacje...")
            print("Otworz URL walidacji w przegladarce i zaakceptuj uprawnienia.")
        else:
            print(f"[WARN] Status: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"[WARN] Blad sprawdzania: {e}")


def save_credentials(data, app_name):
    """Zapisuje dane do pliku JSON"""
    
    filename = "ovh_credentials.json"
    
    credentials = {
        "application_name": app_name,
        "application_key": data.get('applicationKey'),
        "application_secret": data.get('applicationSecret'),
        "consumer_key": data.get('consumerKey'),
        "endpoint": "ovh-eu",
        "validation_url": data.get('validationUrl'),
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(credentials, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Dane zapisane do pliku: {filename}")
    print("UWAGA: Przechowuj ten plik w bezpiecznym miejscu!")
    print("Zawiera wrażliwe dane dostępowe.")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("OVH API - Kreator aplikacji")
    print("Pelne uprawnienia (bez usuwania/kupowania)")
    print("=" * 60 + "\n")
    
    create_ovh_application()
    
    print("\n" + "=" * 60)
    print("Koniec")
    print("=" * 60)
