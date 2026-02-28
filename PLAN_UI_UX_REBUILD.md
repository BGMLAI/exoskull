# ExoSkull — Plan przebudowy UI/UX

> **Wersja:** 1.0 | **Data:** 2026-02-17
> **Decyzje użytkownika:** Hybryda Gemini + 3D | Mindmap full + floating panels | Chat always code-capable | Landing: pominąć | Mobile: niski priorytet
> **Źródło wymagań:** `UI_UX_REQUIREMENTS.md` (75 wypowiedzi, 4 audyty)

---

## Mapowanie wymagań → fazy

Każde wymaganie z `UI_UX_REQUIREMENTS.md` jest przypisane do konkretnej fazy. **ZERO pominięć.**

| Req ID | Opis | Faza | Status |
|--------|------|------|--------|
| S1 | Jasny motyw (Gemini hybrid) | F1 | DO ZROBIENIA |
| S2 | Nie biały — szary/neutralny #F5F5F5 + multi-color | F1 | DO ZROBIENIA |
| S3 | Zachować 3 istniejące motywy + dodać nowy | F1 | DO ZROBIENIA |
| S4 | Cyberpunk HUD zachować jako opcja | F1 | ZACHOWAĆ |
| S5 | WCAG kontrast audit | F6 | PÓŹNIEJ |
| S6 | Brightness/opacity regulacja orbów | F3 | DO ZROBIENIA |
| L1 | Chat + 3D jednocześnie (split) | F2 | DO ZROBIENIA |
| L2 | Chat nie zmniejsza wingów | F2 | N/A w nowym layoucie (floating) |
| L3 | Cockpit grid zachować jako opcja | F2 | ZACHOWAĆ |
| L4 | Wing min/max 200-400px | F2 | N/A (floating panels mają own min/max) |
| L5 | Drawer min height za mały | F2 | N/A (floating chat panel) |
| N1 | Landing page nawigacja | — | POMINIĘTE (landing olać per user) |
| N2 | Login tabs (Zaloguj/Zarejestruj) | F4 | DO ZROBIENIA |
| N3 | Code sidebar button widoczny | F3 | BUG FIX |
| N4 | Auth routing migracja legacy | F5 | KONTYNUACJA |
| N5 | Admin sidebar mobile | F6 | PÓŹNIEJ (mobile niski prio) |
| K1 | Orby dodawanie | F3 | DZIAŁA |
| K2 | Orby usuwanie NIE DZIAŁA | F3 | BUG FIX P0 |
| K3 | Orby context menu 3D | F3 | DZIAŁA |
| K4 | OrbFormDialog | F3 | DZIAŁA, potrzebuje light theme |
| K5 | Dashboard self-test po buildzie | — | ZASADA (nie wymaga kodu) |
| K6 | Canvas 18 widgetów → floating | F2 | ADAPTACJA |
| K7 | Mindmap jako główna nawigacja | F2 | CORE |
| K8 | Auto-fill formularzy (1Password) | F6 | PÓŹNIEJ |
| K9 | WebGL fallback | — | JUŻ DZIAŁA (CyberpunkScene.tsx) |
| F1 | Chat = Claude Code | F3 | CORE |
| F2 | IORS pamięć między wiadomościami | F3 | BUG FIX P0 |
| F3 | Routing greeting → orchestrator | — | JUŻ NAPRAWIONE |
| F4 | Dashboard ładowanie (biały ekran) | — | JUŻ NAPRAWIONE |
| F5 | Wiring audit | — | JUŻ ZROBIONY |
| F6 | VPS executor naprawić | F5 | KONTYNUACJA |
| F7 | Zapomniane hasło (reset) | F4 | DO ZROBIENIA |
| F8 | Real-time walidacja formularzy | F4 | DO ZROBIENIA |
| F9 | Autonomiczne testowanie | — | ZASADA |
| F10 | MAPEK loop | — | JUŻ DZIAŁA |
| V1 | Landing język EN/PL | — | POMINIĘTE (landing olać) |
| V2 | Landing social proof | — | POMINIĘTE |
| V3 | Landing pricing | — | POMINIĘTE |
| V4 | Landing testimoniale | — | POMINIĘTE |
| V5 | Landing hero mobile | — | POMINIĘTE |
| V6 | Dashboard Claude Code | F3 | MERGE do głównego chatu |
| V7 | Onboarding loading states | F4 | DO ZROBIENIA |
| V8 | Privacy/Terms ToC + collapsible | F4 | DO ZROBIENIA |
| A1 | Stary chat beznadziejny → redesign | F2+F3 | CORE |
| A2 | Chat = Claude Code w środowisku | F3 | CORE |
| A3 | Multi-model routing | — | JUŻ DZIAŁA |
| A4 | Voice pipeline | — | JUŻ DZIAŁA |
| A5 | IORS pamięć unifikacja | F5 | DO ZROBIENIA |
| A6 | Jasny wariant custom apps | F1 | DO ZROBIENIA |
| M1 | Mobile bottom nav overlap | F6 | PÓŹNIEJ |
| M2 | Mobile widget overflow | F6 | PÓŹNIEJ |
| M3 | Mobile excessive gaps | F6 | PÓŹNIEJ |
| M4 | Admin sidebar mobile | F6 | PÓŹNIEJ |
| M5 | Landing hero mobile | — | POMINIĘTE |
| M6 | WebGL fallback mobile | — | JUŻ DZIAŁA |
| B1 | Biały ekran dashboard | — | JUŻ NAPRAWIONE |
| B2 | Orb delete nie działa | F3 | BUG FIX P0 |
| B3 | IORS pamięć kontekstu | F3 | BUG FIX P0 |
| B5 | Reset hasła | F4 | DO ZROBIENIA |
| B6 | Login stacked → tabs | F4 | DO ZROBIENIA |
| B7 | Chat zmniejsza wingi | F2 | N/A w nowym layoucie |
| B8 | Code sidebar button | F3 | BUG FIX |
| B9-B13 | Landing bugi | — | POMINIĘTE |

**Podsumowanie:** 60 wymagań → 30 do zrobienia, 12 już działa/naprawione, 10 pominięte (landing), 8 później (mobile/P2)

---

## FAZA 1 — Nowy motyw "Gemini Hybrid" (theme)

### Cel
Dodać 4. motyw: jasny, neutralny, z kolorowymi akcentami per-sekcja. Nie usuwać istniejących 3 motywów.

### Decyzje użytkownika
- Paleta: szary/neutralny (#F5F5F5) + multi-color akcenty
- Nie biały — ciepły jasnoszary
- Zachować Dark Ops, XO Minimal, Neural jako opcje

### Pliki do zmiany

| Plik | Co zrobić |
|------|-----------|
| `app/globals.css` | Dodać `.gemini-hybrid` theme z pełnym zestawem CSS variables |
| `tailwind.config.ts` | Dodać nowe sidebar colors dla jasnego motywu |
| `components/dashboard/CyberpunkDashboard.tsx` | Usunąć hardcoded `#050510`, użyć CSS var `--bg-void` |
| `components/3d/CyberpunkScene.tsx` | Fallback tło: szare zamiast ciemne gdy motyw jasny |
| `components/mindmap/MindMap3D.tsx` | Tło: CSS var zamiast hardcoded `#050510` |
| `components/mindmap/NodeContextMenu.tsx` | Kolory z CSS vars zamiast hardcoded slate/cyan |
| `components/mindmap/NodeDetailPanel.tsx` | j.w. |
| `components/mindmap/ModelPicker.tsx` | j.w. |
| `components/cockpit/OrbFormDialog.tsx` | Dialog tło z CSS vars zamiast `rgba(10,10,28,0.95)` |
| `components/cockpit/LeftWing.tsx` | Już używa CSS vars — OK |
| `components/cockpit/RightWing.tsx` | j.w. — OK |

### Nowa paleta `.gemini-hybrid`

```css
.gemini-hybrid {
  --background: 0 0% 96%;        /* #F5F5F5 jasnoszary */
  --foreground: 0 0% 12%;        /* ciemny tekst */
  --primary: 213 94% 52%;        /* #2563EB blue */
  --secondary: 220 14% 92%;      /* jasny szary panel */
  --muted: 220 9% 88%;
  --accent: 38 100% 50%;         /* amber/orange */
  --destructive: 354 100% 58%;
  --border: 220 13% 87%;
  --ring: 213 94% 52%;
  --card: 0 0% 100%;             /* biały card */
  --card-foreground: 0 0% 12%;

  /* Multi-color per sekcja */
  --accent-tasks: 217 91% 60%;   /* blue */
  --accent-calendar: 38 92% 50%; /* amber */
  --accent-knowledge: 160 84% 39%; /* emerald */
  --accent-email: 191 91% 37%;   /* cyan */
  --accent-voice: 263 70% 50%;   /* purple */
  --accent-health: 142 76% 36%;  /* green */

  /* 3D scene */
  --bg-void: #F0F0F5;
  --orb-glow-opacity: 0.3;
  --grid-color: rgba(0,0,0,0.05);
}
```

### Przełącznik motywów
- Dodać `ThemeSwitcher` component (dropdown w top bar)
- Zapisywać wybrany motyw w `localStorage` + `exo_tenants.preferences`
- Domyślny motyw: `gemini-hybrid` (jasny) dla nowych userów

### Req pokryte: S1, S2, S3, S4, A6

---

## FAZA 2 — Nowy layout: Mindmap Full + Floating Panels

### Cel
Przebudowa głównego widoku dashboardu. Mindmap 3D na cały ekran. Chat i widgety jako floating panels które można otwierać, zamykać, przesuwać.

### Decyzje użytkownika
- Mindmap full screen jako tło
- Chat = floating panel (minimizable ale zawsze dostępny do wysyłania wiadomości)
- HUD widgety (tasks, calendar, knowledge) jako floating karty
- Zachować stary cockpit HUD jako opcja (layout mode toggle)

### Nowa architektura

```
DashboardPage
├── LayoutModeSwitch (toggle: mindmap / cockpit / grid)
├── ThemeSwitcher
│
├── [mode: mindmap] MindmapLayout
│   ├── MindMap3D (fullscreen background, z-0)
│   ├── FloatingPanelManager (z-10)
│   │   ├── ChatPanel (floating, minimizable, always accessible)
│   │   │   └── HomeChat (existing component)
│   │   ├── TasksPanel (floating, optional)
│   │   ├── CalendarPanel (floating, optional)
│   │   ├── KnowledgePanel (floating, optional)
│   │   ├── EmailPanel (floating, optional)
│   │   └── NodeDetailPanel (opens on node click)
│   ├── PanelDock (bottom bar — ikony zamkniętych paneli)
│   ├── FloatingCallButton (z-50)
│   └── QuickInput (z-50, mini chat input zawsze widoczny na dole)
│
├── [mode: cockpit] CyberpunkDashboard (existing — unchanged)
│
├── [mode: grid] CanvasGrid (existing — unchanged)
```

### Nowe pliki do stworzenia

| Plik | Opis | LOC est. |
|------|------|----------|
| `components/layout/MindmapLayout.tsx` | Nowy layout orchestrator | ~120 |
| `components/layout/FloatingPanel.tsx` | Draggable + resizable panel | ~200 |
| `components/layout/FloatingPanelManager.tsx` | Zarządza wieloma panelami | ~150 |
| `components/layout/PanelDock.tsx` | Dock bar na dole z ikonami | ~80 |
| `components/layout/QuickInput.tsx` | Mini input bar (zawsze widoczny) | ~60 |
| `components/layout/LayoutModeSwitch.tsx` | Toggle mindmap/cockpit/grid | ~40 |
| `lib/stores/usePanelLayoutStore.ts` | Zustand store dla paneli | ~100 |

### Pliki do modyfikacji

| Plik | Co zrobić |
|------|-----------|
| `components/dashboard/CyberpunkDashboard.tsx` | Dodać 3. layout mode (mindmap). Switch między trybami. |
| `app/dashboard/page.tsx` | Dodać LayoutModeSwitch w props |
| `components/cockpit/CockpitHUDShell.tsx` | Zachować bez zmian (tryb cockpit) |
| `components/mindmap/MindMap3D.tsx` | Dodać callback `onNodeClick` → opens floating panel |
| `components/dashboard/HomeChat.tsx` | Owinąć w FloatingPanel wrapper |

### FloatingPanel — specyfikacja

```typescript
interface FloatingPanelProps {
  id: string;
  title: string;
  icon: LucideIcon;
  accentColor: string;      // per-section color
  defaultPosition: { x: number; y: number };
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  isMinimized: boolean;
  isClosable: boolean;       // chat nie jest closable
  onClose?: () => void;
  onMinimize?: () => void;
  children: ReactNode;
}
```

- Drag: mousedown na header → mousemove → mouseup
- Resize: corner handle (bottom-right)
- Minimize: click na header icon → schowa się do PanelDock
- Z-index: focused panel na wierzch
- Snap: optional snap do krawędzi ekranu

### PanelDock (dolny pasek)

```
┌──────────────────────────────────────────────────────────┐
│ 💬Chat  📋Tasks  📅Calendar  📚Knowledge  📧Email  [+]   │
└──────────────────────────────────────────────────────────┘
```

- Kliknięcie ikony → otwiera/minimalizuje panel
- `[+]` → lista dostępnych widgetów do dodania
- Zminimalizowane panele pokazują badge z liczbą (np. 3 nowe taski)

### QuickInput (zawsze widoczny)

- Mini input bar na dole ekranu (nad PanelDock)
- Enter → wysyła do chatu (nawet gdy ChatPanel zminimalizowany)
- Automatycznie otwiera ChatPanel po wysłaniu
- Ikona mikrofonu → voice input

### Persystencja layoutu

- `exo_canvas_widgets` table (istniejąca) — rozszerzyć o `layout_mode` column
- Zapisywać: pozycje paneli, rozmiary, które otwarte, layout mode
- Auto-save co 2s debounce
- Restore on login

### Req pokryte: L1, L2, L3, L4, L5, K6, K7, A1, B7

---

## FAZA 3 — Chat = Claude Code + Bug fixes

### Cel
Główny chat ExoSkull ma działać jak Claude Code — full agent z dostępem do kodu, MCP, bash, git. Plus naprawy krytycznych bugów.

### 3A. Chat always code-capable

**Jak to działa teraz:**
- Chat → `/api/chat/stream` → VPS agent backend (circuit breaker) → lub local gateway
- Claude Code → `/api/claude-code/chat` → VPS executor (proxy) — osobny flow
- Brak współdzielenia pamięci, narzędzi, kontekstu

**Docelowo:**
- Chat → `/api/chat/stream` (ten sam endpoint)
- Agent SDK automatycznie ma dostęp do code tools (read, write, bash, git, glob, grep)
- Gdy user powie "edytuj plik X" → agent używa code tools inline
- Diff viewer, file browser, terminal output renderowane w chacie jako rich blocks
- NIE osobny widok — wszystko w tym samym strumieniu SSE

**Pliki do zmiany:**

| Plik | Co |
|------|----|
| `lib/agent-sdk/exoskull-agent.ts` | Dodać code tools (read_file, write_file, bash, git, glob, grep, edit_file, tree) do web_chat channel config |
| `lib/iors/tools/code-execution-tools.ts` | Upewnić się że tools działają przez VPS proxy (nie lokalnie na Vercel) |
| `components/dashboard/HomeChat.tsx` | Nowe typy SSE events: `file_change`, `code_diff`, `terminal_output` → rich rendering |
| `components/chat/CodeBlock.tsx` | NOWY — renderowanie kodu z syntax highlighting + copy button |
| `components/chat/DiffViewer.tsx` | NOWY — inline diff (green/red lines) |
| `components/chat/TerminalOutput.tsx` | NOWY — terminal-style monospace output |
| `components/chat/FileChange.tsx` | NOWY — karta z info o zmienionym pliku |

**Nowe SSE event types:**

```typescript
// Istniejące (zachować):
"delta" | "done" | "error" | "tool_start" | "tool_end" | "thinking_step"

// Nowe:
"code_diff"       → { file: string, diff: string, language: string }
"terminal_output" → { command: string, output: string, exitCode: number }
"file_change"     → { path: string, action: "created"|"modified"|"deleted" }
```

### 3B. Bug fix: Orb delete nie działa (K2, B2)

**Root cause do zbadania:**
- `useOrbData.ts` line ~removeNode function
- API endpoints: `/api/knowledge/values`, `/api/knowledge/loops`, etc.
- mission/challenge używa body `{ id }` zamiast query param — sprawdzić czy backend obsługuje DELETE z body

**Fix:**
1. Sprawdzić każdy endpoint DELETE (values, loops, quests, missions, challenges, ops)
2. Naprawić format request (query param vs body) per type
3. Dodać error logging w `removeNode()`
4. Test każdego type delete

### 3C. Bug fix: IORS pamięć (F2, B3)

**Root cause:**
- `getThreadContext()` w agent SDK ładuje ostatnie 50 wiadomości
- ALE: wiadomości są append'owane do `exo_unified_messages` DOPIERO PO odpowiedzi (za późno)
- Nowa wiadomość user'a NIE jest w kontekście gdy agent przetwarza

**Fix:**
1. W `gateway.ts`: append user message PRZED wywołaniem Agent SDK
2. Agent SDK: include current user message w system prompt (nie tylko z DB)
3. Thread context: fetch last 50 + current message = 51

### 3D. Bug fix: Quest progress zawsze 0% (znaleziony w audycie)

**Root cause:** `useOrbData.ts` line 177:
```typescript
// BUG: ops_count - (ops_count || 0) = 0 zawsze
((q.ops_count - (q.ops_count || 0)) / q.ops_count) * 100
```

**Fix:**
```typescript
((q.completed_ops || 0) / (q.ops_count || 1)) * 100
```

### 3E. Bug fix: Code sidebar button position (N3, B8)

**Root cause:** CodeSidebar button ukryty za innymi elementami lub poza viewport

**Fix:**
1. Sprawdzić z-index CodeSidebar toggle button
2. Ustawić fixed position (top-right lub right-center)
3. Dodać wizualne wyróżnienie (glow/pulse)

### 3F. Brightness/opacity orbów (S6)

**Fix:**
1. Dodać slider w ustawieniach dashboard (lub w context menu mindmap)
2. CSS variable `--orb-glow-opacity` kontroluje intensity
3. `--orb-brightness` kontroluje jasność kul 3D
4. Zapisywać w tenant preferences

### Req pokryte: F1, F2, A2, K2, B2, B3, B8, N3, S6, V6, quest progress bug

---

## FAZA 4 — Auth, Login, Onboarding polish

### 4A. Login tabs (N2, B6)

**Sprawdzić aktualny stan** — czy TabsUI już zaimplementowano w ostatnim commicie.

Jeśli nie:
1. `app/login/page.tsx` → Radix UI Tabs: "Zaloguj się" | "Stwórz konto"
2. URL param: `/login?tab=signup` → default tab = signup
3. Default tab = login

### 4B. Reset hasła (F7, B5)

1. Dodać link "Zapomniałeś hasła?" pod polem hasła
2. Stworzyć `app/reset-password/page.tsx`
3. Użyć `supabase.auth.resetPasswordForEmail()`
4. Stworzyć `app/auth/reset-callback/route.ts` dla linku z maila
5. UI: pole email → przycisk "Wyślij link resetujący" → komunikat sukcesu

### 4C. Real-time walidacja formularzy (F8)

1. Email: format check (regex) → inline error
2. Hasło: min 6 znaków → progress indicator / wymagania widoczne
3. Password visibility toggle (eye icon)
4. Hasło powtórz: match check
5. Submit button disabled dopóki formularz invalid

### 4D. Onboarding loading states (V7)

1. BirthChat → dodać skeleton/spinner podczas ładowania pytań
2. Progress bar (step X of Y)
3. Smooth transitions między krokami

### 4E. Privacy/Terms — ToC + collapsible (V8)

1. `app/privacy/page.tsx` → dodać Table of Contents (anchor links)
2. Collapsible sections (Radix Accordion)
3. Lepszy kontrast tekstu
4. Dodać skip-to-content link (`<a href="#main" class="sr-only focus:not-sr-only">`)

### Req pokryte: N2, B6, F7, B5, F8, V7, V8

---

## FAZA 5 — Backend: Pamięć + VPS + Auth migration

### 5A. Unifikacja pamięci IORS (A5)

**Aktualnie:** 6 systemów pamięci (search.ts, knowledge-graph.ts, highlights, daily summaries, entity search, unified thread) — nie połączone.

**Docelowo:** Jeden `unifiedSearch()` entry point który:
1. Vector search (pgvector embeddings) — semantic
2. Keyword search (PostgreSQL ilike) — exact
3. Entity search (entity extraction + graph) — relational
4. Score normalization + entity boost
5. Result deduplication

**Pliki:**
| Plik | Co |
|------|----|
| `lib/memory/search.ts` | Rozszerzyć o vector search fallback |
| `lib/memory/unified-search.ts` | NOWY — single entry point |
| `lib/agent-sdk/exoskull-agent.ts` | Użyć `unifiedSearch()` zamiast current `getThreadContext()` |

### 5B. VPS executor (F6)

1. Sprawdzić czy VPS działa (ping 57.128.253.15:3500)
2. Naprawić circuit breaker w `/api/chat/stream/route.ts`
3. Dodać health check endpoint na VPS
4. Multi-tenant isolation (per-user workspace dirs)

### 5C. Auth routing migracja (N4)

1. Kontynuować migrację legacy routes do nowego auth systemu
2. Top 30 routes z listy
3. Pattern: `createRouteHandlerClient()` → `createClient()` z `@supabase/ssr`

### Req pokryte: A5, F6, N4

---

## FAZA 6 — Później (mobile + P2 improvements)

> **NISKI PRIORYTET** — do zrobienia po fazach 1-5. Dokumentuję tu żeby nic nie zostało pominięte.

| Req | Opis | Co zrobić |
|-----|------|-----------|
| S5 | WCAG kontrast audit | Audit WCAG AA na neonowych elementach |
| N5 | Admin sidebar mobile | Hamburger menu na <768px |
| K8 | Auto-fill formularzy (1Password) | Puppeteer + 1Password MCP |
| M1 | Mobile bottom nav overlap | `pb-20` na main content |
| M2 | Mobile widget overflow | `grid-cols-1` na <640px |
| M3 | Mobile gaps | Zmniejszyć rowHeight/margin w RGL config |
| M4 | Admin sidebar mobile | = N5 |
| M6 | WebGL fallback mobile | JUŻ DZIAŁA |

---

## Kolejność wykonania

```
F1 (Theme)     ████████░░  ~4h   — nowy motyw, przełącznik, CSS vars
    ↓
F2 (Layout)    ████████████░░░░  ~10h  — floating panels, mindmap layout, dock
    ↓
F3 (Chat+Bugs) ████████████░░░░  ~10h  — code tools w chacie, orb delete, pamięć
    ↓
F4 (Auth/UX)   ██████░░  ~4h   — login tabs, reset hasła, walidacja, onboarding
    ↓
F5 (Backend)   ████████░░  ~6h   — unified search, VPS, auth migration
    ↓
F6 (Mobile)    ░░░░░░░░  ~4h   — później, osobny sprint
```

**Łącznie F1-F5: ~34h pracy agentów**

---

## Struktura agentów do wykonania

```
F1: Theme
  ├── Agent A: globals.css + tailwind.config.ts (nowy motyw)
  ├── Agent B: Komponenty hardcoded dark → CSS vars (10 plików)
  └── Agent C: ThemeSwitcher component + persystencja

F2: Layout
  ├── Agent D: FloatingPanel + FloatingPanelManager + PanelDock
  ├── Agent E: MindmapLayout orchestrator + LayoutModeSwitch
  ├── Agent F: QuickInput + integracja z HomeChat
  └── Agent G: Persystencja layoutu (DB + API)

F3: Chat + Bugs
  ├── Agent H: Code tools → Agent SDK (web_chat channel)
  ├── Agent I: Rich chat blocks (CodeBlock, DiffViewer, TerminalOutput)
  ├── Agent J: Bug fixes (orb delete, quest progress, code sidebar)
  └── Agent K: IORS pamięć fix (gateway append before processing)

F4: Auth/UX
  ├── Agent L: Login tabs + reset hasła
  └── Agent M: Walidacja formularzy + onboarding + privacy ToC

F5: Backend
  ├── Agent N: Unified search
  ├── Agent O: VPS executor fix + health check
  └── Agent P: Auth migration (30 routes)
```

---

## Testy po każdej fazie

| Faza | Test |
|------|------|
| F1 | Przełączanie 4 motywów. Każdy komponent czytelny w jasnym. Orby widoczne. |
| F2 | Mindmap full → otwórz/zamknij/przesuń panele. Chat minimalizacja + QuickInput. Zapis layoutu. |
| F3 | Napisz "edytuj plik X" → agent edytuje, diff widoczny. Usuń orba → działa. Pamięć działa między wiadomościami. |
| F4 | Login → tabs działają. Reset hasła → email przychodzi. Walidacja inline. |
| F5 | Unified search zwraca wyniki z 3 źródeł. VPS executor odpowiada. Auth routes działają. |

---

## Wymagania POTWIERDZONE jako już działające (nie ruszać)

| Req | Co | Status |
|-----|-----|--------|
| K3 | Orby context menu 3D | ✅ Działa |
| K4 | OrbFormDialog | ✅ Działa (potrzebuje theme F1) |
| K9 | WebGL fallback | ✅ Działa (CyberpunkScene.tsx) |
| F3 | Routing greeting → orchestrator | ✅ Naprawione |
| F4 | Dashboard ładowanie | ✅ Naprawione |
| F5 | Wiring audit | ✅ Zrobiony |
| F10 | MAPEK loop | ✅ Działa |
| A3 | Multi-model routing | ✅ Działa |
| A4 | Voice pipeline | ✅ Działa |
| B1 | Biały ekran | ✅ Naprawione |
| M6 | WebGL fallback mobile | ✅ Działa |

---

## Wymagania POMINIĘTE (landing page — per user decision)

| Req | Co | Powód |
|-----|-----|-------|
| N1 | Landing nawigacja | "landing to w ogole trzeba zaktualizowac... narazie mozemy go olac" |
| V1 | Landing język | j.w. |
| V2 | Landing social proof | j.w. |
| V3 | Landing pricing | j.w. |
| V4 | Landing testimoniale | j.w. |
| V5 | Landing hero mobile | j.w. |
| B9-B13 | Landing bugi | j.w. |

**Wszystkie zostaną zrobione gdy landing page będzie na nowo projektowany.**
