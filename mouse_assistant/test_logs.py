#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test logów aplikacji - sprawdza co nie działa"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

print("="*60)
print("TEST LOGÓW - Mouse Assistant")
print("="*60)

# Test 1: Importy
print("\n[TEST 1] Sprawdzanie importów...")
try:
    import mouse_assistant_simple
    print("✓ Import OK")
except Exception as e:
    print(f"✗ Błąd importu: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 2: Sprawdzanie dostępności bibliotek
print("\n[TEST 2] Sprawdzanie bibliotek...")
from mouse_assistant_simple import (
    PYTTSX3_AVAILABLE, 
    PYTESSERACT_AVAILABLE, 
    WEBSOCKETS_AVAILABLE,
    SOUNDDEVICE_AVAILABLE
)

print(f"  - pyttsx3: {'✓' if PYTTSX3_AVAILABLE else '✗ (używa fallback)'}")
print(f"  - pytesseract: {'✓' if PYTESSERACT_AVAILABLE else '✗ (OCR wyłączone)'}")
print(f"  - websockets: {'✓' if WEBSOCKETS_AVAILABLE else '✗'}")
print(f"  - sounddevice: {'✓' if SOUNDDEVICE_AVAILABLE else '✗'}")

# Test 3: TTS Manager
print("\n[TEST 3] Test TTS Managera...")
try:
    from PyQt5.QtWidgets import QApplication
    from mouse_assistant_simple import TTSManager
    
    app = QApplication(sys.argv)
    tts = TTSManager()
    
    if tts.engine:
        print(f"✓ TTS Engine zainicjalizowany")
        print(f"  - Głosy: {len(tts.voices)}")
        print(f"  - Prędkość: {tts.speed}")
    else:
        print("✗ TTS Engine NIE zainicjalizowany")
        print("  - Sprawdzam dlaczego...")
        tts._init_engine()
        if tts.engine:
            print("  ✓ Reinicjalizacja pomogła")
        else:
            print("  ✗ Reinicjalizacja nie pomogła")
            
except Exception as e:
    print(f"✗ Błąd TTS: {e}")
    import traceback
    traceback.print_exc()

# Test 4: Dictation Manager
print("\n[TEST 4] Test Dictation Managera...")
try:
    from mouse_assistant_simple import DictationManager
    
    dict_mgr = DictationManager()
    print(f"✓ DictationManager utworzony")
    print(f"  - API Key: {'✓' if dict_mgr.DEEPGRAM_API_KEY else '✗ (brak)'}")
    print(f"  - Running: {dict_mgr.is_running}")
    
except Exception as e:
    print(f"✗ Błąd Dictation: {e}")
    import traceback
    traceback.print_exc()

# Test 5: Test czytania
print("\n[TEST 5] Test czytania (TTS)...")
try:
    from mouse_assistant_simple import TTSManager
    from PyQt5.QtWidgets import QApplication
    
    if not QApplication.instance():
        app = QApplication(sys.argv)
    
    tts = TTSManager()
    if tts.engine:
        print("✓ Próbuję przeczytać testowy tekst...")
        test_text = "Test czytania"
        tts.speak(test_text)
        print("✓ Komenda speak() wykonana")
        print("  (Sprawdź czy słyszysz głos)")
    else:
        print("✗ TTS Engine niedostępny - nie można przetestować")
        
except Exception as e:
    print(f"✗ Błąd testu czytania: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*60)
print("TEST ZAKOŃCZONY")
print("="*60)
print("\nJeśli widzisz błędy powyżej, to one powodują problemy.")
print("Uruchom aplikację i sprawdź logi w konsoli.")
