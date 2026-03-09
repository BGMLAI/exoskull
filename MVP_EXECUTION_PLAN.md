# ExoSkull MVP — Plan Wykonawczy dla Następnej Sesji Claude

**Cel:** Strona exoskull.xyz GOTOWA do prezentacji inwestorom i pierwszym userom MVP
**Deadline:** 2026-03-04 10:00 CET (user śpi 05:20→10:00)
**Źródło decyzji:** `PRODUCT_DECISIONS_v1.md`
**Status obecny:** Chat działa (wolno), 33 V3 tools, 4 CRONy, deploy na Vercel

---

## PRIORYTET: CO MUSI BYĆ GOTOWE NA 10:00

### P0 — KRYTYCZNE (bez tego nie ma prezentacji)
1. ✅ Chat działa (jest, ale wolny)
2. [ ] Chat SZYBKI — smart routing (proste→Gemini <1s, złożone→Claude async)
3. [ ] Pełny reasoning widoczny (co agent MYŚLI, nie "sprawdzanie kontekstu" x5)
4. [ ] Voice dictation działa (przycisk mikrofonu, Gboard-style)
5. [ ] Upload plików działa (drag-drop, bez limitu, presigned)
6. [ ] Cele i zadania działają (goals + tasks via current DB, graph migration PÓŹNIEJ)
7. [ ] Przynajmniej 1 demo app zbudowana przez AI (build_app)
8. [ ] Landing page polished (exoskull.xyz wygląda profesjonalnie)
9. [ ] E2E: user pisze → agent odpowiada → pamięta → realizuje cel

### P1 — WAŻNE (demo wartość)
10. [ ] Voice real-time conversation (Gemini Live lub Deepgram+TTS)
11. [ ] Email: inbox sync + klasyfikacja (Gmail)
12. [ ] 2-3 kanały działają (web + SMS + Telegram lub WhatsApp)
13. [ ] Autonomiczny heartbeat robi coś KONKRETNEGO (sprawdza deadline'y, maile)
14. [ ] Self-extend: agent generuje skill na żądanie

### P2 — NICE TO HAVE (wow factor)
15. [ ] Wake word "IORS" w przeglądarce
16. [ ] Shared workspace (wirtualna przeglądarka) — nawet jako POC
17. [ ] Waveform vizualizacja audio
18. [ ] Gamifikacja (streak counter)

---

## KROK PO KROKU — WYKONANIE

### FAZA 0: Infrastruktura testowa (30 min)

#### 0.1 Nowy numer Twilio do testów
```bash
# Użyj Twilio API do zakupu numeru (konto bgml, SID w .env.local jako TWILIO_ACCOUNT_SID)
# Twilio auth token jest w .env.local jako TWILIO_AUTH_TOKEN
# Kup numer polski lub US — najtańszy dostępny
# Skonfiguruj webhook na: https://exoskull.xyz/api/sms/inbound
```

#### 0.2 Email testowy na OVH
```bash
# OVH panel: https://www.ovh.com/manager/
# User ma konto OVH — sprawdź czy ma domenę exoskull.xyz lub inną
# Załóż mailbox: test@exoskull.xyz lub test@[domena]
# Alternatywnie: użyj istniejącego Gmaila do testów IMAP
```

#### 0.3 Sprawdź i uzupełnij .env.local
```
Wymagane klucze:
- ANTHROPIC_API_KEY (sprawdź saldo!)
- GOOGLE_AI_API_KEY (Gemini — fallback)
- OPENAI_API_KEY (embeddings)
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
- RESEND_API_KEY (email outbound)
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- CRON_SECRET
- FIRECRAWL_API_KEY (URL import)
- TAVILY_API_KEY (web search)
```

### FAZA 1: Napraw Chat Speed (1h)

#### 1.1 Smart Model Routing
Plik: `exoskull-app/lib/v3/agent.ts`
- Dodaj klasyfikację zapytania PRZED wywołaniem Claude
- Proste pytania ("jak się masz", "co potrafisz") → Gemini Flash (<1s, bez tools)
- Złożone (cele, pamięć, budowanie) → Claude Sonnet (z tools)
- Gemini routing: `lib/v3/gemini-router.ts` (nowy plik)

#### 1.2 Async Fallback
- Jeśli response >5s → natychmiast wyślij "Pracuję nad tym..."
- Kontynuuj w tle → wynik pojawia się jako nowa wiadomość
- Plik: `exoskull-app/app/api/chat/stream/route.ts`

#### 1.3 Reasoning Display
- Zamiast "Sprawdzam kontekst..." → pokaż CO agent myśli
- Nowy SSE event: `thinking` z treścią reasoning
- Plik: `exoskull-app/components/chat/` — dodaj ThinkingBlock komponent
- Collapsible: jedno zdanie widoczne, klik rozwija pełny reasoning

### FAZA 2: Voice Dictation (1h)

#### 2.1 Przycisk mikrofonu (Gboard-style)
- Plik: `exoskull-app/components/chat/ChatInput.tsx` (lub odpowiednik)
- Browser SpeechRecognition API (darmowe, pl-PL)
- Słowa pojawiają się w input area w czasie rzeczywistym
- Auto-submit po 1.5s ciszy (VAD)

#### 2.2 Waveform Visualization
- Zaawansowany waveform z gradient colors + glow
- Plik: nowy komponent `components/voice/WaveformVisualizer.tsx`
- Używa Web Audio API (AnalyserNode)

#### 2.3 Wake Word "IORS" (opcjonalnie)
- Porcupine Wake Word SDK (browser) lub prosty keyword spotting
- Aktywacja → rozpoczyna nagrywanie
- Minimalizacja: voice overlay → widget w rogu

### FAZA 3: Upload Plików (30 min)

#### 3.1 Drag-drop na input area
- Plik: `exoskull-app/components/chat/ChatInput.tsx`
- onDragOver/onDrop → presigned upload do R2
- Symbol spinacza, progress bar
- Bez limitu rozmiaru (presigned)

#### 3.2 Folder upload
- `<input webkitdirectory>` + drag-drop folder
- Rekursywnie przetwarza każdy plik

### FAZA 4: Cele i Zadania (30 min)

#### 4.1 Sprawdź obecne V3 tools
- `set_goal`, `update_goal`, `get_goals` → testuj każdy
- `create_task`, `update_task`, `get_tasks` → testuj każdy
- Sprawdź czy działają na żywo (Playwright → exoskull.xyz → chat)

#### 4.2 Napraw jeśli nie działają
- V3 tools: `lib/v3/tools/goal-tools.ts`
- Tabele: `user_loops` (goals), `user_ops` (tasks)
- Slug generation, fuzzy search

### FAZA 5: Build App Demo (1h)

#### 5.1 Przetestuj build_app
- Chat: "Zbuduj aplikację do śledzenia nawyków: nazwa, częstotliwość, streak counter"
- Sprawdź czy generuje: DB table + API route + UI widget
- Plik: `lib/v3/tools/builder-tools.ts`

#### 5.2 Zbuduj 2-3 demo appki
- Habit Tracker (nawyki)
- Expense Tracker (wydatki)
- Reading List (lista lektur)
- Każda ma działać i być widoczna w /apps

#### 5.3 Napraw jeśli build_app nie działa
- Sprawdź pipeline: AI spec → validate → DB table → API → widget
- Sprawdź czy Supabase service role key ma uprawnienia do CREATE TABLE

### FAZA 6: Test WSZYSTKICH 33 V3 Tools (1h)

Testuj przez Playwright headless → exoskull.xyz → chat:

#### Brain Tools
- [ ] `search_brain` — "Co wiesz o mnie?"
- [ ] `remember` — "Zapamiętaj: lubię Rust"
- [ ] `log_note` — "Zanotuj: pomysł na app"
- [ ] `get_daily_summary` — "Podsumuj mój dzień"
- [ ] `correct_daily_summary` — "Dodaj do podsumowania: spotkanie o 14"
- [ ] `analyze_emotional_state` — "Jestem zestresowany pracą"
- [ ] `learn_pattern` — (wywoływany automatycznie)
- [ ] `get_thread_context` — (wewnętrzny)

#### Knowledge Tools
- [ ] `search_knowledge` — "Szukaj w mojej bazie wiedzy: ExoSkull"
- [ ] `import_url` — "Zaimportuj https://en.wikipedia.org/wiki/Exoskeleton"
- [ ] `list_documents` — "Pokaż moje dokumenty"
- [ ] `get_document_content` — "Pokaż treść ostatniego dokumentu"
- [ ] `search_web` — "Wyszukaj w internecie: AI agents 2026"
- [ ] `fetch_url` — "Odczytaj stronę https://example.com"

#### Goal Tools
- [ ] `set_goal` — "Cel: Nauczyć się Rust w 30 dni, priorytet 9"
- [ ] `update_goal` — "Mam 30% postępu w Rust"
- [ ] `get_goals` — "Pokaż moje cele"
- [ ] `create_task` — "Zadanie: Przejść tutorial Rust"
- [ ] `update_task` — "Oznacz tutorial jako ukończony"
- [ ] `get_tasks` — "Pokaż moje zadania"

#### Autonomy Tools
- [ ] `enqueue_action` — "Zaplanuj sprawdzenie maili za godzinę"
- [ ] `check_permissions` — "Jakie masz uprawnienia?"
- [ ] `send_notification` — "Wyślij mi powiadomienie: test"
- [ ] `log_autonomy` / `get_autonomy_log` — "Pokaż log autonomii"

#### Builder Tools
- [ ] `build_app` — "Zbuduj aplikację do śledzenia nawyków"
- [ ] `generate_content` — "Napisz post na LinkedIn o AI"
- [ ] `self_extend` — "Dodaj umiejętność: pomodoro timer"

#### Channel Tools
- [ ] `send_sms` — "Wyślij SMS na mój numer: test E2E"
- [ ] `send_email` — "Wyślij email na test@...: test E2E"
- [ ] `make_call` — "Zadzwoń na mój numer: test E2E"

#### Evolution Tools
- [ ] `get_capabilities` — "Jakie masz zdolności?"
- [ ] `reflexion_evaluate` — "Oceń swoją ostatnią interakcję"

#### Vision Tools
- [ ] `analyze_image` — (upload screenshot → "Co widzisz?")
- [ ] `extract_text_from_image` — (upload image z tekstem → "Odczytaj tekst")

#### Other
- [ ] `send_whatsapp` — "Wyślij WhatsApp: test" (jeśli skonfigurowany)
- [ ] `send_messenger` — (jeśli skonfigurowany)

### FAZA 7: E2E Workflow Tests (1h)

Playwright headless → exoskull.xyz:

#### W1: Pełny cykl celu
1. Login → "Chcę nauczyć się TypeScript w 30 dni"
2. Agent tworzy cel + 3 zadania
3. "Ukończyłem pierwszy tutorial"
4. Agent aktualizuje postęp
5. "Pokaż moje cele" → widać postęp
6. Screenshot → PASS/FAIL

#### W2: Pamięć i recall
1. "Zapamiętaj: mój ulubiony framework to Next.js"
2. Nowa wiadomość: "Jaki jest mój ulubiony framework?"
3. Agent odpowiada "Next.js"
4. Screenshot → PASS/FAIL

#### W3: Build app
1. "Zbuduj aplikację do śledzenia wydatków: kategoria, kwota, data"
2. Agent generuje app
3. Sprawdź czy widget pojawia się
4. Screenshot → PASS/FAIL

#### W4: Voice dictation
1. Aktywuj mikrofon
2. Powiedz coś (lub symuluj audio)
3. Tekst pojawia się w input
4. Screenshot → PASS/FAIL

#### W5: Email (jeśli skonfigurowany)
1. "Wyślij email na [test@...]: Cześć, to test ExoSkull"
2. Sprawdź response z SID/ID
3. Screenshot → PASS/FAIL

#### W6: SMS
1. "Wyślij SMS na +48607090956: E2E test ExoSkull"
2. Sprawdź response z SID
3. Screenshot → PASS/FAIL

#### W7: Autonomy
1. "Chcę żebyś co godzinę sprawdzał moje deadline'y"
2. Agent enqueue'uje akcję
3. Sprawdź DB: exo_autonomy_queue
4. Screenshot → PASS/FAIL

#### W8: Knowledge import
1. "Zaimportuj https://en.wikipedia.org/wiki/Exoskeleton"
2. Czekaj na import
3. "Co wiesz o exoskeletons z mojej bazy?"
4. Agent zwraca treść z importu
5. Screenshot → PASS/FAIL

### FAZA 8: Landing Page Polish (30 min)

#### 8.1 Sprawdź landing page
- Playwright → exoskull.xyz (niezalogowany)
- Screenshot → sprawdź czy wygląda profesjonalnie
- Czy jest: hero, opis, pricing, CTA "Zarejestruj się"

#### 8.2 Popraw jeśli trzeba
- Polskie teksty, bez lorem ipsum
- Jasny value prop: "Twój drugi mózg. Autonomiczny AI agent."
- CTA prowadzące do rejestracji

### FAZA 9: Deploy & Verify (30 min)

#### 9.1 Build check
```bash
cd exoskull-app && npm run build
```
Napraw błędy TypeScript jeśli są.

#### 9.2 Deploy
```bash
git add [specific files]
git commit -m "feat: MVP polish — smart routing, voice, upload, reasoning display"
git push v3-origin v3:main
```
Czekaj na Vercel build (2-3 min).

#### 9.3 Final E2E na produkcji
- Playwright → exoskull.xyz
- Login → chat → cel → pamięć → app builder
- Screenshot każdego kroku
- Porównaj z briefem → PASS/FAIL

### FAZA 10: Raport (15 min)

#### 10.1 Zapisz wyniki
- Screenshots w `e2e-mvp-*.png`
- `SESSION_LOG.md` z wynikami
- `CHANGELOG.md` z listą zmian

#### 10.2 Powiadom usera
- Dźwięk: `notify-claude-attention.ps1`
- Otwórz exoskull.xyz w przeglądarce usera: `start https://exoskull.xyz`

---

## KLUCZE DO SUKCESU

1. **NIE próbuj budować graph DB, shared workspace, wake word w tej sesji** — to są multi-day features
2. **SKUP SIĘ na tym co JEST i napraw** — chat speed, tool display, voice dictation
3. **Demo > Perfekcja** — lepiej 80% działające niż 20% idealne
4. **Testuj NA PRODUKCJI** — nie lokalnie, bo user chce zobaczyć exoskull.xyz
5. **Git push CZĘSTO** — po każdej działającej zmianie, nie na końcu

## ZNANE PROBLEMY DO NAPRAWIENIA

1. Chat za wolny — 55s timeout, za dużo tool call powtórzeń
2. Tool display: "Sprawdzam kontekst..." powtarza się — trzeba pełny reasoning
3. Anthropic credits mogą być na wyczerpaniu — Gemini fallback MUSI działać
4. `user_loops` wymaga `slug` — auto-generate z nazwy (NFD strip)
5. Voice może nie działać na produkcji — sprawdź HTTPS + mikrofon permissions

## WAŻNE PLIKI

| Plik | Rola |
|------|------|
| `lib/v3/agent.ts` | Główny agent pipeline (web chat) |
| `lib/v3/tools/` | 7 plików z 33 narzędziami |
| `app/api/chat/stream/route.ts` | Chat SSE endpoint |
| `components/chat/` | UI czatu |
| `app/api/v3/cron/` | 4 CRONy |
| `lib/v3/tools/builder-tools.ts` | App builder |
| `lib/v3/tools/channel-tools.ts` | SMS, email, call |
| `.env.local` | Wszystkie klucze API |
| `PRODUCT_DECISIONS_v1.md` | Pełna lista decyzji produktowych |
