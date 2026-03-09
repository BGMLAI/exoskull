# ExoSkull — Product Decisions v1.0
## Data: 2026-03-04 | Źródło: User Review (446 items) + 2 tury pytań doprecyzowujących

---

## PODSUMOWANIE KLUCZOWYCH DECYZJI

### Architektura UI: Split Workspace
- **Lewa strona:** Chat / Unified Stream (widget)
- **Środek dolny:** Input area
- **Prawa strona:** Wspólny Workspace — wirtualna przeglądarka (CDP + WebRTC z VPS), rozwijane linki/pliki, wizualna prezentacja
- **Mobile:** Chat-first, workspace otwiera się gdy agent coś pokazuje (auto-switch)

### Architektura Danych: Data Lake + Graph
- **Data Lake:** Bronze/Silver/Gold (już zaprojektowane) — WSZYSTKO wpada do data lake
- **Graph DB:** pgvector + graph w Postgres (nodes + edges) — cele, zadania, notatki, #hashtagi jako węzły
- **#Hashtagi:** Jednocześnie tag + semantyczny klucz + node w grafie wiedzy. Wielokrotne zagnieżdżanie
- **Tyrolka WYRZUCONA:** user_loops, user_campaigns, user_quests, user_ops → zastąpione przez graph nodes z typami

### Architektura Agenta: Tenant Isolation
- **Platform core** (NIEMODYFIKOWALNE): auth, billing, middleware, agent engine, security, DB migrations, infra
- **Tenant instance** (modyfikowalne przez agenta): skills, UI, config, prompty, nowe API routes (sandbox), wygenerowane apps
- **Model:** Parent (platforma) / Child (instancja IORS per user)

---

## A. CHAT & KONWERSACJA

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| A1 | Pokazuj co agent MYŚLI | Pełny reasoning widoczny (jak Claude thinking blocks). NIE powtarzaj "sprawdzanie kontekstu" |
| A2 | Chat + kanały razem | Wiadomości z wszystkich kanałów w jednym thread. Powiadomienia systemowe OSOBNO (sidebar/workspace) |
| A3 | Kontekstowe sugestie | AI generuje dynamiczne sugestie bazowane na celach usera (nie gotowe szablony) |
| A4 | Smart routing + async | Proste → Gemini Flash <1s. Złożone → Claude async z powiadomieniem. Fallback po >5s |
| A5 | Pause/resume ZOSTAJE | Tryb "nie przeszkadzaj" — agent nie wysyła proaktywnych, ale odpowiada gdy user pisze |
| A6 | Adaptacyjna detekcja języka | Każda wiadomość analizowana. User może przełączać język pisząc w innym |
| A7 | USUNIĘTE: suggestion chips | Quick suggestion chips niepotrzebne (zastąpione kontekstowymi) |
| A10 | Drag-drop na input area | Nie na całe okno czatu — na pole wprowadzania wiadomości z symbolem spinacza |
| A12 | Błędy po polsku | Komunikaty błędów zawsze po polsku niezależnie od kanału |

---

## B. GŁOS / VOICE

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| B1 | Barge-in (quasi full-duplex) | AI mówi, user może przerwać i AI natychmiast milknie i słucha |
| B2 | STT: benchmark najpierw | Porównać: Deepgram vs Whisper vs Browser API na polskim tekście. Priorytet: polski |
| B3 | Waveform + glow | Zaawansowany waveform z gradient colors i glow effects (jak Spotify canvas) |
| B4 | Wake word: browser first | Działa gdy ExoSkull tab otwarty. Desktop app jako follow-up |
| B5 | Wake word: "IORS" | Hardcoded "IORS" na start, customizable później |
| B6 | Animacja + live transkrypcja | Wizualna animacja + słowa pojawiają się na ekranie w czasie rzeczywistym |
| B7 | Tańszy voice clone | XTTS, Coqui, lub Fish Audio zamiast ElevenLabs |
| B8 | Minimalizacja voice mode | Esc/click → voice minimalizuje się do widgetu, nadal nasłuchuje wake word |
| B25 | Dwa tryby | Dyktowanie (jak Gboard do input area) + Real-time conversation (z wizualizacją/awatarem) |
| B30 | Bez limitu czasu | Mic dostępny tak długo jak user mówi. Brak 120s cap |
| B31 | Always-listening | Nasłuchuje na wake word "IORS". Aktywacja → rozmowa. Naturalne jak ludzka rozmowa |
| B34 | Bez "Nagrywam/Cisza" | Zero tekstu statusu — animacja + live transkrypcja |
| B38 | Real-time WebSocket | Ma być w Phase 1 (było Growth) |
| B42 | ElevenLabs za drogie | Szukamy tańszej alternatywy |
| B45 | Emocje Phase 1 | Detekcja emocji z głosu → Phase 1 |
| B-TTS | User wybiera głos | Galeria głosów (męski/żeński, PL/EN) — user wybiera przy onboardingu |

---

## C. UPLOAD PLIKÓW

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| C1 | Wszystkie opcje uploadu | Drag-drop folder + upload zip + przycisk "wybierz folder" |
| C2 | Heurystyka + parser + fallback | Próbuj heurystycznie → jeśli nie → napisz parser (skill) → jeśli nie → powiedz userowi |
| C3 | Bez limitu rozmiaru | Presigned uploads na R2/S3. Brak limitu |
| C48 | Upload folderów | Włącznie z całymi folderami (lub zip) |
| C49 | Przetworzy KAŻDY plik | Jeśli nie umie otworzyć — pisze skill/szuka rozwiązania |

---

## D. V3 TOOLS (NARZĘDZIA AGENTA)

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| D1 | Data lake unified | Wszystko wpada do data lake (Bronze). Silver/Gold wyłaniają różne widoki. Mamy już gotowe |
| D2 | Kernel = platform core | Agent modyfikuje SWOJĄ instancję, nie platformę. Platform: auth, billing, middleware, security, agent engine |
| D3 | Read-only OK | Agent może czytać cały swój kod (bezpieczne) |
| D56 | Brain = memory = data lake | Jedno źródło prawdy. Brak 3 oddzielnych pamięci |
| D80-90 | Phase 1 przesunięcia | build_app, self_extend, make_call, reflexion, OCR, self_modify (poza kernel) → Phase 1 |
| D90 | Self-modify Phase 1 poza kernel | Agent modyfikuje swoją instancję + tworzy nowe API routes (sandbox) |
| D91 | read_own_file bezpieczne | Czytanie kodu = read-only, zero ryzyka |

---

## E. PAMIĘĆ & KNOWLEDGE

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| E1 | 3 warstwy OK | Short/Mid/Long-term — ale lepiej opisane i zintegrowane |
| E2 | SOUL.md/MEMORY.md po każdej rozmowie | Aktualizowane po każdej sesji czatu — zawsze świeże |
| E3 | QMD: auto + edycja | Automatycznie wyciąga Questions/Mistakes/Decisions, user widzi i może edytować |
| E-cat | Uprościć opis | System OK technicznie, ale opisy muszą być zrozumiałe (nie techniczny żargon) |
| E108-115 | Phase 1 przesunięcia | SOUL.md, MEMORY.md, weekly digests, QMD, reprocessing, job tracking → Phase 1 |

---

## F. CELE & ZADANIA

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| F1 | Graph DB zamiast Tyrolki | Nodes + edges w Postgres + pgvector. Cele, zadania, notatki = węzły z typami |
| F2 | Values implicit via #hashtagi | Wartości = #hashtagi w grafie, nie osobna encja. Hierarchia wielokrotnie zagnieżdżana |
| F3 | Tracking adaptacyjny | Jak agent traktuje postęp = zależy od usera. AI adaptuje podejście do tego co skuteczne |
| F4 | #Hashtagi: Mix | AI proponuje, user zatwierdza/edytuje. Click na #node → powiązane info |
| F116-120 | WYRZUCONE | user_loops, user_campaigns, user_quests, user_ops — zastąpione graph nodes |
| F133 | WYRZUCONY | Kontrakt użytkownika z celami |
| F134 | Decompose z uzgodnieniem | Rozbijanie celu na subtaski OK ale uzgadniane z userem |
| F135 | Dashboard = hashtag tree | Nie tradycyjna strona, lecz drzewo węzłów #hashtagów z wiedzą |

### Model danych: Graph
```
nodes (id, tenant_id, type, name, content, metadata JSONB, embedding vector(1536), parent_id, created_at)
  type: 'goal', 'task', 'note', 'memory', 'pattern', 'document', 'tag'

edges (id, source_id, target_id, relation, metadata JSONB)
  relation: 'has_subtask', 'tagged_with', 'related_to', 'blocks', 'depends_on'
```

---

## G. AUTONOMIA & PROAKTYWNE DZIAŁANIA

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| G1 | Wszystko + więcej | Maile→taski, deadline przypomnienia, szukanie dróg do celu + co user ustali z agentem |
| G2 | CRONy OK jeśli użyteczne | Obecna częstotliwość OK ale muszą robić KONKRETNE rzeczy |
| G3 | Hybrydowy MAPE-K | MAPE-K dla złożonych decyzji + prosta checklist dla rutynowych sprawdzeń |
| G4 | Jeden połączony loop | MAPE-K + Ralph = jeden loop. Signal Triage = część Monitor. Zdecyduję ja |
| G5 | Dynamic Skills proaktywnie + auto | AI wykrywa potrzebę → generuje skill → UŻYWA go — bez pytania usera |
| G6 | Signal Triage = część Monitor | Nie osobna funkcja |
| G7 | Gap detection: obie metody | Analiza dotychczasowych działań + research nowych metod |
| G8 | W pełni adaptacyjne aktywowanie | AI sam decyduje kiedy zaproponować autonomiczną akcję |
| G136 | CRONy muszą pomagać | Problem nie w CRONach ale w tym że Execute nie robi nic konkretnego |
| G140 | MAPE-K zostaje | Ale z konkretnymi zadaniami (deadline'y, maile, cele, kalendarz) |
| G141 | Ralph Loop Phase 1 | Ma działać od razu |
| G148 | Gap detection goal-focused | Wyrzuć domeny życia. Szukaj dróg do CELU których nie próbowaliśmy |
| G153 | Rate limiting Phase 2 | Przeniesione z Phase 1 |
| G155-156 | Phase 1 | Proactive messages + goal-stall detection |
| G157-163 | Adaptacyjne | AI sam decyduje kiedy zaproponować (blokowanie kalendarza, transakcje, rachunki, urodziny, negocjacje) |
| G163 | Negocjacje Phase 1 | AI vs user per-sytuacja — adaptacyjne |

---

## H. APP BUILDER & SKILL GENERATION

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| H1 | Pełny pipeline + iteracyjny | Supabase DB + Next.js API + React UI od dnia 1. Każdy krok iterowany z userem |
| H2 | Felix = pełna automatyzacja | AI doprowadza do złożonego celu: research → plan → budowa → marketing → sprzedaż → obsługa. AI szacuje koszt i pyta |
| H164-177 | Wszystko Phase 1 | build_app, BMAD, retry, error recovery, deploy, test-fix, skill gen, marketplace, Felix |

---

## I. SELF-MODIFICATION & EVOLUTION

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| I1 | Wszystko + user approval | Agent modyfikuje WSZYSTKO w swojej instancji. Każda zmiana via PR review |
| I1b | + nowe API routes | Agent może tworzyć nowe API routes dla swojego usera (w sandbox) |
| I2 | Dynamiczny swarm | IORS sam decyduje ilu agentów potrzeba — od 1 (prosty) do 10 (złożony) |
| I178-193 | Wszystko Phase 1 | self-modify, kernel guard, risk classification, AI diff, code validation, swarm, audit, PR preview, self-config/prompt/CRON modify, reflexion, anti-hallucination, crash recovery, event sourcing |

---

## J. KANAŁY KOMUNIKACJI

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| J1 | WSZYSTKIE kanały równolegle | Adaptery gotowe. Web, SMS, email, WhatsApp, Telegram, Discord, Messenger, Instagram, Slack, iMessage |
| J2 | Każdy kanał osobny adapter | Bez unifikatora (GoHighLevel wyrzucony). Własny webhook per kanał |
| J3 | Output adaptowany | Narzędzia identyczne na WSZYSTKICH kanałach. Output adaptuje się (głos=opisuje, web=pokazuje, SMS=skrót) |
| J207 | WYRZUCONY | GoHighLevel hub |
| J208 | Brak channel-filtering | Wszędzie te same narzędzia |

---

## K. DASHBOARD & UI

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| K1 | Minimal + onboarding | Minimalne UI (chat + profil) + AI prowadzi onboarding konwersacyjnie |
| K2 | Hybrid | Inline widgets na start + AI może wygenerować pełną stronę gdy potrzeba |
| K3 | Activity = część unified thread | Activity events pojawiają się w głównym wątku czatu |
| K224 | ZERO precoded pages | Nie ma żadnych stron na początku. Wszystkie strony buduje AI z userem |
| K233 | Unified Activity Stream Phase 1 | W ramach unified thread |
| K-workspace | Split workspace | L=chat/stream, R=wspólny workspace (browser, pliki, wizualizacje) |
| K-thinking | Pełny reasoning | Agent pokazuje cały łańcuch myślenia (collapsible by default) |

---

## L. SLASH COMMANDS

Brak zmian — 30+ komend, autocomplete, Ctrl+K palette, inline widgets. Bez komentarzy.

---

## M. USTAWIENIA & PERSONALIZACJA

Brak zmian — permission levels, quiet hours, personality, language, self-modify toggle. Bez komentarzy.

---

## N. AUTENTYKACJA

Brak zmian — email+hasło, OAuth, magic link, RLS, teams. Bez komentarzy.

---

## O. ONBOARDING

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| O1 | Omnichannel-first | User może zacząć na DOWOLNYM kanale |
| O2 | Konwersacyjny | AI rozmawia i zbiera info. Adaptacyjne pytania (AI sam decyduje co pytać) |
| O277 | WYRZUCONY | SMS-first onboarding |
| O278 | Nie SMS/voice | Goal capture przez dowolny kanał |
| O279 | WYRZUCONY | Progressive capability unlock |

---

## P. EMAIL SYSTEM

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| P1 | Task creation adaptacyjne | AI sam decyduje na podstawie preferencji usera i kontekstu |
| P281-289 | Phase 1 | Inbox sync, klasyfikacja, knowledge extraction, tasks, widget |
| P290-291 | WYRZUCONE z default | Marketing/dunning emails — tylko jeśli cel usera wymaga email marketingu |

---

## Q. INTEGRACJE & SUPERINTEGRATOR

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| Q1 | SuperIntegrator JEDYNY sposób | Zero pre-built integrations. Zero hardcoded. Jeśli AI nie umie — nie łączymy |
| Q2 | Wspólny workspace + wirtualna przeglądarka | Agent otwiera browser na VPS, user widzi na workspace. AI steruje, user zatwierdza/przejmuje. Zbiera credentials z czasem |
| Q-tech | CDP + WebRTC (hybrid) | Chrome na VPS + Chrome DevTools Protocol dla interakcji + WebRTC dla live view |
| Q293 | WYRZUCONY | connect_rig (pre-built integrations) |
| Q304-305 | WYRZUCONE | Oura, Notion, Todoist, Fitbit, Spotify (zastąpione SuperIntegrator) |
| Q292-306 | Phase 1 | SuperIntegrator, connect_service, list_integrations, use_service, OAuth2, API key, webhook, token refresh, Google, MS, Facebook |

---

## R. EMOCJE & MENTAL HEALTH

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| R1 | Izolacja: na żądanie | User może poprosić o analizę kontaktów, system nie monitoruje proaktywnie |
| R311 | WYRZUCONY | Automatyczny monitoring izolacji społecznej |

---

## S. ZDROWIE & MONITORING

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| S1 | Google Fit / Apple Health | Dane zdrowotne przez SuperIntegrator. Oura wyrzucona |
| S318-319 | Phase 1 | Sleep, HRV, steps monitoring |

---

## T. CODE EXECUTION & VPS

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| T1 | VPS + wirtualny pulpit | Docker sandbox + widoczny na workspace (user widzi terminal/browser) |
| T323-330 | Phase 1 | Sandbox exec, resource limits, file ops, code bash, tests, deploy, circuit breaker, voice code |

---

## U. MULTI-MODEL AI ROUTING

Brak zmian — 4-tier routing, Gemini fallback, Haiku budget, prompt caching. Bez komentarzy.

---

## V. DATA LAKE & PRIVACY

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| V1 | AI + dashboard | AI odpytuje DuckDB + wyniki jako widget/chart w czacie |
| V341 | DuckDB Phase 1 | Query engine na Parquet/R2 |

---

## W. SECURITY & SAFETY

Brak zmian. Bez komentarzy.

---

## X. MONITORING & TRANSPARENCY

Brak zmian. Bez komentarzy.

---

## Y. MULTI-AGENT & ORCHESTRACJA

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| Y1 | Uproszczony multi-agent | IORS sam robi większość. Sub-agent dla bardzo złożonych zadań |
| Y-swarm | Dynamiczny swarm (dla self-modify) | IORS decyduje ilu agentów potrzeba (1-10) bazując na złożoności |
| Y372-376 | Phase 1 | Sub-agent delegation, agent factory, coordinate agents, auto-delegation |

---

## Z. DESKTOP & MOBILE

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| Z1 | Web first | Android później. Najpierw web tylko |
| Z2 | Build z dowolnego kanału | User może zlecić budowę przez każdy kanał. VPS wykonuje |
| Z386 | Via all channels | Zero-install = IORS działa na dowolnym kanale bez app/instalacji |

---

## AA. MARKETPLACE & GAMIFICATION

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| AF1 | Hook model + adaptacja | Nir Eyal Hook model + AI adaptuje mechanizmy do usera bazując na danych behawioralnych |

---

## AB. BILLING & SUBSCRIPTION

Brak zmian. Bez komentarzy.

---

## AC. ADMIN & OPERATIONS

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| AC1 | Async queue: user + internal | User może kolejkować długie zadania + CRONy używają wewnętrznie |
| AC2 | Smoke test: 24h + po deploy | Automatyczny test co 24h + po każdym deploy |
| AC404 | Phase 1 | Async task queue |
| AC405 | Phase 2 | Master scheduler |
| AC408 | Phase 1 | Autonomy smoke test |

---

## AD. TOOL PACKS

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| AD1 | Core + AI dobiera | Core tools zawsze + AI automatycznie aktywuje potrzebne paki bazując na celach usera |
| AD412 | USUNIĘTY | Values pack (spójne z F2 — values wyrzucone) |
| AD409-431 | Phase 1 | Wszystkie paki oprócz values |

---

## AE. ADDITIONAL TOOLS

Wszystko Phase 1. Brak dodatkowych decyzji.

---

## AF. PRZYSZŁE FAZY

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| AF442 | Phase 1 | Hooked UI — Hook model + adaptacja |

---

## OUTBOUND ACTIONS

| # | Decyzja | Szczegóły |
|---|---------|-----------|
| OUT1 | User definiuje reguły | "Emaile do X wysyłaj sam, SMS zawsze pytaj, telefony blokuj" — reguły w chacie, AI generuje widok w workspace |
| OUT2 | Negocjacje adaptacyjne | User wybiera per-sytuacja: AI sam negocjuje LUB AI przygotowuje argumenty |
| OUT3 | AI szacuje budżet | Przed dużym wydatkiem: "Szacuję ~$30 AI. OK?" |

---

## WYRZUCONE FUNKCJONALNOŚCI (podsumowanie)

1. ~~Quick suggestion chips~~ → kontekstowe sugestie AI
2. ~~user_loops~~ → graph nodes (type: goal)
3. ~~user_campaigns~~ → graph edges
4. ~~user_quests~~ → graph nodes (type: task)
5. ~~user_ops~~ → graph nodes (type: task)
6. ~~Values hierarchy~~ → #hashtagi w grafie
7. ~~Kontrakt z celami~~ → adaptacyjny tracking
8. ~~GoHighLevel hub~~ → osobne adaptery per kanał
9. ~~Channel-specific tool filtering~~ → te same narzędzia wszędzie
10. ~~SMS-first onboarding~~ → omnichannel
11. ~~Progressive capability unlock~~ → pełny dostęp od dnia 1
12. ~~connect_rig~~ → SuperIntegrator
13. ~~Oura Ring integration~~ → SuperIntegrator + Google Fit
14. ~~Notion, Todoist, Fitbit, Spotify~~ → SuperIntegrator
15. ~~Monitoring izolacji społecznej~~ → na żądanie
16. ~~Values pack~~ → usunięty
17. ~~Marketing/dunning emails z default~~ → tylko jeśli cel wymaga
18. ~~Gap detection per 7 domen~~ → goal-focused gap detection
19. ~~Signal Triage jako osobna funkcja~~ → część Monitor w MAPE-K

---

## PRZESUNIĘCIA DO PHASE 1 (z Phase 2/3)

~100+ items przeniesionych do Phase 1 (MVP), w tym:
- ALL app builder tools (build_app, BMAD, deploy, skill gen)
- ALL self-modification tools (self-modify, kernel guard, swarm, event sourcing)
- ALL channels (WhatsApp, Telegram, Discord, Messenger, Instagram, Slack, iMessage)
- ALL tool packs (self_config, self_evolution, learning, debate, social, ads, analytics, calendar, contacts, tasks, drive, maps, health)
- Email system (inbox sync, classification, knowledge extraction)
- SuperIntegrator
- VPS code execution
- DuckDB query engine
- Voice emotion detection
- Real-time WebSocket voice
- Hooked UI gamification
- Multi-agent delegation + agent factory
- Ralph Loop
- Proactive messages + goal-stall detection
- Async task queue
- Autonomy smoke test

---

## NOWE KONCEPCJE (wynikające z review)

### 1. Shared Workspace (NOWE)
Split layout: L=Chat/UnifiedStream, R=Shared Workspace. Workspace zawiera:
- Wirtualna przeglądarka (CDP+WebRTC z VPS) — AI steruje, user widzi i może przejąć
- Rozwijane linki/pliki z unified stream
- Wizualizacje, podglądy dokumentów
- Terminal VPS
- AI-generated strony/dashboardy
- Technicznie: Chrome na VPS + Chrome DevTools Protocol + WebRTC live stream

### 2. Graph-based Knowledge (#hashtag nodes) (NOWE)
Zamiana relacyjnych tabel Tyrolki na graph:
- Nodes: cele, zadania, notatki, pamięć, wzorce, dokumenty, tagi
- Edges: relacje (has_subtask, tagged_with, related_to, blocks)
- #Hashtagi = jednocześnie tag + semantyczny klucz + node w grafie
- pgvector embeddings na nodes → semantic search + graph traversal
- Wielokrotne zagnieżdżanie (node może mieć wiele parents)

### 3. Tenant Instance Self-Modification (NOWE)
Model parent/child:
- Platform = parent (niemodyfikowalny core)
- Instancja IORS per user = child (modyfikowalny)
- Agent może: zmieniać UI, dodawać skills, tworzyć API routes, modyfikować prompty — w ramach SWOJEJ instancji
- Agent NIE może: dotknąć auth, billing, security, agent engine, DB migrations, middleware

### 4. Fully Adaptive Autonomy (NOWE)
- AI sam decyduje KIEDY proponować autonomiczne akcje
- AI sam decyduje CO proponować — bazując na celach, zachowaniu, preferencjach
- AI GENERUJE i UŻYWA skills bez pytania — jeśli cel tego wymaga
- User definiuje reguły outbound w chacie → AI zapisuje + generuje widok

---

*Dokument wygenerowany z 2 tur pytań doprecyzowujących (54 pytań Tura 1 + 20 pytań Tura 2)*
*Wszystkie decyzje zatwierdzone przez właściciela produktu*
