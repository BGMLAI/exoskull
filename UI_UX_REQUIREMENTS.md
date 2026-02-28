# ExoSkull — Wymagania UI/UX

> **Wersja:** 1.0 | **Data:** 2026-02-17
> **Źródła:** 36 sesji Claude Code (10-17.02.2026), 4 audyty, COCKPIT_DESIGN_SPEC.md
> **Autor:** Bogumił (wypowiedzi z sesji) + synteza z audytów

---

## Spis treści

1. [Wizja produktu](#1-wizja-produktu)
2. [Styl wizualny](#2-styl-wizualny)
3. [Layout i struktura](#3-layout-i-struktura)
4. [Nawigacja i menu](#4-nawigacja-i-menu)
5. [Komponenty i widgety](#5-komponenty-i-widgety)
6. [Funkcjonalność i zachowanie](#6-funkcjonalność-i-zachowanie)
7. [Strony i widoki](#7-strony-i-widoki)
8. [Chat i AI](#8-chat-i-ai)
9. [Mobile i responsive](#9-mobile-i-responsive)
10. [Bugi i problemy do naprawy](#10-bugi-i-problemy-do-naprawy)
11. [Backlog priorytetów](#11-backlog-priorytetów)

---

## 1. Wizja produktu

### Czym ma być ExoSkull

| Aspekt | Wymaganie | Źródło |
|--------|-----------|--------|
| Styl interfejsu | **Gemini + NotebookLM + Perplexity + Google** — interaktywne, ze zdjęciami, artykułami, rich media | Sesja 02-17 |
| Docelowy UX | Czat jak Claude Code ale "cywilizowany" — z pełnym dostępem do kodu, MCP, agentów | Sesja 02-17 |
| ExoSkull = IDE | Przenieść całe Claude Code do chmury (VPS OVH) — ExoSkull ma być IDE, nie laptop | Sesja 02-16 |
| Orby 3D | Zachować orby 3D + HUD cockpit, ale umożliwić **jednoczesne** korzystanie z 3D i chatu | Sesja 02-16 |
| 3D modele | Rozważyć modele 3D z darmowych baz (druk 3D) jako elementy wizualne w mindmapie | Sesja 02-17 |

### Kluczowy cytat
> *"myslalem czy nie zrobic modeli roznych ksztaltow z darmowych baz do druku 3d no i zeby zrobic bardziej w stylu gemini i interaktywnych apek i notebook lm, i troche tez google style/perplexity ze zdjeciami, artykulami itd"*

---

## 2. Styl wizualny

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| S1 | **Jasny motyw** — "zrób jasny wariant aplikacji", "zrob nieco jasniejsze to wszystko" | P1 | Do zrobienia |
| S2 | **Nie totalnie biały** — "JEST KURWA BIALO NIE MA ZADNYCH GRID ORB NIC" — jasny ≠ biały. Zachować strukturę, grid, orby | P0 | Bug |
| S3 | **3 motywy zachować** — Dark Ops (cyan/amber), XO Minimal (black/red), Neural (purple/cyan) + dodać jasny wariant | P1 | Istniejące |
| S4 | **Cyberpunk/HUD zachować** — nie rezygnować z FUI cockpitu, ale zrobić go czytelnym | P2 | Zachować |
| S5 | **Kontrast WCAG** — glow/neonowe kolory na ciemnym tle mogą mieć niski kontrast | P2 | Audyt UX |
| S6 | **Brightness/opacity orbów** — możliwość regulacji jasności elementów 3D | P2 | Spec |

### Design system (aktualny)
- Fonty: Space Grotesk (heading), Inter (body), JetBrains Mono (mono)
- Themes: dark-ops, xo-minimal, neural
- Animacje: wave-bar, neural-pulse, crystal-bloom-burst, gamma-pulse

---

## 3. Layout i struktura

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| L1 | **Chat + 3D jednocześnie** — "czat jest do połowy strony i wtedy można wchodzić w interakcję z orbami 3D, nie jest tylko zero-jedynkowo albo 3D albo HUD" | P0 | Do zrobienia |
| L2 | **Chat nie może zmniejszać wingów** — "nie da się mieć chatu na całą stronę i zadań itd otwartych bo jak się rozwija chat to się zmniejsza wingi" | P0 | Bug |
| L3 | **Cockpit grid** — lewy wing (tasks, IORS, email) + center (chat) + prawy wing (calendar, knowledge). Resizable borders. | P1 | Częściowo |
| L4 | **Wing min/max** — min 200px, max 400px na wing. Center: fluid. | P1 | Spec |
| L5 | **Drawer min height za mały** — `DRAWER_MIN = 48px` chat prawie niewidoczny po zwinięciu | P2 | Audyt UX |

### Docelowy layout
```
┌──────────────────────────────────────────────────────┐
│ [TOP BAR - STATUS LINE]                              │
├──────────┬───────────────────────┬───────────────────┤
│ LEFT     │   CENTER VIEWPORT     │ RIGHT             │
│ WING     │   (Chat + 3D Orbs)    │ WING              │
│ ┌──────┐ │                       │ ┌───────────────┐ │
│ │TASKS │ │   ← 50/50 split →    │ │CALENDAR / NOW │ │
│ └──────┘ │   ← lub drag resize → │ └───────────────┘ │
│ ┌──────┐ │                       │ ┌───────────────┐ │
│ │ IORS │ │                       │ │  KNOWLEDGE    │ │
│ └──────┘ │                       │ └───────────────┘ │
│ ┌──────┐ │                       │ ┌───────────────┐ │
│ │EMAIL │ │                       │ │  GOALS/STATS  │ │
│ └──────┘ │                       │ └───────────────┘ │
├──────────┼───────────────────────┼───────────────────┤
│ [QUICK]  │  [INPUT BAR]          │ [GAUGES]          │
└──────────┴───────────────────────┴───────────────────┘
```

---

## 4. Nawigacja i menu

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| N1 | **Landing page — brak nawigacji w headerze** — dodaj anchor links: Funkcje, Jak to działa, Opinie, Zacznij | P1 | Audyt UX |
| N2 | **Login tabs** — Zaloguj się / Stwórz konto jako Tabs (Radix UI) zamiast stacked formularzy | P0 | Audyt UX |
| N3 | **Code sidebar button** — "fix the code sidebar button position so it's visible" | P1 | Bug |
| N4 | **Auth routing** — migracja top 30 legacy routes z legacy auth do nowego systemu | P1 | W toku |
| N5 | **Admin sidebar mobile** — nie składa się na mobile, zajmuje 60% ekranu | P1 | Audyt E2E |

---

## 5. Komponenty i widgety

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| K1 | **Orby — dodawanie i usuwanie** — "dobrze by było żeby dało się dodać lub usunąć element orba" | P1 | Zrobione (częściowo — usuwanie nie działa) |
| K2 | **Orby — usuwanie nie działa** — "sprawdź czy usuwanie działa: podpowiem Ci nie działa" | P0 | Bug |
| K3 | **Orby — context menu 3D** — prawy klik na orbie → edycja, usunięcie, kolor | P2 | Zrobione |
| K4 | **OrbFormDialog** — formularz dodawania/edycji orbów | P1 | Zrobione |
| K5 | **Dashboard self-test** — "każdy kto robił dashboard ma sam przetestować czy działa" | P1 | Zasada |
| K6 | **Canvas 18 typów widgetów** — table, cards, timeline, kanban, stats, mindmap + dynamic | P2 | Istniejące |
| K7 | **Mindmap jako główna nawigacja** — orby + zdjęcia + modele 3D w stylu mind map | P1 | Nowy kierunek |
| K8 | **Auto-fill formularzy** — agent z dostępem do managera haseł loguje się i wypełnia formularze | P2 | Planowane |
| K9 | **WebGL fallback** — na starszych urządzeniach dashboard może być pusty | P1 | Audyt UX |

---

## 6. Funkcjonalność i zachowanie

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| F1 | **Chat = Claude Code** — pełny agent z dostępem do kodu, MCP servers (Slack, GitHub, Notion), web search | P0 | W toku |
| F2 | **Pamięć między wiadomościami** — "IORS w ogóle nie pamięta niczego z poprzedniej wiadomości" | P0 | Bug |
| F3 | **Routing chat → orchestrator** — "greeting powinien iść do orchestratora nie buildera" | P1 | Naprawione |
| F4 | **Dashboard ładowanie** — "NIE ŁADUJE SIĘ", "strona nieosiągalna" — dev server crashes | P0 | Naprawione |
| F5 | **Wiring audit** — znaleźć gdzie nie jest okablowane, gdzie nie przechodzi flow | P1 | Audyt 3-warstwowy zrobiony |
| F6 | **VPS executor** — "sprawdź czy VPS executor działa, napraw wszystko" | P1 | W toku |
| F7 | **Zapomniane hasło** — brak opcji reset hasła na stronie logowania | P0 | Audyt UX |
| F8 | **Real-time walidacja formularzy** — brak widocznych wymagań hasła, email format, eye icon | P1 | Audyt UX |
| F9 | **Autonomiczne testowanie** — każdy build musi być automatycznie testowany przed deployem | P1 | Zasada |
| F10 | **MAPEK loop** — 3-tier CRON: petla (1min), loop-15 (15min), loop-daily (24h) | P2 | Istniejące |

---

## 7. Strony i widoki

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| V1 | **Landing page — język** — mieszany EN/PL, `lang="pl_PL"` ale headline po angielsku | P0 | Audyt UX |
| V2 | **Landing page — social proof** — "4 użytkowników" to anti-social-proof. Ukryć lub zmienić metryki | P0 | Audyt UX |
| V3 | **Landing page — pricing** — brak informacji o cenach. Dodać "Free during beta" lub sekcję pricing | P1 | Audyt UX |
| V4 | **Landing page — testimoniale** — wyglądają na sfabrykowane (generic imiona, brak zdjęć) | P1 | Audyt UX |
| V5 | **Landing page — hero mobile** — tekst za duży, CTA pod foldem | P1 | Audyt UX |
| V6 | **Dashboard Claude Code** — `/dashboard/claude-code` — wbudowany Claude Code w ExoSkull | P1 | Zrobione |
| V7 | **Onboarding** — BirthChat conversational, ale brak loading states | P2 | Audyt UX |
| V8 | **Privacy/Terms** — ściana tekstu, brak ToC, brak kolapsujących sekcji | P2 | Audyt UX |

---

## 8. Chat i AI

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| A1 | **"Stary chat jest beznadziejny, wolę terminal"** — chat musi działać jak Claude Code, nie generic chatbot | P0 | Kluczowe |
| A2 | **Chat w ExoSkull = Claude Code w jego środowisku** — pełny dostęp do kodu, git, MCP | P0 | W toku |
| A3 | **Multi-model routing** — Gemini Flash → Haiku → Kimi → Opus (cost-optimized) | P2 | Istniejące |
| A4 | **Voice pipeline** — Twilio + Cartesia STT/TTS, 56 narzędzi | P2 | Istniejące |
| A5 | **IORS pamięć** — unifikacja 6 systemów pamięci, vector + keyword search | P1 | Plan zrobiony |
| A6 | **Jasny wariant apps** — "zrób jasny wariant aplikacji" — dotyczy custom-built apps | P2 | Do zrobienia |

---

## 9. Mobile i responsive

| # | Wymaganie | Priorytet | Status |
|---|-----------|-----------|--------|
| M1 | **Mobile dashboard — bottom nav overlaps widgets** — `pb-20` brakuje | P2 | Audyt E2E |
| M2 | **Mobile dashboard — horizontal overflow** — widgety side-by-side na 390px | P2 | Audyt E2E |
| M3 | **Mobile dashboard — excessive gaps** — za duże przerwy między widgetami | P2 | Audyt E2E |
| M4 | **Admin sidebar — nie składa się na mobile** — zajmuje 60% ekranu | P1 | Audyt E2E |
| M5 | **Landing hero — za duży tekst na mobile** — CTA pod foldem | P1 | Audyt UX |
| M6 | **WebGL fallback na mobile** — brak static fallback gdy brak WebGL | P1 | Audyt UX |

---

## 10. Bugi i problemy do naprawy

### P0 — Krytyczne (natychmiast)

| # | Bug | Szczegóły |
|---|-----|-----------|
| B1 | Dashboard nie ładuje się / biały ekran | Grid, orby, HUD nie renderuje się. Był biały ekran bez żadnych elementów |
| B2 | Usuwanie orbów nie działa | CRUD orba — create i edit działają, delete nie |
| B3 | Chat IORS nie pamięta kontekstu | Brak persistence między wiadomościami |
| B4 | Landing — mieszane języki | EN headline + PL reszta |
| B5 | Login — brak reset hasła | Zero opcji recovery |
| B6 | Login — formularze stacked | Nowi użytkownicy nie widzą rejestracji na mobile |
| B7 | Chat nie rozwija wingów poprawnie | Rozszerzanie chatu zmniejsza boczne panele |

### P1 — Ważne (ten tydzień)

| # | Bug | Szczegóły |
|---|-----|-----------|
| B8 | Code sidebar button niewidoczny | Przycisk otwierający sidebar kodu jest poza widokiem |
| B9 | Social proof — niskie liczby | "4 użytkowników" to anti-marketing |
| B10 | Admin sidebar mobile | 60% ekranu, content off-screen |
| B11 | Brak WebGL fallback | Dashboard crash na starszych urządzeniach |
| B12 | Brak pricing na landing | Użytkownik nie wie czy płatne |
| B13 | Landing testimoniale | Generic, bez zdjęć, niedowiarygodne |

---

## 11. Backlog priorytetów

### Sprint 1 (P0 — ta sesja)
- [ ] **B1** Fix białego ekranu dashboard — przywrócić grid + orby
- [ ] **B2** Fix usuwania orbów
- [ ] **B3** Fix pamięci chatu IORS
- [ ] **B4** Ujednolicić język landing page
- [ ] **B5** Dodać "Zapomniałeś hasła?" + reset flow
- [ ] **B6** Login tabs (Zaloguj/Zarejestruj)
- [ ] **B7** Fix layout chatu vs wingów
- [ ] **L1** Chat + 3D jednocześnie (split view)

### Sprint 2 (P1 — ten tydzień)
- [ ] **B8** Fix code sidebar button position
- [ ] **B9** Zmienić/ukryć social proof stats
- [ ] **S1** Jasny motyw (light theme)
- [ ] **N1** Nawigacja w headerze landing page
- [ ] **K7** Mindmap jako nawigacja (nowy kierunek Gemini-style)
- [ ] **F8** Real-time walidacja formularzy
- [ ] **V3** Sekcja pricing
- [ ] **V4** Testimoniale — avatary lub usunąć
- [ ] **V5** Mobile hero text size
- [ ] **K9** WebGL fallback
- [ ] **A5** Unifikacja pamięci IORS

### Sprint 3 (P2 — ulepszenia)
- [ ] **S5** WCAG contrast audit
- [ ] **S6** Brightness/opacity control dla orbów
- [ ] **K3** Context menu orbów — polish
- [ ] **K8** Auto-fill formularzy (1Password integration)
- [ ] **L5** Zwiększyć drawer min height
- [ ] **V7** Onboarding loading states
- [ ] **V8** Privacy/Terms — ToC + collapsible
- [ ] **M1-M3** Mobile dashboard polish
- [ ] **A6** Jasny wariant custom apps
- [ ] Skip-to-content accessibility
- [ ] Footer rozszerzony (social, kontakt)

---

## Źródła

| Dokument | Data | Typ |
|----------|------|-----|
| 36 sesji JSONL (Claude Code) | 10-17.02.2026 | Wypowiedzi użytkownika |
| `COCKPIT_DESIGN_SPEC.md` | 16.02.2026 | Design spec (935 linii) |
| `UX_AUDIT_2026-02-17.md` | 17.02.2026 | Audyt UX (17 issues) |
| `AUDIT_REPORT_2026-02-09.md` | 09.02.2026 | E2E Browser Audit |
| `FUNCTIONAL_AUDIT_2026-02-14.md` | 14.02.2026 | Functional Audit (115 endpoints) |
| `WIRING_AUDIT_*.md` | 17.02.2026 | 3-layer infrastructure audit |
| `WYPOWIEDZI_UI_UX.md` | 17.02.2026 | Surowe wypowiedzi (75 unikalnych) |
