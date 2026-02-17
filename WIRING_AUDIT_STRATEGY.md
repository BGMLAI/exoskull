# ExoSkull — Strategia Audytu "Broken Wiring"

**Cel:** Znaleźć WSZYSTKIE miejsca gdzie kod nie jest połączony — martwe endpointy, osierocone komponenty, puste handlery, brakujące integracje, zerwane łańcuchy danych.

**Data:** 2026-02-17

---

## STAN OBECNY

| Metryka | Wartość |
|---------|---------|
| Moduły w `lib/` | 68 katalogów/plików |
| Komponenty w `components/` | 25 katalogów |
| API routes w `app/api/` | 60+ katalogów |
| Dashboard pages | 12 stron |
| Admin pages | 10 stron |
| CRON jobs | 38 |
| Unit testy | 7 plików (tylko!) |
| Integration testy | 0 |
| E2E testy | 0 |
| Pokrycie kodu | nieznane |

**Problem:** 175 komponentów systemu, 7 unit testów. Ogromna luka testowa.

---

## STRATEGIA: 5 WARSTW AUDYTU

### WARSTWA 1: Statyczna Analiza Kodu (automatyczna)

**Cel:** Znaleźć martwy kod, osierocone pliki, nieużywane eksporty, brakujące importy.

#### 1A. Knip — Unused Files, Exports, Dependencies

[Knip](https://knip.dev/) — najlepsze narzędzie do wykrywania martwego kodu w TS/JS. Ma wbudowany plugin Next.js.

```bash
cd exoskull-app
npx knip --reporter compact
```

**Co znajdzie:**
- Pliki, które nic nie importuje (osierocone)
- Eksportowane funkcje, których nikt nie używa
- Zależności w package.json, które nie są importowane
- Typy TypeScript, które nigdzie nie są użyte

#### 1B. dependency-cruiser — Wizualizacja Zależności

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — mapa zależności między modułami. Czerwone linie = zerwane połączenia.

```bash
npx depcruise lib --include-only "^lib" --output-type dot | dot -T svg > deps-lib.svg
npx depcruise app/api --include-only "^app/api" --output-type dot | dot -T svg > deps-api.svg
npx depcruise components --include-only "^components" --output-type dot | dot -T svg > deps-components.svg
```

**Co znajdzie:**
- Cykliczne zależności (A→B→C→A)
- Moduły bez żadnych połączeń (izolowane wyspy)
- Nieresolvable importy (czerwone linie — plik nie istnieje)

#### 1C. TypeScript Strict Check

```bash
npx tsc --noEmit --strict 2>&1 | head -200
```

**Co znajdzie:**
- Niezgodności typów między modułami
- Brakujące pola wymagane przez interfejsy
- `any` ukrywające prawdziwe problemy

#### 1D. madge — Circular Dependencies

[madge](https://github.com/pahen/madge) — specjalizacja: cykliczne zależności.

```bash
npx madge --circular --extensions ts,tsx lib/
npx madge --orphans --extensions ts,tsx lib/ components/
```

**Co znajdzie:**
- Pliki-sieroty (nie importowane nigdzie)
- Cykliczne zależności

---

### WARSTWA 2: Audyt API ↔ Frontend (połączenia)

**Cel:** Znaleźć gdzie frontend woła endpointy, które nie istnieją lub zwracają inne dane niż oczekiwane.

#### 2A. Mapa Frontend→API calls

```bash
# Znajdź wszystkie fetche/API calle w komponentach i stronach
grep -rn "fetch(" app/ components/ --include="*.tsx" --include="*.ts" | grep -v node_modules
grep -rn "/api/" app/ components/ --include="*.tsx" --include="*.ts" | grep -v node_modules
```

**Checklist:**
- [ ] Każdy `fetch('/api/...')` w komponencie → czy endpoint istnieje?
- [ ] Kształt danych zwracanych przez API → czy frontend oczekuje tych samych pól?
- [ ] Error handling → czy frontend obsługuje 400/401/500?

#### 2B. Mapa API→Lib calls

```bash
# Znajdź co API routes importują z lib/
grep -rn "from '@/" app/api/ --include="*.ts" | grep -v node_modules
```

**Checklist:**
- [ ] Każdy import w route handler → czy importowana funkcja istnieje?
- [ ] Parametry przekazywane do lib → czy typy się zgadzają?
- [ ] Czy lib-function używa Supabase klienta z prawidłowym auth?

#### 2C. Audit Znanych Problemów z Audytu 2026-02-14

| # | Problem | Status |
|---|---------|--------|
| 1 | 10 endpointów wymaga explicit `tenant_id` zamiast `verifyTenantAuth()` | DO SPRAWDZENIA |
| 2 | Knowledge endpoints (7) nie wyciągają tenant_id z sesji | DO SPRAWDZENIA |
| 3 | 0% approval rate na interwencjach (57 interwencji, 0 approved) | DO SPRAWDZENIA — UX broken? |
| 4 | Skills system empty (0 skills) — czy pipeline działa? | DO SPRAWDZENIA |
| 5 | gold-etl perpetually skipped → business-metrics stale | DO SPRAWDZENIA |

---

### WARSTWA 3: Audyt User Journeys (end-to-end)

**Cel:** Przejść KAŻDĄ ścieżkę użytkownika i sprawdzić czy działa od początku do końca.

#### Krytyczne Journey (P0):

| # | Journey | Kroki | Co może być zerwane |
|---|---------|-------|---------------------|
| 1 | **Nowy user → Rejestracja → Onboarding → Dashboard** | Landing → Signup → Email confirm → Onboarding chat → Dashboard | Onboarding może nie zapisywać profilu |
| 2 | **Chat → AI odpowiada → Widget się aktualizuje** | Wpisz wiadomość → AI przetwarza → Canvas widget update | Czy stream działa? Czy widget nasłuchuje? |
| 3 | **Voice call → AI słucha → odpowiada głosem** | Kliknij "Mów" → Nagrywaj → STT → AI → TTS → Odtwórz | Pipeline 5 kroków — każdy może się zerwać |
| 4 | **Dodaj task przez chat → Widać na dashboard** | "Dodaj task: kupić mleko" → Tool execute → Task list update | Czy tool jest wyzwalany? Czy canvas się odświeża? |
| 5 | **Podłącz integrację (Google)** | Settings → Integrations → Google → OAuth → Callback → Sync | OAuth callback → token storage → initial sync |
| 6 | **Knowledge upload → Searchable** | Upload file → R2 → Chunking → Embedding → Vector store | 5-step pipeline, każdy krok może cicho sfailować |
| 7 | **Goal define → Progress tracking → Dashboard** | Define goal (chat/voice) → AI tracks → Dashboard widget | Czy goal tool zapisuje? Czy widget czyta? |
| 8 | **Admin → CRON management** | Admin panel → CRON page → Enable/disable → Execute | Czy admin UI kontroluje prawdziwe CRONy? |
| 9 | **Self-optimization → Proposal → Approve → Apply** | CRON generates proposal → User sees in inbox → Approves → System applies | Czy approval UI działa? Czy apply jest zaimplementowane? |
| 10 | **Emotion detection → Crisis → Alert** | User expresses distress → Emotion analyzer → Crisis protocol → SMS/notification | Czy crisis detection triggeruje prawdziwy alert? |

#### Jak testować:

**Opcja A: Playwright (recommended)**
```bash
npx playwright test --project=chromium
```

**Opcja B: Manualny smoke test z curl**
```bash
# Każdy endpoint po kolei
npx tsx scripts/test-all-routes.ts --base-url https://exoskull.xyz
```

**Opcja C: Custom audit script** (nowy, dedykowany)
Skrypt który:
1. Loguje się jako test user
2. Przechodzi każdy journey krok po kroku
3. Sprawdza stan DB po każdym kroku
4. Raportuje PASS/FAIL/PARTIAL

---

### WARSTWA 4: Audyt Danych (Data Flow)

**Cel:** Sprawdzić czy dane PRZECHODZĄ przez cały pipeline od wejścia do wyjścia.

#### 4A. Conversation Flow
```
User input → /api/chat/send → AI processing → Tool calls → DB write → Stream response → UI update
```
**Test:** Wyślij wiadomość → Sprawdź czy jest w DB → Sprawdź czy stream zwrócił → Sprawdź czy UI wyświetla.

#### 4B. Data Lake Flow
```
Raw data → Bronze (R2 Parquet) → Silver (Postgres cleaned) → Gold (Materialized views)
```
**Test:** Sprawdź czy bronze-etl → silver-etl → gold-etl chain działa. (Wiemy z audytu 02-14 że gold-etl jest skipped.)

#### 4C. Memory Flow
```
Conversation → Entity extraction → Vector embedding → Unified search
```
**Test:** Porozmawiaj o czymś → Zapytaj o to później → Czy AI pamięta?

#### 4D. CRON Chain
```
petla (1min) → loop-15 (15min) → loop-daily (24h)
impulse → morning-briefing → evening-reflection
```
**Test:** Czy CRONy triggerują siebie nawzajem poprawnie? Czy output jednego jest inputem drugiego?

---

### WARSTWA 5: Audyt Bezpieczeństwa Połączeń

#### 5A. Auth Consistency
```bash
# Znajdź endpointy BEZ auth check
grep -rL "verifyTenantAuth\|verifyAdmin\|CRON_SECRET\|createClient" app/api/ --include="*.ts" | grep "route.ts"
```

#### 5B. RLS Coverage
```sql
-- Sprawdź które tabele NIE mają RLS
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
```

#### 5C. Exposed Endpoints
- Czy są API routes bez żadnej ochrony auth?
- Czy CRON_SECRET jest sprawdzany w każdym CRON endpoint?
- Czy admin endpoints sprawdzają role admina?

---

## NARZĘDZIA — PODSUMOWANIE

| Narzędzie | Cel | Link | Instalacja |
|-----------|-----|------|------------|
| **Knip** | Unused files/exports/deps | [knip.dev](https://knip.dev/) | `npx knip` (zero install) |
| **dependency-cruiser** | Dependency graph + broken links | [github](https://github.com/sverweij/dependency-cruiser) | `npx depcruise` |
| **madge** | Circular deps + orphans | [github](https://github.com/pahen/madge) | `npx madge` |
| **TypeScript** | Type errors between modules | built-in | `npx tsc --noEmit` |
| **Playwright** | E2E user journeys | [playwright.dev](https://playwright.dev/) | `npx playwright install` |
| **test-all-routes.ts** | API smoke test | local script | `npx tsx scripts/test-all-routes.ts` |
| **DeepScan** | Advanced static analysis | [deepscan.io](https://deepscan.io/) | Online/CI integration |
| **next-unused** | Next.js specific dead pages | [github](https://github.com/pacocoursey/next-unused) | `npx next-unused` |

---

## PLAN WYKONANIA

### Faza 1: Quick Scan (2-3h) — ZRÓB TERAZ
1. [ ] `npx knip` → lista martwego kodu
2. [ ] `npx tsc --noEmit` → błędy typów
3. [ ] `npx madge --circular lib/` → cykle
4. [ ] Grep: frontend fetch → API route matching
5. [ ] Grep: API routes bez auth guard

### Faza 2: Deep Scan (4-6h)
6. [ ] dependency-cruiser → wizualizacja grafu
7. [ ] Manual audit 10 krytycznych journeys
8. [ ] Data flow trace: chat → DB → widget
9. [ ] CRON chain verification
10. [ ] Auth consistency audit (tenant_id pattern)

### Faza 3: Automate (ongoing)
11. [ ] Playwright E2E dla top 5 journeys
12. [ ] Knip w CI/CD (GitHub Action)
13. [ ] Integration testy dla lib/ funkcji
14. [ ] Health check endpoint z end-to-end validation

---

## JUŻ ZNANE PROBLEMY (z poprzednich audytów)

### Z Functional Audit 2026-02-14:
- **P0:** Masowa duplikacja wiadomości w chat (~25x ta sama wiadomość)
- **P0:** 7 knowledge endpoints ignoruje auth sesję
- **P1:** monthly-summary 55s (blisko Vercel 60s timeout)
- **P1:** gold-etl + business-metrics perpetually skipped
- **P1:** 0% intervention approval rate (57 propozycji, 0 zatwierdzonych)

### Z UX Audit 2026-02-17:
- **P0:** Mieszany język EN/PL na landing page
- **P0:** Brak tabów Login/Register
- **P0:** Brak "Zapomniałeś hasła?"
- **P1:** Brak informacji o cenach
- **P1:** Brak nawigacji na landing page

### Podejrzane obszary (do zbadania):
- `components/chat/` — pusty katalog (legacy?)
- Skills system — 0 skills (pipeline działa czy nie?)
- 0 integracji podłączonych (OAuth flow works?)
- 0 active users in 24h (engagement issue?)
- System health: "degraded"

---

*Dokument wygenerowany przez Claude Code — Wiring Audit Strategy*
