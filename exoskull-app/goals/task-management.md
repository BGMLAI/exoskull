# Goal: Task Management

Zarzadzanie zadaniami przez voice, dashboard i integracje.

---

## Objective

Zunifikowane zarzadzanie zadaniami z wielu zrodel:
- ExoSkull native (exo_tasks)
- Google Tasks
- Todoist
- Notion

---

## Trigger

| Trigger | Opis |
|---------|------|
| Voice command | "Dodaj zadanie...", "Sprawdz zadania" |
| Dashboard action | UI w /dashboard/tasks |
| Scheduled | Daily task review, overdue alerts |
| Integration sync | Auto-sync z Google Tasks/Todoist |

---

## Inputs

### From Voice/Dashboard
- User intent (create, read, update, complete, delete)
- Task details (title, priority, due_date, description)
- Context (current conversation, active quest)

### From Integrations
- Google Tasks: tasks from default list
- Todoist: tasks from projects
- Notion: tasks from databases

---

## Tools

| Tool | Action |
|------|--------|
| task | CRUD na exo_tasks |
| calendar | Block time for task |

---

## Mods

| Mod | Rola |
|-----|------|
| task-manager | Unified view, auto-prioritize |
| habit-tracker | Recurring tasks as habits |
| focus-mode | Block time for deep work |

---

## Outputs

### Create Task
```json
{
  "task_id": "uuid",
  "title": "string",
  "priority": "high|medium|low",
  "due_date": "ISO date",
  "status": "pending",
  "source": "voice|dashboard|integration"
}
```

### Task List
```json
{
  "tasks": [...],
  "summary": {
    "total": 15,
    "overdue": 2,
    "due_today": 4,
    "completed_today": 3
  }
}
```

---

## Flow: Create via Voice

```
1. User: "Dodaj zadanie: zadzwonic do mamy"
2. Extract:
   - title: "Zadzwonic do mamy"
   - priority: medium (default)
   - due_date: null (ask or default)
3. IF due_date missing AND context suggests urgency:
   - Set due_date = today
4. Create task via task tool
5. Response: "Dodałem: Zadzwonic do mamy. Deadline?"
6. IF user provides deadline:
   - Update task with due_date
7. Optionally sync to Google Tasks (if connected)
```

---

## Flow: Daily Task Review

```
1. Trigger: morning_checkin or explicit "Przegladnij zadania"
2. Fetch:
   - Overdue tasks
   - Due today
   - High priority pending
3. Summarize:
   - "[N] zaległych, [M] na dziś"
   - List top 3 MIT (Most Important Tasks)
4. Offer actions:
   - "Przesunąć coś?"
   - "Zamknąć nieaktualne?"
5. Update based on response
```

---

## Flow: Integration Sync

```
1. Trigger: Manual sync or scheduled (hourly)
2. For each connected integration:
   a. Fetch tasks from source
   b. Match with exo_tasks (by external_id)
   c. CREATE new tasks not in ExoSkull
   d. UPDATE changed tasks
   e. Mark completed if done in source
3. Optionally push ExoSkull tasks → integration
4. Log sync results
```

---

## Priority Logic

### Auto-prioritize (task-manager mod)
```
HIGH if:
  - Deadline < 24h
  - Marked urgent by user
  - Blocked by this task

MEDIUM if:
  - Deadline 1-7 days
  - Part of active Quest
  - Default

LOW if:
  - Deadline > 7 days
  - "Someday/maybe" context
```

---

## Edge Cases

| Przypadek | Obsluga |
|-----------|---------|
| Duplicate task title | Warn: "Masz juz podobne: [X]. Dodac mimo to?" |
| No deadline provided | Ask once, then default to "no deadline" |
| Overdue > 7 days | Suggest archive or reschedule |
| Integration disconnect | Fall back to ExoSkull native only |
| Conflict sync | ExoSkull wins (source of truth) |

---

## Database

**Table:** `exo_tasks`

| Column | Type | Opis |
|--------|------|------|
| id | uuid | PK |
| tenant_id | uuid | FK → exo_tenants |
| title | text | Task title |
| description | text | Optional details |
| priority | enum | high/medium/low |
| status | enum | pending/in_progress/completed/archived |
| due_date | timestamp | Optional deadline |
| completed_at | timestamp | When completed |
| source | text | voice/dashboard/google/todoist/notion |
| external_id | text | ID in external system |
| quest_id | uuid | FK → user_quests (optional) |
| op_id | uuid | FK → user_ops (optional) |

---

## Voice Commands

| Command | Action |
|---------|--------|
| "Dodaj zadanie [X]" | Create task |
| "Moje zadania" | List pending |
| "Zadania na dziś" | List due today |
| "Zaległe zadania" | List overdue |
| "[X] zrobione" | Complete task |
| "Usuń [X]" | Delete task |
| "Przesuń [X] na [Y]" | Update due_date |
| "Priorytet [X] wysoki" | Update priority |

---

## Files Reference

| Plik | Rola |
|------|------|
| lib/tools/task-tool.ts | Task CRUD tool |
| lib/mods/executors/task-manager.ts | Unified sync & insights |
| app/dashboard/tasks/page.tsx | Dashboard UI |
| app/api/tasks/route.ts | REST API |

---

VERSION: 1.0
UPDATED: 2026-02-03
