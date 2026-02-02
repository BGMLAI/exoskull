# Goals Manifest - ExoSkull GOTCHA Framework

> Index wszystkich workflow w systemie ExoSkull.
> Kazdy goal definiuje: cel, inputy, narzedzia, outputy, edge cases.

## Status

| Goal | Status | Priorytet |
|------|--------|-----------|
| daily-checkin | Active | P0 |
| voice-conversation | Active | P0 |
| task-management | Active | P1 |
| knowledge-capture | Active | P1 |
| autonomy-execution | Planned | P2 |
| gap-detection | Planned | P2 |
| discovery-onboarding | Active | P0 |

---

## Core Workflows

### [daily-checkin.md](./daily-checkin.md)
**Cel:** Proaktywne check-iny z uzytkownikiem (poranne, wieczorne, custom).

**Triggery:**
- Cron job (dispatcher)
- User request ("zadzwon do mnie o 7")
- Pattern detection (sleep debt, isolation)

**Narzedzia:**
- `lib/cron/dispatcher.ts` - Harmonogram check-inow
- `lib/voice/system-prompt.ts` - Prompt glosowy
- `lib/ghl/messaging.ts` - SMS fallback
- VAPI voice calls

---

### [voice-conversation.md](./voice-conversation.md)
**Cel:** Glosowa interakcja z uzytkownikiem - glowny interfejs ExoSkull.

**Triggery:**
- Inbound call (VAPI webhook)
- Outbound call (scheduled check-in)
- User SMS "zadzwon"

**Narzedzia:**
- `lib/voice/system-prompt.ts` - System prompt builder
- `lib/ai/model-router.ts` - Multi-model routing
- `lib/mods/executors/` - Mod actions (task, mood, habit)
- `lib/ghl/` - CRM + messaging

**Input:**
- User profile (tenant)
- Dynamic context (time, tasks, mood)
- Highlights (auto-learned memory)
- Active role (if any)

**Output:**
- Conversation transcript (stored in bronze)
- Highlights extracted (stored in silver)
- Actions executed (tasks created, messages sent)

---

### [task-management.md](./task-management.md)
**Cel:** Zarzadzanie zadaniami uzytkownika - tworzenie, tracking, reminders.

**Triggery:**
- Voice: "dodaj zadanie X"
- SMS: "todo: X"
- API: `/api/tasks`
- Pattern: overdue task reminder

**Narzedzia:**
- `lib/mods/executors/task-manager.ts` - Task CRUD
- `lib/ghl/opportunities.ts` - GHL opportunities sync
- `lib/cron/dispatcher.ts` - Overdue reminders

**Data model:**
- exo_tasks (Supabase)
- priorities: 1 (urgent) - 4 (someday)
- statuses: pending, in_progress, completed, cancelled

---

### [knowledge-capture.md](./knowledge-capture.md)
**Cel:** Automatyczne wychwytywanie i przechowywanie wiedzy o uzytkowniku.

**Triggery:**
- Post-conversation analysis
- Explicit: "zapamietaj ze..."
- Pattern detection

**Narzedzia:**
- `lib/agents/specialized/highlight-extractor.ts` - Ekstrakcja highlightow
- `lib/learning/highlight-integrator.ts` - Integracja do profilu
- `lib/memory/highlights.ts` - Storage

**Typy wiedzy:**
- preferences (jak lubi)
- patterns (co robi regularnie)
- goals (do czego dazy)
- insights (co zauwazylem)
- facts (obiektywne dane)

---

### [autonomy-execution.md](./autonomy-execution.md) [PLANNED]
**Cel:** Autonomiczne akcje w imieniu uzytkownika (z permission model).

**Triggery:**
- Pattern detected (intervention needed)
- Scheduled action
- User pre-approved action

**Narzedzia:**
- `lib/autonomy/permission-checker.ts` [TBD]
- `lib/autonomy/action-executor.ts` [TBD]
- `lib/ghl/` - External actions

**Permission model:**
- granular: per-action approval
- category: per-domain blanket ("health: auto-log all")
- emergency: crisis actions (upfront consent)

---

### [gap-detection.md](./gap-detection.md) [PLANNED]
**Cel:** Wykrywanie blind spots - czego uzytkownik NIE robi/nie mowi.

**Triggery:**
- Weekly analysis job
- Conversation pattern

**Narzedzia:**
- `lib/agents/specialized/gap-detector.ts` [TBD]
- Data lake analysis (gold layer)

**Gap categories:**
- health (nie wspomina o X)
- social (zero contacts 30+ days)
- financial (no tracking)
- growth (stagnation patterns)

---

### [discovery-onboarding.md](./discovery-onboarding.md)
**Cel:** Pierwsza rozmowa - poznanie uzytkownika.

**Triggery:**
- New user registration
- "zacznij od nowa"

**Narzedzia:**
- `lib/onboarding/discovery-prompt.ts` - Discovery conversation
- `lib/onboarding/types.ts` - Profile schema

**Output:**
- exo_tenants profile populated
- Initial schedule configured
- First check-in scheduled

---

## How to Use Goals

1. **Before starting any workflow** - check if goal exists
2. **Follow the goal** - it defines the full process
3. **Update when needed** - goals are living documentation
4. **Never create without approval** - goals define the system

## Creating New Goals

Template:
```markdown
# [Goal Name]

## Cel
[One sentence objective]

## Triggery
- Trigger 1
- Trigger 2

## Narzedzia
- `lib/path/to/tool.ts` - Description

## Input
- Required inputs

## Output
- Expected outputs

## Edge Cases
- Edge case 1: [solution]
- Edge case 2: [solution]

## Guardrails
- What NOT to do
```

---

**Last updated:** 2026-02-02
**Version:** 1.0
