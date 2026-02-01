"""
Dyktowanie Deepgram

Numpad 0 = Wlacz/Wylacz dyktowanie
Numpad Enter = Wlacz/Wylacz dyktowanie
ESC = Zamknij
"""

import os
import sys
import threading
import json
import keyboard
import numpy as np
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    from websockets.sync.client import connect as ws_connect
except ImportError:
    print("[ERROR] pip install websockets")
    sys.exit(1)

try:
    import sounddevice as sd
except ImportError:
    print("[ERROR] pip install sounddevice")
    sys.exit(1)

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")


class Dictation:
    SAMPLE_RATE = 16000
    CHANNELS = 1
    BLOCKSIZE = 4096

    def __init__(self, api_key):
        self.api_key = api_key
        self.active = False
        self.running = True
        self.ws = None
        self.stream = None
        self.lock = threading.Lock()

    def toggle(self):
        """Wlacz/wylacz dyktowanie"""
        with self.lock:
            if self.active:
                self._stop()
            else:
                self._start()

    def _start(self):
        if self.active:
            return
        self.active = True
        print("\n" + "="*30)
        print(">>> DYKTOWANIE ON - mow!")
        print("="*30)
        threading.Thread(target=self._run, daemon=True).start()

    def _stop(self):
        if not self.active:
            return
        self.active = False
        print("\n>>> DYKTOWANIE OFF")

        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except:
                pass
            self.stream = None
        if self.ws:
            try:
                self.ws.close()
            except:
                pass
            self.ws = None

    def exit(self):
        self.running = False
        self._stop()

    def _run(self):
        url = (
            f"wss://api.deepgram.com/v1/listen"
            f"?model=nova-2&language=pl&encoding=linear16"
            f"&sample_rate={self.SAMPLE_RATE}&channels={self.CHANNELS}"
            f"&punctuate=true&interim_results=false"
        )
        try:
            self.ws = ws_connect(url, additional_headers={"Authorization": f"Token {self.api_key}"})
            threading.Thread(target=self._receive, daemon=True).start()

            def callback(indata, frames, time_info, status):
                if self.active and self.ws:
                    try:
                        self.ws.send((indata * 32767).astype(np.int16).tobytes())
                    except:
                        pass

            self.stream = sd.InputStream(
                samplerate=self.SAMPLE_RATE,
                channels=self.CHANNELS,
                dtype=np.float32,
                blocksize=self.BLOCKSIZE,
                callback=callback
            )
            self.stream.start()

            while self.active and self.running:
                time.sleep(0.1)
        except Exception as e:
            print(f"[ERROR] {e}")
        finally:
            with self.lock:
                if self.active:
                    self.active = False

    def _receive(self):
        while self.active and self.ws:
            try:
                msg = self.ws.recv(timeout=10)
                data = json.loads(msg)
                if "channel" in data:
                    alt = data["channel"]["alternatives"]
                    if alt and alt[0]["transcript"]:
                        text = alt[0]["transcript"]
                        if data.get("is_final") and text.strip():
                            print(f">> {text}")
                            keyboard.write(text + " ")
            except:
                break


def main():
    print()
    print("="*50)
    print("  DYKTOWANIE DEEPGRAM")
    print("="*50)
    print()
    print("  [Numpad 0]     = Wlacz/Wylacz")
    print("  [Numpad Enter] = Wlacz/Wylacz")
    print("  [ESC]          = Zamknij")
    print()
    print("="*50)

    if not DEEPGRAM_API_KEY:
        print("\n[ERROR] Brak DEEPGRAM_API_KEY!")
        return

    print(f"\nAPI: {DEEPGRAM_API_KEY[:8]}...")
    print("\nGotowe! Nacisnij Numpad 0 aby zaczac.\n")

    d = Dictation(DEEPGRAM_API_KEY)

    # Numpad 0 i Numpad Enter = toggle
    keyboard.add_hotkey('num 0', d.toggle, suppress=True)
    keyboard.add_hotkey('num enter', d.toggle, suppress=True)

    # ESC = exit
    print("Czekam... (ESC = wyjscie)")
    keyboard.wait('esc')

    print("\n[EXIT]")
    d.exit()


if __name__ == "__main__":
    main()
