# Goal: Autonomy Execution

Autonomiczne akcje systemu z permission model.

---

## Objective

Umozliwic ExoSkull dzialanie bez explicit request:
- Proaktywne interwencje (sleep alert, task reminder)
- Gap detection (blind spots)
- Self-optimization (uczenie sie z historii)

Wszystko z **permission model** - user kontroluje co system moze robic sam.

---

## MAPE-K Framework

```
┌─────────────────────────────────────────────────────┐
│                    KNOWLEDGE                         │
│  (Patterns, Learnings, User Profile)                │
└─────────────────────────────────────────────────────┘
        ↑                                    │
        │                                    ↓
┌───────┴───────┐    ┌─────────┐    ┌───────────────┐
│   MONITOR     │───→│ ANALYZE │───→│     PLAN      │
│ (Observe data)│    │(Patterns)│    │(Interventions)│
└───────────────┘    └─────────┘    └───────┬───────┘
                                            │
                                            ↓
                                    ┌───────────────┐
                                    │    EXECUTE    │
                                    │ (With consent)│
                                    └───────────────┘
```

---

## Permission Model

### Grant Types

| Type | Opis | Example |
|------|------|---------|
| action_pattern | Specific action | "send_sms:*" |
| category | Entire category | "communication:*" |
| specific | Single instance | "send_sms:+48123456789" |

### Categories

| Category | Actions |
|----------|---------|
| communication | send_sms, send_email, send_notification |
| tasks | create_task, complete_task, reschedule_task |
| calendar | create_event, modify_event, cancel_event |
| health | log_sleep, log_mood, health_alert |
| finance | categorize_transaction, budget_alert |
| smart_home | adjust_lights, set_thermostat |

### Grant Structure

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "action_pattern": "send_sms:*",
  "category": "communication",
  "allowed": true,
  "spending_limit_usd": 0,
  "daily_limit": 10,
  "expires_at": "2026-12-31",
  "granted_at": "2026-02-03"
}
```

---

## Trigger

| Trigger | Opis |
|---------|------|
| Pattern detected | MAPE-K analysis triggers intervention |
| Scheduled | Cron job for periodic checks |
| Event-driven | Real-time data triggers (HRV drop, etc.) |
| User request | "Dzialaj sam w sprawie X" |

---

## Inputs

### For MONITOR
- All user data (conversations, tasks, health, calendar)
- Integration data (Oura, Google, etc.)
- Historical patterns

### For ANALYZE
- Monitored data
- Learned patterns from Knowledge base
- User profile & preferences

### For PLAN
- Analysis results
- Available actions
- Permission grants
- Current context

### For EXECUTE
- Planned action
- Validated permission
- Execution context

---

## Outputs

### Intervention Object
```json
{
  "id": "uuid",
  "type": "sleep_alert|task_reminder|gap_prompt|...",
  "trigger": "pattern|schedule|event",
  "action": "send_sms",
  "payload": {
    "to": "+48...",
    "message": "..."
  },
  "permission_check": {
    "granted": true,
    "grant_id": "uuid"
  },
  "executed_at": "timestamp",
  "result": "success|failed|blocked"
}
```

---

## Flow: Proactive Intervention

```
1. MONITOR: Observe sleep data - user slept 4h
2. ANALYZE: Pattern = sleep debt accumulating (3 days < 6h)
3. PLAN: Intervention = SMS alert + suggest reschedule
4. CHECK PERMISSION: Does user allow "send_sms:*"?
   - IF NO → Log, skip execution
   - IF YES → Continue
5. EXECUTE: Send SMS
6. KNOWLEDGE: Log result, update patterns
7. FOLLOW-UP: If ignored 3x, escalate (voice call)
```

---

## Flow: Gap Detection

```
1. MONITOR: Scan last 30 days of conversations
2. ANALYZE: Which life domains (Loops) are NOT mentioned?
   - Health: 15 mentions
   - Work: 42 mentions
   - Finance: 0 mentions ← GAP
   - Relationships: 2 mentions ← Potential gap
3. PLAN: Ask about gaps
   - "Nie rozmawialiśmy o finansach. Wszystko OK?"
4. CHECK PERMISSION: "gap_detection" enabled?
5. EXECUTE: Include in next check-in
6. KNOWLEDGE: Log user response, adjust future detection
```

---

## Flow: Self-Optimization

```
1. MONITOR: Track intervention effectiveness
   - Morning check-in: 80% response rate
   - SMS reminders: 40% response rate
   - Voice calls: 95% response rate
2. ANALYZE: SMS not working well for this user
3. PLAN: Switch default channel to voice
4. CHECK: Self-optimization permission?
5. EXECUTE: Update user_job_preferences
6. KNOWLEDGE: Log change, monitor impact
```

---

## Circuit Breaker

```yaml
circuit_breaker:
  max_failures: 3
  cooldown_seconds: 300
  actions_on_failure:
    - log_error
    - alert_user (if critical)
    - pause_autonomy (if systemic)
```

When action fails 3x:
1. Stop further attempts
2. Wait 5 minutes (cooldown)
3. Try alternative approach
4. If still failing, notify user

---

## Safety Guardrails

### NEVER autonomous:
- Medical advice ("see doctor" only)
- Legal advice ("consult attorney" only)
- Financial guarantees
- Data deletion
- Spending above limit
- Contact with strangers without explicit permission

### ALWAYS require confirmation:
- First-time action in new category
- Action above spending limit
- Action outside normal hours
- Action after 3 failed attempts

---

## Database

**Table:** `user_autonomy_grants`

| Column | Type | Opis |
|--------|------|------|
| id | uuid | PK |
| tenant_id | uuid | FK |
| action_pattern | text | Pattern like "send_sms:*" |
| category | text | communication/tasks/etc. |
| allowed | boolean | Permission granted |
| spending_limit_usd | numeric | Max spend per action |
| daily_limit | integer | Max actions per day |
| expires_at | timestamp | Optional expiration |
| granted_at | timestamp | When granted |

**Table:** `exo_autonomy_executions`

| Column | Type | Opis |
|--------|------|------|
| id | uuid | PK |
| tenant_id | uuid | FK |
| intervention_type | text | Type of action |
| trigger | text | What triggered it |
| action | text | What was done |
| result | text | success/failed/blocked |
| executed_at | timestamp | When |

---

## API Endpoints

| Endpoint | Method | Opis |
|----------|--------|------|
| /api/autonomy | GET | List grants |
| /api/autonomy | POST | Create grant |
| /api/autonomy/[id] | PATCH | Update grant |
| /api/autonomy/[id] | DELETE | Revoke grant |
| /api/autonomy/check | POST | Check if action allowed |

---

## Voice Commands

| Command | Action |
|---------|--------|
| "Dzialaj sam w sprawie snu" | Grant sleep-related autonomy |
| "Nie wysylaj SMSow bez pytania" | Revoke SMS autonomy |
| "Jakie masz uprawnienia?" | List active grants |
| "Powiadom mnie o X" | Grant notification permission |

---

## Files Reference

| Plik | Rola |
|------|------|
| lib/autonomy/permission-model.ts | Permission checking |
| lib/autonomy/mape-k-loop.ts | MAPE-K implementation |
| lib/agents/specialized/gap-detector.ts | Gap detection |
| lib/agents/specialized/self-optimizer.ts | Self-optimization |
| app/api/autonomy/route.ts | Grants CRUD |
| app/api/autonomy/check/route.ts | Permission check |

---

VERSION: 1.0
UPDATED: 2026-02-03
