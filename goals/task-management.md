# Task Management Workflow

> Zarzadzanie zadaniami uzytkownika - tworzenie, tracking, reminders.

---

## Cel

Byc "zewnetrzna pamiecia" uzytkownika dla zadan.
Nie kolejny task manager - inteligentne wsparcie.

---

## Triggery

| Trigger | Source | Action |
|---------|--------|--------|
| Voice command | "Dodaj zadanie X" | Create task |
| SMS command | "todo: X" | Create task |
| API call | POST /api/tasks | Create task |
| Pattern detection | Task overdue 3+ days | Reminder |
| Daily check-in | Morning | Review today's tasks |
| External sync | Todoist, Google Tasks | Import tasks |

---

## Narzedzia

| Tool | Path | Usage |
|------|------|-------|
| Task Manager Executor | `lib/mods/executors/task-manager.ts` | CRUD operations |
| GHL Opportunities | `lib/ghl/opportunities.ts` | CRM sync (optional) |
| CRON Dispatcher | `lib/cron/dispatcher.ts` | Overdue reminders |
| Todoist Client | `lib/rigs/todoist/client.ts` | External sync |
| Model Router | `lib/ai/model-router.ts` | NLP for task parsing |

---

## Data Model

### Task Schema

```typescript
interface Task {
  id: string                    // UUID
  tenant_id: string             // User ID
  title: string                 // Task title
  description?: string          // Optional details
  priority: 1 | 2 | 3 | 4       // 1=urgent, 4=someday
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  due_date?: string             // ISO date (optional)
  due_time?: string             // HH:MM (optional)
  recurrence?: RecurrenceRule   // For recurring tasks
  tags?: string[]               // Optional tags
  source: 'voice' | 'sms' | 'api' | 'sync' | 'system'
  external_id?: string          // If synced from external
  completed_at?: string         // When completed
  created_at: string
  updated_at: string
}

interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number              // Every N days/weeks/months
  days_of_week?: number[]       // For weekly: [1, 3, 5] = Mon, Wed, Fri
  end_date?: string             // When to stop recurring
}
```

### Priority System

| Priority | Meaning | Use For |
|----------|---------|---------|
| 1 | Urgent | Must do today |
| 2 | High | Important, this week |
| 3 | Normal | Regular tasks |
| 4 | Low | Someday/maybe |

---

## Task Operations

### Create Task

**Voice:**
```
User: "Dodaj zadanie: zadzwonic do Marka jutro"

Parse:
- title: "Zadzwonic do Marka"
- due_date: tomorrow
- priority: 3 (default)

Response: "Dodane na jutro."
```

**SMS:**
```
User: "todo: kupic mleko"

Parse:
- title: "Kupic mleko"
- priority: 3 (default)
- due_date: null

Response: "Dodane."
```

**API:**
```
POST /api/tasks
{
  "title": "Zadzwonic do Marka",
  "priority": 2,
  "due_date": "2026-02-03"
}
```

### Get Tasks

**Voice:**
```
User: "Co mam dzisiaj?"

Query: Tasks where due_date = today OR priority = 1
Format: "Masz 3 zadania dzisiaj. Najpilniejsze: zadzwonic do Marka."
```

**API:**
```
GET /api/tasks?filter=today
GET /api/tasks?filter=overdue
GET /api/tasks?status=pending
```

### Complete Task

**Voice:**
```
User: "Zrobilem - zadzwonilem do Marka"

Match: Find task by title similarity
Action: Mark as completed
Response: "Odhaczylem."
```

**API:**
```
PATCH /api/tasks/{id}
{ "status": "completed" }
```

### Update Task

**Voice:**
```
User: "Przesun zadanie z Markiem na piatek"

Match: Find task
Action: Update due_date
Response: "Przesuniete na piatek."
```

---

## Smart Features

### Natural Language Parsing

```
Input: "Dodaj zadanie: prezentacja na spotkanie w piatek o 14"

Extract:
- title: "Prezentacja na spotkanie"
- due_date: this Friday
- due_time: 14:00
- priority: inferred from context (meeting = important = 2)
```

### Priority Inference

| Signal | Inferred Priority |
|--------|-------------------|
| "pilne", "urgent", "asap" | 1 |
| "wazne", "important" | 2 |
| "kiedys", "moze", "someday" | 4 |
| Meeting-related | 2 |
| Default | 3 |

### Due Date Parsing

| Input | Interpretation |
|-------|----------------|
| "jutro" | Tomorrow |
| "pojutrze" | Day after tomorrow |
| "w piatek" | Next Friday |
| "za tydzien" | In 7 days |
| "do konca miesiaca" | End of current month |
| "15 lutego" | February 15 |

### Overdue Handling

```
If task overdue for:
- 1 day: Mention in morning check-in
- 3 days: Proactive reminder: "To zadanie wisi od 3 dni. Co z nim?"
- 7 days: Suggest rescheduling or cancelling
- 14 days: Ask if still relevant
```

---

## External Sync

### Todoist Integration

```
1. User connects Todoist rig
2. Sync job runs hourly:
   - Import new tasks
   - Export ExoSkull tasks (optional)
   - Sync completions
3. Conflict resolution: Last-write-wins
```

### Google Tasks Integration

```
Via Google Workspace rig
Same sync logic as Todoist
```

---

## Input

| Data | Source | Required |
|------|--------|----------|
| User command | Voice/SMS/API | Yes |
| User profile | `exo_tenants` | For timezone |
| Existing tasks | `exo_tasks` | For context |
| Calendar events | Rigs | For smart scheduling |

---

## Output

| Output | Destination | When |
|--------|-------------|------|
| Task record | `exo_tasks` | On create/update |
| Confirmation | Voice/SMS | On action |
| Reminder | Voice/SMS | On overdue |
| Sync update | External services | If connected |

---

## Edge Cases

### Duplicate detection

```
If user creates task similar to existing:
- "Masz juz podobne zadanie: [title]. Dodac nowe czy to to samo?"
- If same: Don't create
- If different: Create with disambiguation
```

### Ambiguous task reference

```
User: "Zrobilem to zadanie z Markiem"

If multiple matches:
- "Masz dwa zadania z Markiem. Ktore masz na mysli?"
- List options
- Wait for clarification
```

### Task without due date

```
- Accept without due date
- Assign priority 4 (someday) if not specified
- In weekly review, ask about undated tasks
```

### Recurring task completion

```
User: "Zrobilem codzienne cwiczenia"

Action:
1. Mark today's instance as completed
2. Generate next occurrence
3. "Odhaczylem. Jutro kolejne!"
```

---

## Guardrails

**NEVER:**
- Delete tasks without confirmation
- Change priority automatically without telling user
- Create duplicate tasks without checking
- Ignore overdue tasks in check-ins

**ALWAYS:**
- Confirm task creation
- Show most important task first
- Track source of task
- Log all operations

---

## Metrics

| Metric | Track |
|--------|-------|
| Tasks created | Daily/weekly count |
| Completion rate | % completed vs created |
| Average time to complete | By priority |
| Overdue rate | % tasks that go overdue |
| Source distribution | Voice vs SMS vs API |

---

## Voice Interaction Examples

```
User: "Co mam dzisiaj?"
ExoSkull: "Masz 4 zadania. Najpilniejsze: prezentacja o 14. Potem: spotkanie z Markiem, raport kwartalny, i zakupy."

User: "Dodaj zadanie: oddzwonic do klienta pilne"
ExoSkull: "Dodane jako pilne."

User: "Zrobilem prezentacje"
ExoSkull: "Odhaczylem. Zostaly 3 zadania."

User: "Przesun spotkanie z Markiem na jutro"
ExoSkull: "Przesuniete."

User: "Usun zakupy"
ExoSkull: "Usuwam zakupy z listy?"
User: "Tak"
ExoSkull: "Usuniete."
```

---

## Related

- `goals/daily-checkin.md` - Task review in check-ins
- `mods.yaml` - Task manager mod config
- `lib/mods/executors/task-manager.ts` - Implementation
- `lib/rigs/todoist/client.ts` - Todoist sync
