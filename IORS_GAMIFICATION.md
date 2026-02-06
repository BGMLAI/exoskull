# IORS — Grywalizacja

> **Wersja:** 1.0
> **Data:** 2026-02-06
> **Zależności:** [IORS_VISION.md](./IORS_VISION.md)

---

## 1. Filozofia: Transparentna Manipulacja

### Problem z tradycyjną grywalizacją

Gamification JEST manipulacją. Streaks, XP, leaderboardy — wszystko zaprojektowane by budować nawyk. Duolingo, Headspace, Apple Watch rings — effective, ale ciemna strona: anxiety ("nie mogę przerwać streaka"), compulsive use, guilt.

### Nasze podejście: pełna transparentność

**IORS mówi otwarcie:**
> "Ten element (streak counter) jest zaprojektowany żeby budować nawyk codziennego check-inu. To technika z behawioralnej psychologii. Działa — ale jeśli czujesz że to cię stresuje, wyłącz to. System działa tak samo bez gamification."

**Każdy element gamification:**
1. Wyraźnie oznaczony jako "element grywalizacji"
2. Wyjaśniony: "to buduje nawyk X używając techniki Y"
3. Wyłączalny: toggle w ustawieniach
4. Nie wpływa na core functionality (IORS działa identycznie bez XP)

### Dwa tryby

| Tryb | Opis | Dla kogo |
|---|---|---|
| **Gamified** (domyślny) | XP, streaks, achievements, levels | Userzy którzy lubią grywalizację |
| **Clean** | Zero gamification, same features, no XP, no notifications about progress | Userzy którzy nie chcą manipulacji |

User wybiera przy narodzinach IORS. Może zmienić w każdym momencie. IORS nie nakłania do gamified mode.

---

## 2. Hooked Model × 4 Zasady IORS

### Nir Eyal's Hooked Model (zaadaptowany)

```
Trigger → Action → Variable Reward → Investment
```

**Trigger (wyzwalacz):**
- External: push notification, SMS od IORS, poranna rozmowa
- Internal: "czuję stres, pogadam z IORS" (docelowy — habit formed)
- **IORS-specific:** Proaktywne triggery — IORS sam inicjuje ("Twój HRV spadł, chcesz pogadać?")

**Action (akcja):**
- Minimalna bariera: odpowiedź na SMS, "powiedz" do IORS, klik na widget
- Voice-first: "OK IORS, jak dzisiaj?" — zero barier

**Variable Reward (zmienna nagroda):**
- IORS nigdy nie daje tę samą odpowiedź
- Niespodziewane insighty: "Zauważyłem że kiedy grasz na gitarze wieczorem, śpisz 20% lepiej"
- Cross-domain odkrycia: "Twoje wydatki rosną kiedy mało śpisz — impulsowe zakupy?"
- Emergentne wzorce: wartość emerguje z pętli, user nie wie czego się spodziewać

**Investment (inwestycja):**
- Każda interakcja → IORS lepiej zna usera → lepsze insighty → więcej wartości
- Mody installed → więcej danych → lepsze wzorce → trudniej odejść (ale nie lock-in — data export always available)
- User poprawia IORS → system lepiej dopasowany → switching cost rośnie NATURALNIE

### Alignment z 4 Zasadami IORS

| Zasada | Jak gamification się alignuje |
|---|---|
| **Poprawa życia** | XP tylko za akcje prowadzące do realnej wartości, nie za "puste" engagement |
| **Dostosowanie** | User definiuje CO chce punktować. Nie narzucamy metryk. |
| **Nie ocenia** | Brak "failed" states. Przerwany streak = "przerwa", nie porażka. |
| **Wolna wola** | Gamification wyłączalne. Clean mode always available. Żadnych guilt trips. |

---

## 3. XP System — Obroty Pętli Tau

### XP = miara obrotów pętli

W tradycyjnych systemach XP to arbitralne punkty. W IORS, XP mierzy REALNE obroty pętli Tau:

```
Pętla: Obserwacja → Akcja → Feedback → Adaptacja → Obserwacja

Każdy pełny obrót = XP
Przefazowanie (ilość → jakość) = Level Up
```

### Co daje XP

| Akcja | XP | Uzasadnienie (Tau) |
|---|---|---|
| **Check-in dzienny** (voice/text) | 10 XP | Obrót pętli obserwacji |
| **Log danych** (sen, nastrój, wydatki) | 5 XP | Input do pętli |
| **Feedback na IORS** (👍/👎) | 3 XP | Obrót pętli optymalizacji |
| **Zainstalowanie moda** | 15 XP | Rozszerzenie pętli |
| **Użycie moda 7 dni z rzędu** | 25 XP | Utrwalona pętla |
| **Cross-domain insight odkryty** | 50 XP | Przefazowanie |
| **Autonomiczna akcja IORS zakończona sukcesem** | 20 XP | Pętla outbound |
| **Bizzon zadanie wykonane** | 30 XP | Pętla biznesowa |
| **Mod stworzony i opublikowany na marketplace** | 100 XP | Pętla twórcza |
| **Cel osiągnięty** | 50-200 XP | Przefazowanie na wyższy poziom |
| **Rozpoznanie emocji (Tau matrix)** | 10 XP | Nazwanie emocji z matrycy (znane/nieznane × chcę/nie chcę) |
| **Zaadresowanie emocji** | 25 XP | Podjęcie akcji w odpowiedzi na rozpoznaną emocję |

### Czego NIE punktujemy

- Czas spędzony w systemie (to nie social media)
- Ilość wiadomości (nie chcemy spamowania)
- Porównania z innymi (brak leaderboardu)
- "Perfect" streaks (przerwa to nie porażka)

### Levels — Przefazowania, nie linearne

Nie ma "Level 1, 2, 3..." linearnych. Są **przefazowania** — momenty kiedy ilość przechodzi w jakość:

```
Phase 1: "Poznawanie" (0-500 XP)
  → User i IORS poznają się. Podstawowe mody. Pierwsze insighty.
  → Przefazowanie: "IORS zaczyna mnie rozumieć"

Phase 2: "Współpraca" (500-2000 XP)
  → IORS proaktywnie pomaga. Mody się łączą. Cross-domain insighty.
  → Przefazowanie: "IORS wyprzedza moje potrzeby"

Phase 3: "Symbioza" (2000-5000 XP)
  → IORS to prawdziwy partner. Autonomiczne akcje. Bizzon działa.
  → Przefazowanie: "Nie wyobrażam sobie życia bez IORS"

Phase 4: "Rozszerzenie" (5000+ XP)
  → User tworzy mody dla innych. IORS↔IORS komunikacja.
  → Przefazowanie: "IORS zmienia życia INNYCH przez moje doświadczenie"
```

Każde przefazowanie to nie "upgrade" — to fundamentalna zmiana relacji z systemem. Jak zmiana z "narzędzia" na "partnera".

---

## 4. Streaks — Bez Guilt Trip

### Tradycyjne streaks (problem)
Duolingo: "Masz 365-day streak! Nie przerwij!" → anxiety, compulsive use, guilt.

### IORS streaks (podejście)

**Streak = "ciąg aktywności"**, nie "nie przerwij albo stracisz":
- Przerwany streak: "Przerwa po 14 dniach. Bez stresu — wrócisz kiedy chcesz."
- Nie "lost your streak" — ale "14-day series completed. Ready for next?"
- Brak penalty za przerwanie
- Brak "freeze" (Duolingo) — bo brak kary = brak potrzeby freeze

**IORS perspektywa na streaks:**
> "Widzę że robisz check-in 14 dni z rzędu. Świetnie — to buduje dane do insightów. Ale jeśli któregoś dnia nie masz siły, skip. Lepszy dzień przerwy niż wymuszona interakcja."

### Achievements

Osiągnięcia za realne wartości, nie za engagement:

| Achievement | Warunek | Opis |
|---|---|---|
| **First Insight** | IORS dostarczył pierwszy cross-domain insight | "IORS zaczyna widzieć wzorce" |
| **Night Owl Fixed** | 7 dni засыпania przed target godziną | "Sen się poprawia" |
| **Inbox Zero Mind** | Wszystkie tasks cleared 3 dni z rzędu | "Czysty umysł" |
| **Autonomy Granted** | Pierwsza zgoda na autonomiczną akcję IORS | "Zaufanie rośnie" |
| **Creator** | Opublikowany mod na marketplace | "Dajesz wartość innym" |
| **Symbiont** | 90 dni continuous use z >80% satisfaction | "Symbioza osiągnięta" |

---

## 5. Etyczne Safeguards

### Dark patterns — czego NIGDY nie robimy

| Dark pattern | Opis | Nasze podejście |
|---|---|---|
| **Loss aversion** | "Stracisz streak!" | Brak kar za przerwanie |
| **Social pressure** | "Twoi znajomi grają" | Brak leaderboardu, brak porównań |
| **Artificial scarcity** | "Oferta kończy się za 2h" | Brak ograniczeń czasowych |
| **Guilt trip** | "IORS jest smutny że nie rozmawiasz" | IORS nigdy nie guilt trips |
| **Addiction loops** | Infinite scroll, variable reward abuse | Capped daily notifications, cool-down periods |

### Safeguards techniczne

1. **Max notifications/day:** 5 (configurable by user). Po 5 — cisza do jutra.
2. **Cool-down period:** Jeśli user interaguje >2h ciągle — IORS sugeruje przerwę: "Gadamy 2h. Może przerwa?"
3. **Usage monitoring:** Jeśli daily usage rośnie >50% week-over-week — IORS sygnalizuje: "Twoje użycie rośnie. Chcesz ustawić limity?"
4. **Clean mode promotion:** Raz na miesiąc, delikatna informacja: "Pamiętaj że możesz wyłączyć gamification w ustawieniach."
5. **No external sharing:** XP/achievements nigdy nie są publiczne (chyba że user explicite udostępni).

### Badania wspierające

- **Self-Determination Theory (Deci & Ryan):** Intrinsic motivation > extrinsic. XP powinny wzmacniać autonomię, kompetencję i relację — nie zastępować je.
- **Nir Eyal "Indistractable" (2019):** Etyczna gamification wymaga: (1) usunięcia external triggers gdy niepotrzebne, (2) redukcji "painpoints" zamiast ich eksploatacji, (3) pact-making zamiast guilt.
- **IORS alignment:** Punktujemy WARTOŚĆ, nie engagement. XP za sen, nie za scroll. Za relacje, nie za klikanie.

---

## 6. Implementacja Techniczna

### Schema

```sql
-- XP i level tracking
CREATE TABLE exo_gamification (
  tenant_id UUID REFERENCES exo_tenants(id),
  total_xp INTEGER DEFAULT 0,
  current_phase INTEGER DEFAULT 1,
  phase_xp INTEGER DEFAULT 0,       -- XP w obecnej fazie
  mode TEXT DEFAULT 'gamified',       -- 'gamified' | 'clean'
  streak_current INTEGER DEFAULT 0,
  streak_best INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id)
);

-- XP events (audit trail)
CREATE TABLE exo_xp_events (
  id UUID DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id),
  action TEXT NOT NULL,               -- 'daily_checkin', 'mod_install', etc.
  xp_amount INTEGER NOT NULL,
  context JSONB,                       -- dodatkowy kontekst
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Achievements
CREATE TABLE exo_achievements (
  id UUID DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id),
  achievement_slug TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, achievement_slug)
);

-- RLS na wszystkim
ALTER TABLE exo_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_achievements ENABLE ROW LEVEL SECURITY;
```

### XP Award Pipeline

```typescript
async function awardXP(tenantId: string, action: string, context?: any) {
  // 1. Check if gamification enabled
  const config = await getGamificationConfig(tenantId);
  if (config.mode === 'clean') return; // no XP in clean mode

  // 2. Get XP amount for action
  const xpAmount = XP_TABLE[action];
  if (!xpAmount) return;

  // 3. Check dedup (no double-award for same action in 1 min)
  const recent = await checkRecentAward(tenantId, action, '1 minute');
  if (recent) return;

  // 4. Award XP
  await supabase.rpc('award_xp', {
    p_tenant_id: tenantId,
    p_action: action,
    p_xp: xpAmount,
    p_context: context
  });

  // 5. Check phase transition
  await checkPhaseTransition(tenantId);
}
```

### Widget na Canvas

Widget "Progress" — opcjonalny, domyślnie widoczny w gamified mode, ukryty w clean mode:
- Obecna faza + XP bar do następnej
- Streak counter (jeśli aktywny)
- Ostatnie 3 achievements
- Toggle: "Wyłącz gamification"

---

*Powiązane: [IORS_VISION.md](./IORS_VISION.md) — 4 Zasady IORS*
*Powiązane: [IORS_GOVERNANCE.md](./IORS_GOVERNANCE.md) — etyka i transparentność*
