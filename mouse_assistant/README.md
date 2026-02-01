# Mouse Assistant - Zaawansowane zarządzanie komputerem myszką

Aplikacja do zarządzania komputerem za pomocą myszki z funkcjami:
- **Dyktowanie Deepgram** (real-time STT z fallback na Windows offline)
- Transkrypcji mowy w polach tekstowych
- Kopiuj/Wklej jednym kliknięciem
- Obsługa klawiatury przez scroll myszy
- Kołowe menu dostępne po kliknięciu obu przycisków myszy

## Funkcje

### 1. Automatyczna transkrypcja mowy
- Kliknij w dowolne pole tekstowe aby aktywować transkrypcję
- Aplikacja automatycznie wykrywa pola tekstowe i zaczyna nasłuchiwać
- Mów normalnie - tekst pojawi się w polu automatycznie
- Obsługuje język polski

### 2. Kołowe menu (Radial Menu)
- **Aktywacja**: Kliknij jednocześnie lewy i prawy przycisk myszy
- Menu pojawia się wokół kursora z opcjami:
  - **Kopiuj** - Ctrl+C
  - **Wklej** - Ctrl+V
  - **Transkrypcja ON/OFF** - Włącz/wyłącz transkrypcję
  - **Zamknij** - Zamknij menu

### 3. Obsługa klawiatury scrollem
- Scroll w górę = Strzałka w górę
- Scroll w dół = Strzałka w dół
- Idealne do nawigacji w listach i menu

### 4. Szybkie kopiuj/wklej
- Dostępne przez kołowe menu jednym kliknięciem

## Konfiguracja Deepgram (opcjonalne, ale zalecane)

Deepgram oferuje najlepszą jakość rozpoznawania mowy w czasie rzeczywistym.

### Krok 1: Uzyskaj klucz API
1. Zarejestruj się na https://deepgram.com
2. Przejdź do Console → API Keys
3. Utwórz nowy klucz API

### Krok 2: Ustaw zmienną środowiskową
```powershell
# PowerShell (jednorazowo)
$env:DEEPGRAM_API_KEY = "twoj_klucz_api"

# Lub na stałe (Panel Sterowania → System → Zmienne środowiskowe)
# Dodaj: DEEPGRAM_API_KEY = twoj_klucz_api
```

### Bez Deepgram
Jeśli nie skonfigurujesz Deepgram lub nie ma internetu, aplikacja automatycznie przełączy się na Windows Speech Recognition.

---

## Instalacja

### Wymagania systemowe
- Windows 10/11
- Python 3.8 lub nowszy
- Mikrofon (do transkrypcji mowy)
- Połączenie internetowe (do Deepgram, opcjonalne)

### Krok 1: Instalacja Pythona
Jeśli nie masz Pythona, pobierz go z: https://www.python.org/downloads/

### Krok 2: Instalacja zależności

Otwórz PowerShell jako administrator i wykonaj:

```powershell
cd C:\Users\bogum\mouse_assistant
pip install -r requirements.txt
```

**Uwaga dla PyAudio**: Jeśli wystąpią problemy z instalacją PyAudio, użyj:
```powershell
pip install pipwin
pipwin install pyaudio
```

Alternatywnie, pobierz wheel dla PyAudio z:
https://www.lfd.uci.edu/~gohlke/pythonlibs/#pyaudio

### Krok 3: Uruchomienie

```powershell
python mouse_assistant.py
```

## Użytkowanie

### Pierwsze uruchomienie
1. Uruchom aplikację - pojawi się główne okno
2. Aplikacja automatycznie minimalizuje się do zasobnika systemowego
3. Ikona w zasobniku pokazuje że aplikacja jest aktywna

### Podstawowe operacje

#### Transkrypcja mowy:
1. Kliknij w dowolne pole tekstowe (np. Notatnik, Word, przeglądarka)
2. Zacznij mówić - tekst pojawi się automatycznie
3. Aby wyłączyć, użyj opcji w kołowym menu

#### Kołowe menu:
1. Kliknij jednocześnie lewy i prawy przycisk myszy
2. Poruszaj myszką aby wybrać opcję (element się podświetli)
3. Puść przyciski aby wykonać akcję

#### Tryb klawiaturowy:
- Scroll automatycznie symuluje strzałki
- Przydatne w menu, listach rozwijanych, etc.

### Zamykanie aplikacji
- Kliknij prawym przyciskiem na ikonie w zasobniku
- Wybierz "Zakończ"

## Rozwiązywanie problemów

### Transkrypcja nie działa
- Sprawdź czy mikrofon jest podłączony i włączony
- Sprawdź uprawnienia mikrofonu w ustawieniach Windows
- Upewnij się że masz połączenie internetowe

### Menu się nie otwiera
- Upewnij się że klikasz OBA przyciski jednocześnie
- Spróbuj kliknąć je w tym samym momencie

### Aplikacja nie uruchamia się
- Sprawdź czy wszystkie zależności są zainstalowane
- Uruchom jako administrator
- Sprawdź logi w konsoli

## Dostosowywanie

### Zmiana języka transkrypcji
W pliku `mouse_assistant.py`, linia 155:
```python
text = self.recognizer.recognize_google(audio, language='pl-PL')
```
Zmień `'pl-PL'` na inny język (np. `'en-US'` dla angielskiego)

### Zmiana elementów menu
W pliku `mouse_assistant.py`, linia 43-48, możesz dodać własne akcje:
```python
self.menu_items = [
    {"name": "Twoja akcja", "action": self.twoja_funkcja},
    # ... reszta elementów
]
```

## Architektura

```
mouse_assistant/
├── mouse_assistant.py      # Główna aplikacja
├── requirements.txt        # Zależności
└── README.md              # Ta dokumentacja
```

### Komponenty:
- **GlobalState**: Przechowuje stan aplikacji
- **RadialMenu**: Kołowe menu UI
- **TranscriptionWorker**: Moduł transkrypcji mowy
- **MouseController**: Obsługa zdarzeń myszy
- **MainWindow**: Główne okno i koordynacja

## Technologie

- **PyQt5**: Interfejs graficzny i kołowe menu
- **pynput**: Przechwytywanie zdarzeń myszy/klawiatury
- **Deepgram SDK**: Real-time Speech-to-Text (online)
- **SpeechRecognition**: Rozpoznawanie mowy (fallback offline)
- **keyboard**: Emulacja klawiatury
- **pywin32**: Dostęp do Windows API

## Licencja

Open source - użyj jak chcesz!

## Autor

Stworzone dla usprawnienia pracy z komputerem przy użyciu myszy.

## Wsparcie

W razie problemów sprawdź:
1. Czy Python jest zainstalowany poprawnie
2. Czy wszystkie zależności są zainstalowane
3. Czy aplikacja ma uprawnienia administratora
4. Czy mikrofon działa w innych aplikacjach
