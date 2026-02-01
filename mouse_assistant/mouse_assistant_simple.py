"""
Mouse Assistant - Wersja z Deepgram STT
Aplikacja do zarządzania komputerem za pomocą myszki
z funkcjami kopiuj/wklej, kołowym menu i dyktowaniem Deepgram.
"""

import sys
import math
import subprocess
import threading
import time
import os
import socket
import queue
from PyQt5.QtWidgets import (QApplication, QWidget, QMainWindow, QSystemTrayIcon,
                              QMenu, QLabel, QPushButton, QVBoxLayout)
from PyQt5.QtCore import Qt, QPoint, pyqtSignal, QObject, QThread, QRect
from PyQt5.QtGui import QPainter, QColor, QPen, QFont, QIcon, QPixmap
from pynput import mouse
import keyboard
import win32gui
import pyperclip
import numpy as np

# Audio - używamy sounddevice (lepsza kompatybilność z Python 3.14)
try:
    import sounddevice as sd
    SOUNDDEVICE_AVAILABLE = True
except ImportError:
    SOUNDDEVICE_AVAILABLE = False
    print("[WARN] sounddevice not available")

# Deepgram - używamy websockets bezpośrednio (działa z Python 3.14)
try:
    from websockets.sync.client import connect as ws_connect
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False
    print("[WARN] websockets unavailable - install: pip install websockets")

# Zaawansowany TTS - pyttsx3
try:
    import pyttsx3
    PYTTSX3_AVAILABLE = True
except ImportError:
    PYTTSX3_AVAILABLE = False
    print("[WARN] pyttsx3 unavailable - using basic Windows SAPI")

# OCR - pytesseract
try:
    import pytesseract
    from PIL import Image, ImageGrab
    import io
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False
    print("[WARN] pytesseract/PIL unavailable - OCR disabled")


class GlobalState(QObject):
    """Klasa do przechowywania globalnego stanu aplikacji"""

    def __init__(self):
        super().__init__()
        self.both_buttons_pressed = False
        self.left_pressed = False
        self.right_pressed = False
        self.menu_position = None
        self.scroll_keyboard_mode = True  # Domyślnie włączony
        self.speaking = False
        self.reading_enabled = True
        self.dictation_active = False
        # Ustawienia TTS (Speechify-like)
        self.tts_voice_index = 0  # Indeks głosu
        self.tts_speed = 150  # Prędkość (50-300, domyślnie 150)
        self.tts_paused = False  # Czy czytanie jest wstrzymane


def check_internet_connection(timeout=2):
    """Sprawdza czy jest połączenie z internetem"""
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=timeout)
        return True
    except OSError:
        return False


class DictationManager(QObject):
    """
    Manager dyktowania z obsługą Deepgram (online) i Windows STT (offline).

    Hierarchia:
    1. Deepgram (gdy jest internet) - najlepsza jakość, real-time
    2. Windows Speech Recognition (fallback) - gdy brak internetu
    """
    text_received = pyqtSignal(str)  # Sygnał z rozpoznanym tekstem
    status_changed = pyqtSignal(str)  # Sygnał ze zmianą statusu

    # Konfiguracja Deepgram - USTAW SWÓJ KLUCZ API
    DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")

    # Konfiguracja audio (sounddevice)
    SAMPLE_RATE = 16000
    CHANNELS = 1
    BLOCKSIZE = 4096  # Zwiększone dla lepszej jakości

    def __init__(self, parent=None):
        super().__init__(parent)
        self.is_running = False
        self.stream = None
        self.ws = None  # WebSocket connection
        self.dictation_thread = None
        self.lock = threading.Lock()

    def start_dictation(self):
        """Rozpocznij dyktowanie - wybiera najlepszą dostępną metodę"""
        if self.is_running:
            self.stop_dictation()
            return

        if not SOUNDDEVICE_AVAILABLE:
            self.status_changed.emit("Brak sounddevice!")
            return

        self.is_running = True

        # Użyj Windows STT (nie Deepgram - użytkownik powiedział, że nie działa)
        # Sprawdź internet i dostępność Deepgram
        # has_internet = check_internet_connection()
        # use_deepgram = (WEBSOCKETS_AVAILABLE and
        #                has_internet and
        #                self.DEEPGRAM_API_KEY)

        # Zawsze używaj Windows STT (jak użytkownik chce)
        self.status_changed.emit("Windows STT: Uruchamiam...")
        self.dictation_thread = threading.Thread(
            target=self._windows_dictation,
            daemon=True
        )

        self.dictation_thread.start()

    def stop_dictation(self):
        """Zatrzymaj dyktowanie"""
        self.is_running = False
        self.status_changed.emit("Dyktowanie zatrzymane")

        # Zamknij stream audio
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except:
                pass
            self.stream = None

        # Zamknij połączenie WebSocket Deepgram
        if self.ws:
            try:
                self.ws.close()
            except:
                pass
            self.ws = None

    def _deepgram_dictation(self):
        """Dyktowanie przez Deepgram (real-time streaming z sounddevice) - websockets bezpośrednio"""
        import json
        
        if not WEBSOCKETS_AVAILABLE:
            self.status_changed.emit("Brak websockets - przełączam na Windows")
            if self.is_running:
                self._windows_dictation()
            return

        if not self.DEEPGRAM_API_KEY:
            self.status_changed.emit("Brak klucza API - przełączam na Windows")
            if self.is_running:
                self._windows_dictation()
            return

        try:
            # URL WebSocket Deepgram
            url = (
                f"wss://api.deepgram.com/v1/listen"
                f"?model=nova-2&language=pl&encoding=linear16"
                f"&sample_rate={self.SAMPLE_RATE}&channels={self.CHANNELS}"
                f"&punctuate=true&interim_results=false"
            )

            # Połącz z Deepgram
            self.ws = ws_connect(url, additional_headers={"Authorization": f"Token {self.DEEPGRAM_API_KEY}"})
            
            # Wątek do odbierania wiadomości
            def receive_thread():
                while self.is_running and self.ws:
                    try:
                        msg = self.ws.recv(timeout=10)
                        data = json.loads(msg)
                        if "channel" in data:
                            alt = data["channel"]["alternatives"]
                            if alt and alt[0]["transcript"]:
                                text = alt[0]["transcript"]
                                if data.get("is_final") and text.strip():
                                    self.text_received.emit(text + " ")
                    except Exception as e:
                        if self.is_running:
                            print(f"[Deepgram] Błąd odbierania: {e}")
                        break

            threading.Thread(target=receive_thread, daemon=True).start()

            self.status_changed.emit("Deepgram: Słucham... (mów!)")

            # Callback dla audio
            def audio_callback(indata, frames, time_info, status):
                if self.is_running and self.ws:
                    try:
                        # Konwertuj float32 na int16 PCM
                        audio_bytes = (indata * 32767).astype(np.int16).tobytes()
                        self.ws.send(audio_bytes)
                    except Exception as e:
                        if self.is_running:
                            print(f"[Deepgram] Błąd wysyłania audio: {e}")

            # Uruchom stream audio
            self.stream = sd.InputStream(
                samplerate=self.SAMPLE_RATE,
                channels=self.CHANNELS,
                dtype=np.float32,
                blocksize=self.BLOCKSIZE,
                callback=audio_callback
            )
            self.stream.start()

            # Główna pętla
            while self.is_running:
                time.sleep(0.1)

        except Exception as e:
            print(f"[Deepgram] Błąd główny: {e}")
            import traceback
            traceback.print_exc()
            self.status_changed.emit(f"Błąd Deepgram - przełączam na Windows")
            # Fallback na Windows
            if self.is_running:
                self._windows_dictation()
        finally:
            self.stop_dictation()

    def _windows_dictation(self):
        """Dyktowanie przez Windows Speech Recognition (offline fallback)"""
        try:
            self.status_changed.emit("Windows STT: Uruchamiam...")

            # Użyj natywnego Windows Voice Typing (Win+H)
            # lub uruchom Windows Speech Recognition
            self._native_windows_stt()
            
            # Utrzymuj wątek aktywny, aby dyktowanie działało
            # (nie kończ od razu - Windows STT działa w tle)
            while self.is_running:
                time.sleep(0.5)

        except Exception as e:
            print(f"[Windows STT] Błąd główny: {e}")
            import traceback
            traceback.print_exc()
            self.status_changed.emit(f"Błąd Windows STT: {e}")
        finally:
            self.is_running = False

    def _native_windows_stt(self):
        """Uruchom natywne Windows Voice Typing (Win+H)"""
        try:
            self.status_changed.emit("Windows Voice Typing...")
            # Symuluj Win+H (Windows Voice Typing)
            keyboard.press_and_release('win+h')
            self.status_changed.emit("Dyktowanie Windows aktywne (Win+H)")
        except Exception as e:
            print(f"[Native Windows STT] Błąd: {e}")
            # Fallback - otwórz panel ustawień mowy
            try:
                subprocess.Popen(
                    ["powershell", "-Command", "Start-Process", "ms-settings:speech"],
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            except:
                pass


class TTSManager(QObject):
    """
    Zaawansowany manager Text-to-Speech z funkcjami Speechify:
    - Wybór głosu
    - Regulacja prędkości
    - Pauza/Wznowienie
    """
    speaking_finished = pyqtSignal()
    speaking_status = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.engine = None
        self.voices = []
        self.current_voice_index = 0
        self.speed = 150  # 50-300
        self.is_speaking = False
        self.is_paused = False
        self._init_engine()

    def _init_engine(self):
        """Inicjalizuj silnik TTS"""
        if PYTTSX3_AVAILABLE:
            try:
                print("[TTS] Inicjalizacja pyttsx3...")
                self.engine = pyttsx3.init()
                self.voices = self.engine.getProperty('voices')
                if self.voices:
                    self.engine.setProperty('voice', self.voices[0].id)
                    print(f"[TTS] Załadowano {len(self.voices)} głosów")
                    for i, v in enumerate(self.voices[:3]):  # Pokaż pierwsze 3
                        print(f"[TTS]   {i}: {v.name}")
                else:
                    print("[TTS] Brak dostępnych głosów!")
                self.engine.setProperty('rate', self.speed)
                print(f"[TTS] Silnik zainicjalizowany poprawnie")
            except Exception as e:
                print(f"[TTS] Błąd inicjalizacji: {e}")
                import traceback
                traceback.print_exc()
                self.engine = None
        else:
            print("[TTS] pyttsx3 niedostępne - używam Windows SAPI")

    def get_available_voices(self):
        """Zwróć listę dostępnych głosów"""
        if self.engine and self.voices:
            return [(i, voice.name, voice.id) for i, voice in enumerate(self.voices)]
        return []

    def set_voice(self, index):
        """Ustaw głos po indeksie"""
        if self.engine and 0 <= index < len(self.voices):
            self.current_voice_index = index
            self.engine.setProperty('voice', self.voices[index].id)
            return True
        return False

    def set_speed(self, speed):
        """Ustaw prędkość czytania (50-300)"""
        self.speed = max(50, min(300, speed))
        if self.engine:
            self.engine.setProperty('rate', self.speed)

    def speak(self, text):
        """Czytaj tekst na głos"""
        if not text or not text.strip():
            return

        # Zatrzymaj poprzednie czytanie jeśli trwa
        if self.is_speaking:
            self.stop()
            time.sleep(0.1)  # Krótka pauza po zatrzymaniu

        if PYTTSX3_AVAILABLE:
            # Upewnij się, że engine jest zainicjalizowany
            if not self.engine:
                self._init_engine()
            
            if self.engine:
                try:
                    self.is_speaking = True
                    self.is_paused = False
                    self.speaking_status.emit("Czytam...")
                    
                    # pyttsx3 wymaga runAndWait() w głównym wątku
                    # Uruchom w osobnym wątku, ale z nowym engine dla każdego wywołania
                    def speak_thread():
                        try:
                            print("[TTS] Używam pyttsx3 (nie Windows)")
                            # Utwórz nowy engine dla tego wywołania (unikamy konfliktów)
                            temp_engine = pyttsx3.init()
                            if self.voices and len(self.voices) > self.current_voice_index:
                                voice_id = self.voices[self.current_voice_index].id
                                temp_engine.setProperty('voice', voice_id)
                                print(f"[TTS] Głos: {self.current_voice_index}")
                            temp_engine.setProperty('rate', self.speed)
                            print(f"[TTS] Prędkość: {self.speed}")
                            print(f"[TTS] Czytam tekst: {text[:50]}...")
                            
                            temp_engine.say(text)
                            temp_engine.runAndWait()
                            temp_engine.stop()
                            print("[TTS] Zakończono czytanie (pyttsx3)")
                        except Exception as e:
                            print(f"[TTS] Błąd w wątku pyttsx3: {e}")
                            import traceback
                            traceback.print_exc()
                            # Fallback do Windows
                            print("[TTS] Przechodzę na Windows SAPI fallback")
                            self._fallback_speak(text)
                        finally:
                            self.is_speaking = False
                            self.speaking_finished.emit()
                            self.speaking_status.emit("Zakończono")
                    
                    threading.Thread(target=speak_thread, daemon=True).start()
                    
                except Exception as e:
                    print(f"[TTS] Błąd czytania: {e}")
                    import traceback
                    traceback.print_exc()
                    self.is_speaking = False
                    # Fallback do Windows SAPI
                    self._fallback_speak(text)
            else:
                print("[TTS] Nie udało się zainicjalizować silnika")
                self._fallback_speak(text)
        else:
            # Fallback do Windows SAPI
            self._fallback_speak(text)

    def _fallback_speak(self, text):
        """Fallback do Windows SAPI"""
        try:
            print("[TTS] Używam Windows SAPI (fallback)")
            text_clean = text.replace('"', '').replace("'", "")
            rate_adjust = int((self.speed - 150) / 10)  # Konwersja prędkości
            cmd = f'Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = {rate_adjust}; $synth.Speak("{text_clean}")'
            subprocess.run(["powershell", "-Command", cmd], capture_output=True, timeout=30)
            print("[TTS] Zakończono czytanie (Windows SAPI)")
        except Exception as e:
            print(f"[TTS Fallback] Błąd: {e}")

    def stop(self):
        """Zatrzymaj czytanie"""
        if self.engine:
            try:
                self.engine.stop()
            except:
                pass
        self.is_speaking = False
        self.is_paused = False

    def pause(self):
        """Wstrzymaj czytanie (nie obsługiwane przez pyttsx3, tylko informacyjne)"""
        self.is_paused = True
        # pyttsx3 nie obsługuje pauzy, więc zatrzymujemy
        self.stop()

    def resume(self):
        """Wznów czytanie"""
        self.is_paused = False


class OCRManager(QObject):
    """
    Manager OCR do czytania tekstu ze zdjęć/ekranu (funkcja Speechify)
    """
    text_extracted = pyqtSignal(str)
    status_changed = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.available = PYTESSERACT_AVAILABLE

    def extract_text_from_image(self, image_path):
        """Wyciągnij tekst ze zdjęcia"""
        if not self.available:
            self.status_changed.emit("OCR niedostępne - zainstaluj pytesseract")
            return None

        try:
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image, lang='pol+eng')
            self.text_extracted.emit(text)
            return text
        except Exception as e:
            self.status_changed.emit(f"Błąd OCR: {e}")
            return None

    def extract_text_from_clipboard_image(self):
        """Wyciągnij tekst ze zdjęcia w schowku"""
        if not self.available:
            return None

        try:
            # Pobierz obraz ze schowka
            image = ImageGrab.grabclipboard()
            if image:
                text = pytesseract.image_to_string(image, lang='pol+eng')
                self.text_extracted.emit(text)
                return text
            else:
                self.status_changed.emit("Brak obrazu w schowku")
                return None
        except Exception as e:
            self.status_changed.emit(f"Błąd OCR ze schowka: {e}")
            return None

    def extract_text_from_screen_region(self, x, y, width, height):
        """Wyciągnij tekst z regionu ekranu"""
        if not self.available:
            return None

        try:
            # Zrób screenshot regionu
            screenshot = ImageGrab.grab(bbox=(x, y, x + width, y + height))
            text = pytesseract.image_to_string(screenshot, lang='pol+eng')
            self.text_extracted.emit(text)
            return text
        except Exception as e:
            self.status_changed.emit(f"Błąd OCR z ekranu: {e}")
            return None


class RadialMenu(QWidget):
    """Kołowe menu wyświetlane po kliknięciu obu przycisków myszy"""

    def __init__(self, parent=None):
        super().__init__(parent)
        # Flagi okna - upewnij się, że menu jest zawsze widoczne, nawet nad Chrome
        # Używamy BypassWindowManagerHint aby ominąć menedżera okien
        self.setWindowFlags(
            Qt.FramelessWindowHint | 
            Qt.WindowStaysOnTopHint | 
            Qt.Tool |
            Qt.BypassWindowManagerHint |  # Ominie menedżera okien (ważne dla Chrome)
            Qt.WindowDoesNotAcceptFocus
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_ShowWithoutActivating, False)
        # Upewnij się, że menu jest zawsze na wierzchu
        self.setAttribute(Qt.WA_AlwaysStackOnTop, True)
        self.setFixedSize(300, 300)
        print("[MENU] RadialMenu utworzony")

        self.menu_items = [
            {"name": "Kopiuj", "action": self.copy_action},
            {"name": "Wklej", "action": self.paste_action},
            {"name": "Wytnij", "action": self.cut_action},
            {"name": "Czytaj tekst", "action": self.read_text_action},
            {"name": "OCR ze schowka", "action": self.ocr_clipboard_action},
            {"name": "Dyktuj", "action": self.dictate_action},
            {"name": "Scroll→Klawisze", "action": self.toggle_scroll_mode},
            {"name": "Czytaj ON/OFF", "action": self.toggle_reading},
            {"name": "Zatrzymaj czytanie", "action": self.stop_reading_action},
            {"name": "Zamknij", "action": self.close_menu},
        ]

        self.selected_item = -1
        self.center = QPoint(150, 150)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        # Rysuj tło
        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor(40, 40, 40, 200))
        painter.drawEllipse(self.center, 140, 140)

        # Rysuj centralny okrąg
        painter.setBrush(QColor(60, 60, 60, 220))
        painter.drawEllipse(self.center, 40, 40)

        # Rysuj elementy menu
        angle_step = 360 / len(self.menu_items)
        for i, item in enumerate(self.menu_items):
            angle = math.radians(i * angle_step - 90)

            # Pozycja tekstu
            radius = 100
            x = self.center.x() + radius * math.cos(angle)
            y = self.center.y() + radius * math.sin(angle)

            # Podświetlenie wybranego elementu
            if i == self.selected_item:
                painter.setPen(Qt.NoPen)
                painter.setBrush(QColor(100, 150, 255, 150))
                painter.drawEllipse(QPoint(int(x), int(y)), 50, 50)

            # Tekst
            painter.setPen(QPen(QColor(255, 255, 255), 2))
            painter.setFont(QFont("Arial", 8, QFont.Bold))  # Mniejsza czcionka dla więcej opcji
            text_rect = painter.fontMetrics().boundingRect(item["name"])
            painter.drawText(int(x - text_rect.width() / 2),
                           int(y + text_rect.height() / 4),
                           item["name"])

    def mouseMoveEvent(self, event):
        """Wykrywanie nad którym elementem jest kursor"""
        pos = event.pos()
        dx = pos.x() - self.center.x()
        dy = pos.y() - self.center.y()
        distance = math.sqrt(dx * dx + dy * dy)

        if distance > 50 and distance < 140:
            angle = math.degrees(math.atan2(dy, dx)) + 90
            if angle < 0:
                angle += 360

            angle_step = 360 / len(self.menu_items)
            self.selected_item = int(angle / angle_step)
            self.update()
        else:
            self.selected_item = -1
            self.update()

    def mouseReleaseEvent(self, event):
        """Wykonaj akcję po puszczeniu przycisku"""
        if self.selected_item >= 0:
            self.menu_items[self.selected_item]["action"]()
        self.close()

    def copy_action(self):
        keyboard.press_and_release('ctrl+c')

    def paste_action(self):
        keyboard.press_and_release('ctrl+v')

    def cut_action(self):
        keyboard.press_and_release('ctrl+x')

    def toggle_scroll_mode(self):
        if hasattr(self.parent(), 'global_state'):
            current = self.parent().global_state.scroll_keyboard_mode
            self.parent().global_state.scroll_keyboard_mode = not current
            status = "włączony" if not current else "wyłączony"
            self.parent().update_scroll_status(not current)

    def read_text_action(self):
        """Czytaj zaznaczony tekst na głos"""
        print("[Czytanie] Akcja czytania wywołana")
        if hasattr(self.parent(), 'global_state'):
            if not self.parent().global_state.reading_enabled:
                print("[Czytanie] Czytanie wyłączone - włącz w menu")
                self.parent().speak_text("Czytanie jest wyłączone. Włącz w menu.")
                return
            
            # Skopiuj zaznaczony tekst
            print("[Czytanie] Kopiuję zaznaczony tekst...")
            keyboard.press_and_release('ctrl+c')
            time.sleep(0.2)  # Zwiększona pauza dla pewności

            # Pobierz tekst ze schowka
            try:
                text = pyperclip.paste()
                if text and text.strip():
                    print(f"[Czytanie] Znaleziono tekst: {text[:50]}...")
                    self.parent().speak_text(text)
                else:
                    print("[Czytanie] Brak tekstu w schowku")
                    self.parent().speak_text("Nie ma zaznaczonego tekstu")
            except Exception as e:
                print(f"[Czytanie] Błąd: {e}")
                self.parent().speak_text("Nie mozna odczytac tekstu")
        else:
            print("[Czytanie] Brak parent()")

    def dictate_action(self):
        """Uruchom/zatrzymaj dyktowanie przez Deepgram lub Windows"""
        if hasattr(self.parent(), 'dictation_manager'):
            self.parent().toggle_dictation()

    def toggle_reading(self):
        """Włącz/wyłącz czytanie"""
        if hasattr(self.parent(), 'global_state'):
            current = self.parent().global_state.reading_enabled
            self.parent().global_state.reading_enabled = not current
            self.parent().update_reading_status(not current)
            status = "włączone" if not current else "wyłączone"
            self.parent().speak_text(f"Czytanie tekstu {status}")

    def ocr_clipboard_action(self):
        """Wyciągnij tekst ze zdjęcia w schowku i przeczytaj"""
        if hasattr(self.parent(), 'ocr_manager'):
            self.parent().ocr_manager.extract_text_from_clipboard_image()

    def stop_reading_action(self):
        """Zatrzymaj aktualne czytanie"""
        if hasattr(self.parent(), 'tts_manager'):
            self.parent().tts_manager.stop()
            if hasattr(self.parent(), 'global_state'):
                self.parent().global_state.speaking = False

    def close_menu(self):
        self.close()


class MouseController:
    """Kontroler obsługujący eventy myszy"""

    def __init__(self, main_window):
        self.main_window = main_window
        self.global_state = main_window.global_state

    def on_click(self, x, y, button, pressed):
        """Obsługa kliknięć myszy"""
        # DEBUG_MODE = False  # Ustaw na True aby włączyć debugowanie
        
        if button == mouse.Button.left:
            self.global_state.left_pressed = pressed
        elif button == mouse.Button.right:
            self.global_state.right_pressed = pressed

        # Sprawdź czy oba przyciski są wciśnięte JEDNOCZEŚNIE
        both_now_pressed = self.global_state.left_pressed and self.global_state.right_pressed

        if both_now_pressed and not self.global_state.both_buttons_pressed:
            # Oba przyciski wciśnięte PIERWSZY RAZ
            print(f"[MENU] Otwieranie menu na pozycji ({x}, {y})")
            self.global_state.both_buttons_pressed = True
            self.global_state.menu_position = (x, y)
            try:
                self.main_window.show_radial_menu.emit(x, y)
                print(f"[MENU] Sygnał wysłany")
            except Exception as e:
                print(f"[MENU] Błąd wysyłania sygnału: {e}")
                import traceback
                traceback.print_exc()
        elif not both_now_pressed and self.global_state.both_buttons_pressed:
            # Przynajmniej jeden przycisk puszczony - resetuj stan
            self.global_state.both_buttons_pressed = False

        return True

    def on_scroll(self, x, y, dx, dy):
        """Obsługa scrolla - emulacja klawiatury"""
        if self.global_state.scroll_keyboard_mode:
            if dy > 0:
                keyboard.press_and_release('up')
            elif dy < 0:
                keyboard.press_and_release('down')
            if dx > 0:
                keyboard.press_and_release('right')
            elif dx < 0:
                keyboard.press_and_release('left')
            return False  # Blokuj normalny scroll w trybie klawiaturowym
        return True


class MainWindow(QMainWindow):
    """Główne okno aplikacji"""
    show_radial_menu = pyqtSignal(int, int)

    def __init__(self):
        super().__init__()
        self.global_state = GlobalState()
        self.init_ui()
        self.setup_tray()
        self.setup_mouse_listener()
        self.setup_dictation()
        self.setup_tts()
        self.setup_ocr()

        # Połącz sygnały
        self.show_radial_menu.connect(self.display_radial_menu)

    def init_ui(self):
        """Inicjalizacja interfejsu użytkownika"""
        self.setWindowTitle("Mouse Assistant")
        self.setGeometry(100, 100, 450, 350)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)

        # Tytuł
        title = QLabel("🖱️ Mouse Assistant")
        title.setStyleSheet("font-size: 18px; font-weight: bold; color: #4488ff;")
        title.setAlignment(Qt.AlignCenter)
        layout.addWidget(title)

        # Status
        self.status_label = QLabel("✅ Status: Aktywny")
        self.status_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #22aa22;")
        layout.addWidget(self.status_label)

        # Info o trybie scrolla
        self.scroll_label = QLabel("⌨️  Scroll → Klawisze: Włączony")
        self.scroll_label.setStyleSheet("font-size: 12px;")
        layout.addWidget(self.scroll_label)

        # Info o czytaniu
        self.reading_label = QLabel("🔊 Czytanie tekstu: Włączone")
        self.reading_label.setStyleSheet("font-size: 12px;")
        layout.addWidget(self.reading_label)

        # Info o TTS (Speechify)
        self.tts_status_label = QLabel("🎙️ TTS: Zaawansowany (pyttsx3)")
        self.tts_status_label.setStyleSheet("font-size: 11px; color: #666;")
        layout.addWidget(self.tts_status_label)

        # Info o OCR
        ocr_status = "Dostępne" if PYTESSERACT_AVAILABLE else "Niedostępne (zainstaluj pytesseract)"
        self.ocr_status_label = QLabel(f"📷 OCR: {ocr_status}")
        self.ocr_status_label.setStyleSheet("font-size: 11px; color: #666;")
        layout.addWidget(self.ocr_status_label)

        # Info o dyktowaniu
        self.dictation_label = QLabel("🎤 Dyktowanie: Wyłączone")
        self.dictation_label.setStyleSheet("font-size: 12px;")
        layout.addWidget(self.dictation_label)

        # Separator
        separator = QLabel("─" * 60)
        separator.setAlignment(Qt.AlignCenter)
        layout.addWidget(separator)

        # Instrukcje
        instructions = QLabel(
            "<b>📋 Instrukcje:</b><br><br>"
            "🖱️ <b>Kołowe Menu:</b><br>"
            "   • Kliknij lewy + prawy przycisk jednocześnie<br>"
            "   • Poruszaj myszką aby wybrać opcję<br>"
            "   • Puść przyciski aby wykonać<br><br>"

            "⌨️  <b>Scroll = Klawisze:</b><br>"
            "   • Scroll w górę/dół → Strzałki góra/dół<br>"
            "   • Scroll w lewo/prawo → Strzałki lewo/prawo<br>"
            "   • Idealne do nawigacji w menu i listach<br><br>"

            "🔊 <b>Funkcje Głosowe (Speechify-like):</b><br>"
            "   • <b>Czytaj tekst</b> - Czyta zaznaczony tekst na głos<br>"
            "   • <b>OCR ze schowka</b> - Wyciąga tekst ze zdjęcia w schowku<br>"
            "   • <b>Dyktuj</b> - Deepgram STT (internet) / Windows (offline)<br>"
            "   • <b>Czytaj ON/OFF</b> - Włącza/wyłącza czytanie<br>"
            "   • <b>Zatrzymaj czytanie</b> - Zatrzymuje aktualne czytanie<br>"
            "   • <b>Zaawansowane głosy</b> - Wybór głosu i prędkości<br><br>"

            "⚡ <b>Szybkie Akcje (przez menu):</b><br>"
            "   • Kopiuj (Ctrl+C)<br>"
            "   • Wklej (Ctrl+V)<br>"
            "   • Wytnij (Ctrl+X)<br>"
            "   • Włącz/Wyłącz tryb klawiaturowy"
        )
        instructions.setWordWrap(True)
        instructions.setStyleSheet("font-size: 10px; padding: 10px; background: #f0f0f0;")
        layout.addWidget(instructions)

        # Przycisk minimalizacji
        minimize_btn = QPushButton("⬇️ Minimalizuj do zasobnika")
        minimize_btn.setStyleSheet("""
            QPushButton {
                background-color: #4488ff;
                color: white;
                font-weight: bold;
                padding: 10px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #3366cc;
            }
        """)
        minimize_btn.clicked.connect(self.hide)
        layout.addWidget(minimize_btn)

        layout.addStretch()

    def setup_tray(self):
        """Konfiguracja ikony w zasobniku systemowym"""
        self.tray_icon = QSystemTrayIcon(self)

        # Stwórz prostą ikonę
        pixmap = QPixmap(64, 64)
        pixmap.fill(QColor(100, 150, 255))
        painter = QPainter(pixmap)
        painter.setPen(QPen(QColor(255, 255, 255), 8))
        painter.setFont(QFont("Arial", 36, QFont.Bold))
        painter.drawText(pixmap.rect(), Qt.AlignCenter, "M")
        painter.end()
        self.tray_icon.setIcon(QIcon(pixmap))

        # Menu
        tray_menu = QMenu()
        show_action = tray_menu.addAction("🖥️ Pokaż")
        show_action.triggered.connect(self.show)
        tray_menu.addSeparator()
        quit_action = tray_menu.addAction("❌ Zakończ")
        quit_action.triggered.connect(QApplication.quit)

        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()

    def setup_mouse_listener(self):
        """Uruchom nasłuchiwanie myszy"""
        self.mouse_controller = MouseController(self)
        self.mouse_listener = mouse.Listener(
            on_click=self.mouse_controller.on_click,
            on_scroll=self.mouse_controller.on_scroll
        )
        self.mouse_listener.start()

    def setup_dictation(self):
        """Konfiguracja managera dyktowania Deepgram/Windows"""
        self.dictation_manager = DictationManager(self)
        self.dictation_manager.text_received.connect(self.on_dictation_text)
        self.dictation_manager.status_changed.connect(self.on_dictation_status)

    def setup_tts(self):
        """Konfiguracja zaawansowanego TTS Managera"""
        self.tts_manager = TTSManager(self)
        self.tts_manager.speaking_finished.connect(self.on_tts_finished)
        self.tts_manager.speaking_status.connect(self.on_tts_status)
        # Ustaw prędkość i głos z global_state
        if hasattr(self.global_state, 'tts_speed'):
            self.tts_manager.set_speed(self.global_state.tts_speed)
        if hasattr(self.global_state, 'tts_voice_index'):
            self.tts_manager.set_voice(self.global_state.tts_voice_index)

    def setup_ocr(self):
        """Konfiguracja OCR Managera"""
        self.ocr_manager = OCRManager(self)
        self.ocr_manager.text_extracted.connect(self.on_ocr_text_extracted)
        self.ocr_manager.status_changed.connect(self.on_ocr_status)

    def on_tts_finished(self):
        """Handler dla zakończenia czytania"""
        self.global_state.speaking = False

    def on_tts_status(self, status):
        """Handler dla statusu TTS"""
        # Wyciszone - usuń komentarz poniżej aby włączyć logowanie TTS
        # print(f"[TTS] {status}")
        pass

    def on_ocr_text_extracted(self, text):
        """Handler dla wyciągniętego tekstu z OCR - automatycznie przeczytaj"""
        if text and text.strip():
            # Automatycznie przeczytaj wyciągnięty tekst
            self.speak_text(text)
        else:
            self.speak_text("Nie znaleziono tekstu w obrazie")

    def on_ocr_status(self, status):
        """Handler dla statusu OCR"""
        print(f"[OCR] {status}")

    def toggle_dictation(self):
        """Włącz/wyłącz dyktowanie"""
        if self.dictation_manager.is_running:
            self.dictation_manager.stop_dictation()
            self.global_state.dictation_active = False
            self.dictation_label.setText("🎤 Dyktowanie: Wyłączone")
            self.dictation_label.setStyleSheet("font-size: 12px;")
        else:
            self.dictation_manager.start_dictation()
            self.global_state.dictation_active = True
            self.dictation_label.setText("🎤 Dyktowanie: Włączone")
            self.dictation_label.setStyleSheet("font-size: 12px; color: #22aa22; font-weight: bold;")

    def on_dictation_text(self, text):
        """Handler dla rozpoznanego tekstu - wpisuje go w aktualnym miejscu kursora"""
        keyboard.write(text)

    def on_dictation_status(self, status):
        """Handler dla zmiany statusu dyktowania"""
        self.dictation_label.setText(f"🎤 {status}")
        print(f"[Dyktowanie] {status}")

    def display_radial_menu(self, x, y):
        """Wyświetl kołowe menu"""
        try:
            print(f"[MENU] display_radial_menu wywołane: ({x}, {y})")
            # Zamknij poprzednie menu jeśli istnieje
            if hasattr(self, 'radial_menu') and self.radial_menu:
                try:
                    self.radial_menu.close()
                    self.radial_menu.deleteLater()
                except:
                    pass
            
            self.radial_menu = RadialMenu(self)
            
            # Sprawdź granice ekranu i dostosuj pozycję
            screen = QApplication.primaryScreen().geometry()
            menu_size = 300
            menu_x = x - 150
            menu_y = y - 150
            
            # Upewnij się, że menu jest w granicach ekranu
            if menu_x < 0:
                menu_x = 0
            elif menu_x + menu_size > screen.width():
                menu_x = screen.width() - menu_size
            
            if menu_y < 0:
                menu_y = 0
            elif menu_y + menu_size > screen.height():
                menu_y = screen.height() - menu_size
            
            print(f"[MENU] Pozycja menu (skorygowana): ({menu_x}, {menu_y})")
            print(f"[MENU] Rozmiar ekranu: {screen.width()}x{screen.height()}")
            
            self.radial_menu.move(int(menu_x), int(menu_y))
            
            # Wymuś, aby menu było zawsze na wierzchu (nawet nad Chrome)
            self.radial_menu.setWindowFlags(
                Qt.FramelessWindowHint | 
                Qt.WindowStaysOnTopHint | 
                Qt.Tool |
                Qt.BypassWindowManagerHint |  # Ważne dla Chrome
                Qt.WindowDoesNotAcceptFocus
            )
            self.radial_menu.setAttribute(Qt.WA_AlwaysStackOnTop, True)
            
            # Wymuś widoczność - kilka metod dla pewności (ważne dla Chrome)
            self.radial_menu.show()
            self.radial_menu.raise_()  # Podnieś na wierzch
            self.radial_menu.activateWindow()  # Aktywuj okno
            self.radial_menu.setFocus()  # Ustaw focus
            self.radial_menu.repaint()  # Wymuś odświeżenie
            
            # Wymuś odświeżenie przez QApplication (ważne dla Chrome)
            QApplication.processEvents()
            
            # Dodatkowe wymuszenie po krótkiej pauzie (dla Chrome)
            def force_raise():
                time.sleep(0.05)  # Krótka pauza
                if hasattr(self, 'radial_menu') and self.radial_menu:
                    try:
                        self.radial_menu.raise_()
                        self.radial_menu.activateWindow()
                        QApplication.processEvents()
                    except:
                        pass
            
            threading.Thread(target=force_raise, daemon=True).start()
            
            print(f"[MENU] Menu wyświetlone i podniesione (na wierzchu Chrome)")
        except Exception as e:
            print(f"[MENU] Błąd wyświetlania menu: {e}")
            import traceback
            traceback.print_exc()

    def update_scroll_status(self, enabled):
        """Aktualizuj status trybu scroll"""
        status = "Włączony" if enabled else "Wyłączony"
        self.scroll_label.setText(f"⌨️  Scroll → Klawisze: {status}")

    def update_reading_status(self, enabled):
        """Aktualizuj status czytania"""
        status = "Włączone" if enabled else "Wyłączone"
        self.reading_label.setText(f"🔊 Czytanie tekstu: {status}")

    def speak_text(self, text):
        """Czytaj tekst na głos używając zaawansowanego TTS Managera (Speechify-like)"""
        if not self.global_state.reading_enabled:
            print("[TTS] Czytanie wyłączone - włącz w menu")
            return

        if not text or not text.strip():
            print("[TTS] Brak tekstu do czytania")
            return

        # Zatrzymaj poprzednie czytanie jeśli trwa
        if hasattr(self, 'tts_manager') and self.tts_manager.is_speaking:
            print("[TTS] Zatrzymywanie poprzedniego czytania...")
            self.tts_manager.stop()
            time.sleep(0.2)  # Krótka pauza

        # Użyj zaawansowanego TTS Managera
        if hasattr(self, 'tts_manager'):
            if not self.tts_manager.engine:
                print("[TTS] Reinicjalizacja silnika TTS...")
                self.tts_manager._init_engine()
            
            if self.tts_manager.engine:
                print(f"[TTS] Rozpoczynam czytanie (pyttsx3): {text[:50]}...")
                self.global_state.speaking = True
                self.tts_manager.speak(text)
            else:
                print("[TTS] Silnik TTS niedostępny - używam Windows SAPI fallback")
                # Fallback do podstawowego Windows SAPI
                self._fallback_speak(text)
        else:
            print("[TTS] TTS Manager niedostępny - używam Windows SAPI fallback")
            # Fallback do podstawowego Windows SAPI
            self._fallback_speak(text)
    
    def _fallback_speak(self, text):
        """Fallback do Windows SAPI"""
        try:
            text_clean = text.replace('"', '').replace("'", "")
            rate_adjust = int((self.global_state.tts_speed - 150) / 10) if hasattr(self.global_state, 'tts_speed') else 0
            cmd = f'Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = {rate_adjust}; $synth.Speak("{text_clean}")'
            subprocess.run(["powershell", "-Command", cmd], capture_output=True, timeout=30)
        except Exception as e:
            print(f"[TTS Fallback] Błąd: {e}")

    def start_dictation(self):
        """Otwórz notatnik do dyktowania"""
        try:
            # Otwórz notatnik
            subprocess.run(["notepad"], capture_output=True)
            time.sleep(1)

            # Uruchom dyktowanie Windows
            subprocess.run(["powershell", "-Command", "Start-WindowsSpeechRecognition"],
                         capture_output=True)

            self.speak_text("Notatnik otwarty. Możesz zacząć dyktować.")
        except:
            self.speak_text("Nie mozna uruchomic dyktowania")

    def start_cursor_dictation(self):
        """Uruchom dyktowanie bezpośrednio w miejscu kursora"""
        try:
            if self.global_state.reading_enabled:
                self.speak_text("Uruchamiam dyktowanie")

            # Spróbuj różnych metod dyktowania
            methods = [
                ["powershell", "-Command", "Start-WindowsSpeechRecognition"],
                ["control", "windows"]  # Win + R -> windows
            ]

            for method in methods:
                try:
                    subprocess.run(method, capture_output=True, timeout=5)
                    break
                except:
                    continue

            # Otwórz notatnik jako fallback do dyktowania
            subprocess.run(["notepad"], capture_output=True)
            if self.global_state.reading_enabled:
                self.speak_text("Otwarto notatnik do dyktowania")

        except Exception as e:
            if self.global_state.reading_enabled:
                self.speak_text("Nie mozna uruchomic dyktowania")
            print(f"Dictation error: {e}")

    def closeEvent(self, event):
        """Minimalizuj do zasobnika zamiast zamykać"""
        event.ignore()
        self.hide()
        self.tray_icon.showMessage(
            "Mouse Assistant",
            "Aplikacja działa w tle.\nKliknij ikonę aby otworzyć.",
            QSystemTrayIcon.Information,
            2000
        )


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    window = MainWindow()
    window.show()

    try:
        print("\n" + "="*50)
        print("Mouse Assistant uruchomiony!")
        print("="*50)
        print("\nFunkcje dostepne:")
        print("   - Kolowe menu (lewy + prawy przycisk)")
        print("   - Kopiuj/Wklej/Wytnij")
        print("   - Scroll -> Strzalki klawiatury")
        print("\nAplikacja dziala w tle. Minimalizuj okno aby ukryc.")
        print("="*50 + "\n")
    except UnicodeEncodeError:
        print("\n" + "="*50)
        print("Mouse Assistant started!")
        print("="*50)
        print("\nAvailable features:")
        print("   - Radial menu (left + right button)")
        print("   - Copy/Paste/Cut")
        print("   - Scroll -> Arrow keys")
        print("\nApp works in background. Minimize window to hide.")
        print("="*50 + "\n")

    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
