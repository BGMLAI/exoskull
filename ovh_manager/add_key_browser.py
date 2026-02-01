#!/usr/bin/env python3
"""
Automatyczne dodanie klucza SSH przez panel OVH
"""

from playwright.sync_api import sync_playwright
import time

SSH_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC4TM4xIvot6jbmHi+VvRMl6Z9hMG7n43GCZpiWZ+hXg openclaw"

def main():
    with sync_playwright() as p:
        print("Uruchamiam przegladarke...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={'width': 1400, 'height': 900})
        page = context.new_page()
        
        # 1. Logowanie do OVH
        print("Otwieram strone logowania OVH...")
        page.goto("https://www.ovh.com/auth/")
        
        print("\n" + "="*60)
        print("ZALOGUJ SIE DO OVH")
        print("="*60)
        print("1. Wpisz swoj email i haslo")
        print("2. Zaloguj sie")
        print("3. Nacisnij ENTER w tym terminalu gdy bedziesz zalogowany")
        print("="*60)
        input("\nNacisnij ENTER po zalogowaniu...")
        
        # 2. Przejdz do VPS
        print("\nPrzechodze do VPS...")
        page.goto("https://www.ovh.com/manager/#/vps")
        time.sleep(3)
        
        # 3. Znajdz i kliknij VPS
        print("Szukam VPS...")
        try:
            # Czekaj na liste VPS
            page.wait_for_selector("[data-ng-repeat='vps in vpsList']", timeout=10000)
            
            # Kliknij na VPS o nazwie vps-147f7906
            vps_link = page.locator("text=vps-147f7906").first
            if vps_link.is_visible():
                vps_link.click()
                print("Kliknieto VPS")
            else:
                print("Nie znalazlem VPS na liscie, szukam linku...")
                # Alternatywnie znajdz link do VPS
                links = page.locator("a:has-text('vps')").all()
                for link in links:
                    if "147f7906" in link.inner_text():
                        link.click()
                        break
        except Exception as e:
            print(f"Blad: {e}")
            print("Prosze recznie kliknac na VPS")
            input("Nacisnij ENTER gdy bedziesz na stronie VPS...")
        
        time.sleep(2)
        
        # 4. Przejdz do SSH Keys
        print("\nSzukam sekcji SSH Keys...")
        try:
            # Szukaj linku do SSH keys
            ssh_tab = page.locator("text=SSH keys, text=Klucze SSH").first
            if ssh_tab.is_visible():
                ssh_tab.click()
                print("Kliknieto SSH keys")
            else:
                # Szukaj w menu
                print("Szukam w menu...")
                menu_items = page.locator("a").all()
                for item in menu_items:
                    text = item.inner_text().lower()
                    if "ssh" in text or "klucz" in text:
                        print(f"Znaleziono: {text}")
                        item.click()
                        break
        except Exception as e:
            print(f"Blad: {e}")
        
        time.sleep(2)
        
        # 5. Dodaj klucz
        print("\nProbuje dodac klucz SSH...")
        try:
            # Kliknij przycisk "Add SSH key"
            add_btn = page.locator("button:has-text('Add'), button:has-text('Dodaj')").first
            if add_btn.is_visible():
                add_btn.click()
                print("Kliknieto 'Dodaj'")
                time.sleep(1)
                
                # Wpisz klucz
                textarea = page.locator("textarea").first
                if textarea.is_visible():
                    textarea.fill(SSH_KEY)
                    print("Wpisano klucz")
                    
                    # Znajdz i kliknij przycisk zapisu
                    save_btn = page.locator("button:has-text('Save'), button:has-text('Zapisz'), button[type='submit']").first
                    if save_btn.is_visible():
                        save_btn.click()
                        print("Zapisano klucz!")
                        time.sleep(3)
                    else:
                        print("Nie znalazlem przycisku zapisu")
                else:
                    print("Nie znalazlem pola tekstowego")
            else:
                print("Nie znalazlem przycisku 'Dodaj'")
        except Exception as e:
            print(f"Blad podczas dodawania: {e}")
            print("\nProszę dodac klucz recznie:")
            print(SSH_KEY)
        
        print("\n" + "="*60)
        print("ZAMYKAM ZA 30 SEKUND")
        print("="*60)
        time.sleep(30)
        browser.close()

if __name__ == "__main__":
    main()
