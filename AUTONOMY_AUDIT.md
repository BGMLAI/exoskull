# AUTONOMY AUDIT — ExoSkull (2026-02-28)

> **Verdict: System nie dziala. Zero autonomicznych akcji dostarczonych userowi.**

---

## 0. EXECUTIVE SUMMARY

ExoSkull deklaruje 5 rownoleglych petli autonomii, 38 CRONow, self-building, self-optimization, dynamic skills.

**Rzeczywistosc:** System nie wygenerowal ani jednej aplikacji. Nie dostarczyl ani jednego skilla. Nie wykonal ani jednej autonomicznej interwencji ktora by zmienila cos w zyciu usera. 28k linii kodu, z ktorych 0 linii produkuje wartosc end-to-end.

---

## 1. ARCHITEKTURA AUTONOMII — CO TWIERDZI DOKUMENTACJA

5 petli, wspolna baza Supabase Postgres:

| Petla | Trigger | Deklarowany cel |
|-------|---------|-----------------|
| MAPE-K | loop-15 (15 min) | Monitor → Analyze → Plan → Execute → Knowledge |
| Ralph Loop | loop-15 (15 min) | Observe → Analyze → Build → Learn → Notify |
| Impulse Handler F | impulse (30 min) | Wykryj luki → auto-buduj aplikacje |
| Gap Detection | weekly (nd 09:00) | Skanuj 7 domen zycia → znajdz blind spoty |
| Dynamic Skills | daily (04:00) | Generuj nowe toole na potrzeby usera |
| Signal Triage | signal-triage (15 min) | Klasyfikuj sygnaly → routuj akcje |

**38 CRONow zadeklarowanych. ~50% to stuby/placeholdery.**

---

## 2. CO NAPRAWDE DZIALA — TABELA PRAWDY

| Komponent | Kod istnieje? | Wykonuje sie? | Produkuje efekt dla usera? | Dowod |
|-----------|:---:|:---:|:---:|-------|
| **MAPE-K Monitor** | TAK | TAK | NIE | Zbiera dane. Nikt ich nie uzywa |
| **MAPE-K Analyze** | TAK | TAK | NIE | Wykrywa issues. Nikt na nie nie reaguje |
| **MAPE-K Plan** | TAK | TAK | NIE | Planuje interwencje. Zapisuje do DB. Koniec |
| **MAPE-K Execute** | TAK | CZESCIOWO | NIE | Wymaga grant=autonomous. Domyslnie with_approval. User nie odpowiada na approval → nic sie nie dzieje |
| **MAPE-K Knowledge** | TAK | TAK | NIE | Szuka feedbacku. Nikt nie daje feedbacku. Pusta petla |
| **Ralph Loop Observe** | TAK | TAK | NIE | Czyta journal. Journal pusty (bo Build nic nie buduje) |
| **Ralph Loop Analyze** | TAK | TAK | NIE | Gemini Flash decyduje akcje. Najczesciej "none" (bo brak danych) |
| **Ralph Loop Build** | TAK | NIEJASNE | NIE | `buildEnhanced()` → ATLAS pipeline → brak dowodow na output |
| **Ralph Loop Learn** | TAK | TAK | NIE | Loguje do `exo_dev_journal`. Zero wpisow typu "build" w produkcji |
| **Impulse Handler F** | TAK | TAK | NIE | Jedyny komponent ktory NAPRAWDE wola `generateApp()`. Ale: hardcoded 5 typow, dedup blokuje po 1 probie, brak dowodow na wygenerowana app |
| **Gap Detection** | TAK | TAK | NIE | Wykrywa luki → SMS. **Nie triggeruje zadnej akcji** |
| **Dynamic Skills** | TAK | TAK | NIE | Pipeline produkuje kod. Kod nigdy nie zostal uzyty. 0 skilli w `exo_generated_skills` |
| **Signal Triage** | TAK | TAK | NIE | Klasyfikuje → czeka na approval → nikt nie zatwierdza |
| **Self-Modification** | TAK | NIE | NIE | VPS offline. Source engine martwy |
| **Guardian** | TAK | NIE | NIE | Nigdy nie zablokowal zadnej akcji. Zero evidence |
| **App Builder** | TAK | TAK (backendowo) | NIE | `generateApp()` istnieje. Canvas `AppWidget` istnieje. **Zero aplikacji w `exo_generated_apps` w produkcji** |
| **Morning Briefing** | TAK | PRAWDOPODOBNIE | MOZE | Wysyla SMS. Brak delivery tracking. Nie wiadomo czy dociera |
| **Evening Reflection** | TAK | PRAWDOPODOBNIE | MOZE | j.w. |
| **Proactive Notifications** | TAK | TAK | SLEPO | Wysyla SMS bez weryfikacji dostarczenia |

**Podsumowanie: 18 komponentow. 0 dostarcza wartosc end-to-end.**

---

## 3. DLACZEGO NIC NIE DZIALA — ROOT CAUSES

### 3.1 Brak wiring miedzy warstwami

Kazda warstwa dziala w izolacji. Brak "last mile delivery":

```
Gap Detection WYKRYWA luke
    ↓ (zapisuje do learning_events)
MAPE-K CZYTA gapy (ale z exo_proactive_log, NIE z learning_events)
    ↓ (chain przerwany — czyta z innej tabeli)
App Builder MOGLBY zbudowac app
    ↓ (nikt go nie wola)
Canvas MOGLBY wyswietlic widget
    ↓ (brak danych do wyswietlenia)
User NIE WIDZI NIC
```

```
Dynamic Skills Generator PRODUKUJE kod
    ↓ (zapisuje do exo_skills)
Cache invalidation wywoywana
    ↓ (5min TTL — race condition)
IORS Agent MOGLBY uzyc skilla
    ↓ (ale 0 skilli w tabeli w produkcji)
User NIE MA nowych funkcji
```

```
Ralph Loop ANALIZUJE stan
    ↓ (Gemini Flash decyduje "none" — bo brak danych do analizy)
System NIC nie buduje
    ↓ (loguje "skipped" do exo_dev_journal)
Kolejny cykl czyta journal → widzi "skipped" → decyduje "none"
    ↓ (DEATH SPIRAL — system sam siebie convincuje ze nie ma nic do roboty)
```

### 3.2 Permission deadlock

```
Domyslne granty = with_approval
    ↓
System proponuje interwencje → czeka na approval
    ↓
User nie widzi propozycji (bo dashboard nie jest codziennym interfejsem)
    ↓
Auto-timeout = zgoda? Moze. Ale interwencja juz straciala sens (np. "przeloz jutrzejsze spotkanie" — jutro juz minelo)
    ↓
System loguje "timeout_approved" → Execute → ale akcja jest bezuzyteczna
    ↓
Knowledge faza widzi "low effectiveness" → obniza proactivity level
    ↓
System staje sie jeszcze mniej aktywny (SECOND DEATH SPIRAL)
```

### 3.3 Brak koordynacji miedzy petlami

5 niezaleznych petli, 0 orchestratora:

| Sytuacja | Co sie dzieje |
|----------|---------------|
| Gap Detection wykrywa "brak mood tracking" | Zapisuje do `learning_events`. MAPE-K czyta z `exo_proactive_log`. **Rozne tabele — chain przerwany** |
| Impulse Handler F wykrywa te sama luke | Probuje `generateApp()`. Dedup moze zablokowac (jesli gap detection juz zalogowala probe). Albo NIE blokuje (bo loguje do innej tabeli) — **duplikat** |
| Ralph Loop tez widzi luke | Planuje build_app. Ale Impulse juz probowal i sfailowal. Ralph nie wie — **powtarza blad** |

### 3.4 App Builder — dlaczego 0 aplikacji

`generateApp()` w `lib/apps/generator/app-generator.ts` DZIALA technicznie:
1. AI generuje JSON spec ✅
2. Walidacja schema ✅
3. Zapis do `exo_generated_apps` ✅
4. Auto-activate → `create_app_table()` RPC ✅
5. Widget registration ✅
6. SMS notification ✅

**ALE:** Nikt go nie wola w produkcji. Impulse Handler F jest jedynym automatycznym callerem. Handler F ma hardcoded 5 gap types + dedup 14 dni. Jesli pierwsza proba sfailuje (np. AI hallucinate zly schema, RPC timeout, Supabase rate limit) → dedup blokuje na 14 dni → koniec.

**Zero retry logic. Zero error recovery. Jeden fail = 14 dni ciszy.**

### 3.5 VPS Executor — martwy komponent

- OVH VPS `57.128.253.15:3500` — prawdopodobnie offline
- Circuit breaker tripuje po 3 health checkach
- **Nigdy sie nie resetuje sam**
- Self-Modification source engine wymaga VPS do sandboxowania
- VPS offline → self-modification niemozliwa → Ralph `evolve_source` zawsze failuje

### 3.6 Circular AI trust

```
AI (Gemini Flash) decyduje CO zbudowac
    ↓
AI (Claude/Codex) GENERUJE kod
    ↓
AI (risk assessor) OCENIA ryzyko wygenerowanego kodu
    ↓
AI (Guardian) WERYFIKUJE czy interwencja jest korzystna
    ↓
ZERO human-in-the-loop dla low-risk decisions
    ↓
Ale system i tak nic nie buduje — wiec ten risk jest teoretyczny
```

---

## 4. CO NAPRAWDE DZIALA END-TO-END (z perspektywy usera)

| Funkcja | Dziala? | Dowod |
|---------|---------|-------|
| Chat z AI (jesli env vars OK) | TAK | API → Anthropic → SSE → UI |
| SMS morning briefing | PRAWDOPODOBNIE | CRON → AI → Twilio → SMS (brak delivery tracking) |
| SMS evening reflection | PRAWDOPODOBNIE | j.w. |
| Login/auth | TAK | Supabase SSR |
| Upload dokumentow → embeddings | TAK | Upload → chunk → embed → pgvector |
| Theme switching | TAK | 4 themes, localStorage |
| 3D Mindmap | TAK | dagMode, labels |
| **Autonomiczna budowa aplikacji** | **NIE** | **Pipeline exists, 0 apps built** |
| **Autonomiczna generacja skilli** | **NIE** | **Pipeline exists, 0 skills deployed** |
| **Proaktywne interwencje** | **NIE** | **System proponuje, nikt nie wykonuje** |
| **Gap detection → akcja** | **NIE** | **Wykrywa, nie reaguje** |
| **Self-optimization** | **NIE** | **Obserwuje, nie modyfikuje** |
| **Self-modification** | **NIE** | **VPS offline** |

---

## 5. KONKRETNY PRZYKLAD: "ZBUDUJ MOOD TRACKER"

Sciezka deklarowana w dokumentacji:
```
1. Gap Detection wykrywa "user nie loguje nastroju" (nd 09:00)
2. MAPE-K planuje interwencje "build mood_tracker app"
3. Ralph Loop/Impulse wywoluje generateApp()
4. App Builder: JSON spec → DB table → Canvas widget
5. User widzi mood tracker na dashboardzie
6. System wysyla SMS: "Zbudowalem Ci tracker nastroju!"
```

Co sie naprawde dzieje:
```
1. Gap Detection wykrywa luke → zapisuje do learning_events → SMS: "Nie rozmawialismy o nastroju" → KONIEC
2. MAPE-K czyta exo_proactive_log (NIE learning_events) → NIE WIDZI GAPU → NIC
3. Impulse Handler F sprawdza hardcoded gapy → mood_tracker_app jest na liscie → PROBUJE
4. generateApp() → AI generuje spec → JAKIKOLWIEK BLAD (timeout, zly schema, RPC fail)
5. Error zalogowany → dedup wpisany na 14 dni → Handler F wiecej nie proobuje
6. Ralph Loop widzi gap → Gemini Flash → "none" (bo brak danych/kontekstu)
7. Kolejne 14 dni → NIC SIE NIE DZIEJE
8. Po 14 dniach dedup wygasa → Handler F probuje znowu → ten sam blad
9. PETLA SMIERCI
```

---

## 6. CO TRZEBA NAPRAWIC (priorytet)

### Tier 1 — Bez tego ZERO wartosci (1-3 dni)

| # | Fix | Efekt |
|---|-----|-------|
| 1 | **Ujednolicic tabele** — Gap Detection, MAPE-K, Impulse musza czytac/pisac do TEJ SAMEJ tabeli | Koniec rozlaczonych chainow |
| 2 | **App Builder retry + error recovery** — 3 retry z exponential backoff, nie 1 proba + 14 dni blokady | Aplikacje faktycznie sie buduja |
| 3 | **Domyslne granty = autonomous** dla bezpiecznych akcji (message, app:generate, goal:create) | System moze dzialac bez approval deadlocku |
| 4 | **End-to-end smoke test** — jeden CRON co 24h ktory PROBUJE zbudowac test app i weryfikuje czy widget renderuje | Wiadomo czy pipeline dziala |

### Tier 2 — Bez tego system jest slepy (3-7 dni)

| # | Fix | Efekt |
|---|-----|-------|
| 5 | **SMS delivery tracking** — Twilio status callback → loguj dostarczenie | Wiadomo czy cos dociera |
| 6 | **Centralny orchestrator** — jeden koordynator ktory widzi co robia wszystkie petle | Koniec duplikatow i race conditions |
| 7 | **Ralph Loop death spiral fix** — jesli 5x "none" → escalate, nie zasypiaj | System nie zasypia |
| 8 | **VPS deploy albo usun** — albo uruchom serwer, albo wywal martwy kod | Porzadek |

### Tier 3 — Jakoscowe (7-14 dni)

| # | Fix | Efekt |
|---|-----|-------|
| 9 | Dynamic Skills → human gate na WSZYSTKIE (nie tylko high-risk) | Bezpieczenstwo |
| 10 | Idempotency na CRONach — checkpoint-based execution | Odpornosc na timeouty |
| 11 | Fairness w tenant processing — round-robin, nie sequential | Rowna obsluga tenantow |
| 12 | User-facing audit log — "co system zrobil dzisiaj" | Transparentnosc |

---

## 7. WERDYKT

**Architektura jest ambitna i dobrze zaprojektowana na papierze.**

**Implementacja kazdej warstwy jest solidna w izolacji.**

**Problem: warstwy nie sa ze soba polaczone. System to 18 dzialajacych komponentow ktore nie tworza jednego produktu.**

**Analogia:** Fabryka samochodow gdzie:
- Hala A produkuje silniki ✅
- Hala B produkuje karoserie ✅
- Hala C produkuje kola ✅
- Hala D produkuje elektronike ✅
- **Nikt nie sklada samochodow** ❌
- **Klient dostaje pusty parking** ❌

**System potrzebuje nie wiecej warstw, ale WIRING — polaczenia istniejacych komponentow w end-to-end flow.**

---

## 8. REAL-WORLD UX FAILURE — TRANSCRIPT ANALYSIS (2026-02-28 wieczor)

**Scenariusz:** User wgral PNG ze screenshotem danych dostepu OVH VPS. Agent mial odczytac IP, login, haslo.

### Co sie stalo

```
PROBA 1: User wgral PNG → Agent: "ekstrakcja tekstu niedostepna, wklej tekstowo"
PROBA 2: User: "juz ci wgralem" → Agent: "PNG nie jest przetwarzany, wklej tekstowo"
PROBA 3: User: "uzyj OCR" → Agent: "aplikacja OCR pusta, wgraj jeszcze raz"
PROBA 4: User: "zmien tak zebym nie musial" → Agent: "wklej 3 linijki tekstu"
PROBA 5: User wgral ponownie → Agent: "system nie przetwarza PNG, wklej tekstowo"
PROBA 6: User: "to zrob inna aplikacje" → Agent: "build_app nie procesuje obrazow"
PROBA 7: User: "a nie mozesz w VPS?" → Agent: "nie mam danych logowania"
PROBA 8: User: "gdzie generowales wczesniej?" → Agent: "w ExoSkull przez build_app"
PROBA 9: User: "a GENERATE APP?" → Agent stworzyl pusta "OCR Text Extractor"
PROBA 10: User: "NIE MAM DASHBOARDU" → Agent: "wgraj w czacie"
PROBA 11: User wgral ponownie → Agent: "PNG zablokowane po stronie platformy, wklej tekst"
PROBA 12: User: "TO ZROB INNA APLIKACJE" → Agent: timeout, "zadna aplikacja nie odczyta PNG"
```

### Root Causes tego konkretnego failure

| Przyczyna | Wplyw |
|-----------|-------|
| **Brak Vision API** | Claude ma multimodal capability — system go nie uzywa |
| **Brak OCR integracji** | Tesseract, Google Vision, AWS Textract — zero z nich zintegrowane |
| **build_app = tworzy tabele, nie apki** | "OCR app" = formularz DB, nie procesowanie obrazow |
| **Zero adaptacji strategii** | 12 prob → ta sama odpowiedz "wklej tekst" |
| **Hallucynacja UI** | Agent referuje do "dashboardu", "widgetow" ktore nie istnieja |
| **Brak self-awareness** | Agent nie wie co potrafi a czego nie potrafi |

### Wnioski dla redesignu

1. **Agent MUSI miec Vision capability** — Claude 3.5+ rozumie obrazy natywnie
2. **build_app musi generowac LOGIKE, nie tylko tabele** — albo zmienic nazwe na "create_form"
3. **Max 2 powtorzenia tej samej strategii** — po 2x failure → automatycznie inna droga
4. **Agent musi weryfikowac co istnieje** — zanim powie "wgraj na dashboard", sprawdz czy dashboard istnieje
5. **Self-assessment capability** — agent musi wiedziec co umie, czego nie umie, i co moze zbudowac

### Wplyw na uzytkownika

> *"to jest dla was ostatnia szansa. jak teraz nie wymyslicie jak zrobic zeby applikacja dzialala to pale projekt"*
>
> *"a moze napisac wszystko od nowa zamiast probowac sie odnalezc w tym gownie?"*

User rozważa:
- Przejście na OpenClaw
- Rewrite from scratch
- Porzucenie projektu

---

*Audit przeprowadzony: 2026-02-28*
*Metoda: Code-level trace kazdego lancucha autonomii + real-world UX transcript analysis*
*Pliki przeanalizowane: ~40 plikow .ts (MAPE-K, Ralph, Impulse, Gap Detection, Skills, Signal Triage, App Builder, Source Engine, Permissions, Proactive)*
*Transcript: OCR failure (12 prob, zero sukcesu)*
