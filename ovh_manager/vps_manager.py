#!/usr/bin/env python3
import json
import ovh

class VPSManager:
    def __init__(self, creds_file="ovh_credentials.json"):
        with open(creds_file) as f:
            c = json.load(f)
        self.client = ovh.Client(
            endpoint="ovh-eu",
            application_key=c["application_key"],
            application_secret=c["application_secret"],
            consumer_key=c["consumer_key"]
        )
        self.vps = c.get("vps_name", "vps-147f7906.vps.ovh.net")
    
    def test(self):
        try:
            me = self.client.get("/me")
            print(f"[OK] Zalogowano: {me.get('firstname','')} {me.get('name','')}")
            return True
        except:
            print("[ERROR] Brak autoryzacji - zaakceptuj uprawnienia w OVH Manager")
            return False
    
    def status(self):
        try:
            s = self.client.get(f"/vps/{self.vps}")
            print(f"\nVPS: {s.get('name')}")
            print(f"Stan: {s.get('state')}")
            print(f"System: {s.get('distribution',{}).get('name','N/A')}")
            return s
        except Exception as e:
            print(f"[ERROR] {e}")
            return None
    
    def start(self):
        print(f"[ACTION] Wlaczanie {self.vps}")
        try:
            self.client.post(f"/vps/{self.vps}/start")
            print("[OK] VPS wlaczony")
        except Exception as e:
            print(f"[ERROR] {e}")
    
    def stop(self):
        print(f"[ACTION] Wylaczanie {self.vps}")
        try:
            self.client.post(f"/vps/{self.vps}/stop")
            print("[OK] VPS wylaczony")
        except Exception as e:
            print(f"[ERROR] {e}")
    
    def reboot(self):
        print(f"[ACTION] Restart {self.vps}")
        try:
            self.client.post(f"/vps/{self.vps}/reboot")
            print("[OK] VPS restartuje sie")
        except Exception as e:
            print(f"[ERROR] {e}")

if __name__ == "__main__":
    m = VPSManager()
    print("VPS Manager - OVH API")
    print("="*40)
    if not m.test():
        print("Wejdz na https://www.ovh.com/manager/ i zaakceptuj uprawnienia")
        exit(1)
    
    s = m.status()
    if s and s.get("state") == "stopped":
        if input("Wlaczyc VPS? [t/N]: ").lower() in ["t","tak"]:
            m.start()
    elif s and s.get("state") == "running":
        print("\n[OK] VPS dziala!")
