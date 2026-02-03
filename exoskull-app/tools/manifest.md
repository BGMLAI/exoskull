# Tools Manifest - ExoSkull AI Tools

Index wszystkich narzedzi AI dostepnych w systemie.

---

## Overview

Tools to narzedzia ktore Claude moze wywolywac podczas rozmowy z uzytkownikiem.
Kazde narzedzie wykonuje konkretna akcje (CRUD na danych, integracje zewnetrzne).

**Registry:** `lib/tools/index.ts`
**Types:** `lib/tools/types.ts`

---

## Available Tools

### task

**Plik:** `lib/tools/task-tool.ts`
**Kategoria:** productivity
**Wymaga Rig:** -

**Opis:** Zarzadzanie zadaniami uzytkownika (CRUD na exo_tasks)

**Akcje:**
| Action | Opis |
|--------|------|
| list | Pobierz liste zadan (filter: status, priority, due_date) |
| create | Stworz nowe zadanie |
| update | Zaktualizuj zadanie (title, priority, due_date, status) |
| complete | Oznacz zadanie jako wykonane |
| delete | Usun zadanie |

**Parametry:**
```json
{
  "action": "list|create|update|complete|delete",
  "task_id": "uuid (for update/complete/delete)",
  "title": "string (for create/update)",
  "priority": "low|medium|high",
  "due_date": "ISO date string",
  "status": "pending|in_progress|completed"
}
```

**Voice Examples:**
- "Dodaj zadanie: zadzwonic do mamy"
- "Pokaz moje zadania na dzisiaj"
- "Oznacz zakupy jako zrobione"

---

### calendar

**Plik:** `lib/tools/calendar-tool.ts`
**Kategoria:** productivity
**Wymaga Rig:** google-workspace

**Opis:** Integracja z Google Calendar

**Akcje:**
| Action | Opis |
|--------|------|
| list | Pobierz wydarzenia (date range) |
| create | Stworz nowe wydarzenie |
| update | Zaktualizuj wydarzenie |
| delete | Usun wydarzenie |
| availability | Sprawdz dostepnosc |

**Parametry:**
```json
{
  "action": "list|create|update|delete|availability",
  "event_id": "string (for update/delete)",
  "title": "string",
  "start_time": "ISO datetime",
  "end_time": "ISO datetime",
  "description": "string",
  "attendees": ["email1", "email2"]
}
```

**Voice Examples:**
- "Co mam w kalendarzu jutro?"
- "Dodaj spotkanie z Anią o 15:00"
- "Przełóż spotkanie na piątek"

---

### email

**Plik:** `lib/tools/email-tool.ts`
**Kategoria:** communication
**Wymaga Rig:** google-workspace

**Opis:** Wysylanie i czytanie emaili przez Gmail

**Akcje:**
| Action | Opis |
|--------|------|
| send | Wyslij email |
| draft | Zapisz draft |
| read | Pobierz maile (filter: unread, from, subject) |
| search | Wyszukaj maile |

**Parametry:**
```json
{
  "action": "send|draft|read|search",
  "to": "email@example.com",
  "subject": "string",
  "body": "string",
  "query": "search query (for search)"
}
```

**Voice Examples:**
- "Wyślij maila do Jana: spotkanie przełożone"
- "Sprawdź nieprzeczytane maile"
- "Wyszukaj maile od szefa"

**UWAGA:** Email wymaga review przed wyslaniem (safety guardrail).

---

### web_search

**Plik:** `lib/tools/search-tool.ts`
**Kategoria:** search
**Wymaga Rig:** -

**Opis:** Wyszukiwanie w internecie

**Akcje:**
| Action | Opis |
|--------|------|
| search | Wyszukaj w internecie |

**Parametry:**
```json
{
  "action": "search",
  "query": "search query",
  "num_results": 5
}
```

**Voice Examples:**
- "Wyszukaj pogodę na jutro"
- "Znajdź restauracje włoskie w pobliżu"
- "Co to jest MAPE-K loop?"

---

## Tool Execution

**Entry point:** `executeTool(name, context, params)` w `lib/tools/index.ts`

**Context:**
```typescript
interface ToolContext {
  tenant_id: string;
  conversation_id?: string;
  user_preferences?: Record<string, unknown>;
}
```

**Result:**
```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}
```

---

## Adding New Tools

1. Stworz plik `lib/tools/[name]-tool.ts`
2. Zdefiniuj `ExoTool` (OpenAI function calling format)
3. Zaimplementuj handler `(context, params) => Promise<ToolResult>`
4. Dodaj do `TOOL_REGISTRY` w `lib/tools/index.ts`
5. Zaktualizuj ten manifest

**Template:**
```typescript
import { ExoTool, ToolHandler, ToolResult, ToolContext } from './types';

export const myTool: ExoTool = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['action1', 'action2'] },
      param1: { type: 'string' },
    },
    required: ['action'],
  },
};

export const myHandler: ToolHandler = async (
  context: ToolContext,
  params: Record<string, unknown>
): Promise<ToolResult> => {
  // Implementation
};
```

---

## Tool Categories

| Kategoria | Tools | Opis |
|-----------|-------|------|
| productivity | task, calendar | Zarzadzanie czasem i zadaniami |
| communication | email | Komunikacja zewnetrzna |
| search | web_search | Wyszukiwanie informacji |
| health | (via Mods) | Sleep, energy, mood tracking |
| finance | (via Mods) | Spending tracking |

---

## Security

- Tools sa sandboxowane (tenant isolation)
- External actions (email, calendar) require connected Rig
- Email send wymaga user confirmation (configurable)
- Tool execution jest logowane dla audit trail

---

## Metrics

Tracked w `lib/tools/index.ts`:
- `tool` - which tool was called
- `tenant_id` - who called it
- `success` - did it work
- `duration_ms` - how long

---

VERSION: 1.0
UPDATED: 2026-02-03
