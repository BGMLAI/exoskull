# Life Domains - ExoSkull Categories

Domeny zycia uzytkownika trackowane przez ExoSkull.

---

## Core Domains (Loops)

| Domain | Icon | Opis | Key Metrics |
|--------|------|------|-------------|
| Health | heart | Zdrowie fizyczne i psychiczne | Sleep score, HRV, steps, mood |
| Work | briefcase | Praca i kariera | Tasks completed, focus time, meetings |
| Finance | dollar | Finanse osobiste | Spending, savings, budget adherence |
| Relationships | users | Relacje osobiste | Contact frequency, quality time |
| Learning | book | Rozwoj osobisty | Books read, courses, skills |
| Creativity | palette | Tworczość i hobby | Projects, creative output |
| Environment | home | Dom i otoczenie | Home automation, organization |
| Spirituality | sun | Duchowość i mindfulness | Meditation, gratitude, reflection |

---

## Health Sub-domains

### Sleep
- **Metrics:** Duration, quality score, REM%, deep sleep%
- **Sources:** Oura, Fitbit, Health Connect
- **Alerts:** Sleep debt > 6h, score < 70

### Activity
- **Metrics:** Steps, active minutes, workouts
- **Sources:** Oura, Fitbit, Google Fit
- **Goals:** 10k steps, 30min activity

### Nutrition
- **Metrics:** Meals logged, water, supplements
- **Sources:** Manual logging, meal photos
- **Reminders:** Meal times, hydration

### Mental Health
- **Metrics:** Mood score, stress level, anxiety
- **Sources:** Check-ins, HRV trends
- **Crisis:** Escalation protocols

---

## Work Sub-domains

### Tasks
- **Metrics:** Created, completed, overdue
- **Sources:** ExoSkull, Google Tasks, Todoist
- **Insights:** Completion rate, productivity trends

### Calendar
- **Metrics:** Meetings, focus blocks, travel
- **Sources:** Google Calendar
- **Optimization:** Meeting load, recovery time

### Communication
- **Metrics:** Emails, messages, response time
- **Sources:** Gmail, Slack integration
- **Management:** Priority inbox, batch processing

### Deep Work
- **Metrics:** Focus sessions, interruptions
- **Sources:** Focus mode tracking
- **Optimization:** Best focus times

---

## Finance Sub-domains

### Spending
- **Metrics:** Total, by category, vs budget
- **Sources:** Plaid, manual entry
- **Alerts:** Over budget, unusual transactions

### Income
- **Metrics:** Salary, side income, investments
- **Sources:** Bank sync, manual
- **Tracking:** Monthly trends

### Savings
- **Metrics:** Rate, emergency fund, goals
- **Sources:** Account balances
- **Goals:** 6-month emergency fund

### Investments
- **Metrics:** Portfolio value, returns
- **Sources:** Brokerage APIs
- **Tracking:** Performance vs benchmarks

---

## Relationships Sub-domains

### Family
- **Metrics:** Contact frequency, events
- **Sources:** Calendar, contacts
- **Reminders:** Birthdays, check-ins

### Friends
- **Metrics:** Social events, conversations
- **Sources:** Calendar, messaging
- **Gap detection:** No contact > 30 days

### Romantic
- **Metrics:** Date nights, quality time
- **Sources:** Calendar
- **Optimization:** Relationship maintenance

### Professional
- **Metrics:** Networking, mentoring
- **Sources:** LinkedIn, calendar
- **Goals:** Monthly networking events

---

## Gap Detection

ExoSkull monitors all domains for **blind spots**:

```
IF domain_mentions(last_30_days) < threshold:
    trigger_gap_prompt()
```

### Thresholds

| Domain | Min Mentions/30d | Action |
|--------|------------------|--------|
| Health | 5 | Gentle reminder |
| Work | 10 | Usually fine (daily) |
| Finance | 2 | Monthly review prompt |
| Relationships | 3 | Check-in suggestion |
| Learning | 2 | Growth prompt |

### Gap Prompts

```
"Nie rozmawialiśmy o finansach ostatnio.
Wszystko w porządku z budżetem?"

"Dawno nie wspominałeś o [friend].
Może warto się odezwać?"

"Kiedy ostatnio czytałeś książkę?
Mam kilka rekomendacji."
```

---

## Domain Weighting

User can set importance weights:

```yaml
domain_weights:
  health: 0.25       # 25% of attention
  work: 0.30         # 30%
  finance: 0.15      # 15%
  relationships: 0.15
  learning: 0.10
  creativity: 0.05
```

Used for:
- Prioritizing insights
- Allocating check-in time
- Generating recommendations

---

## Cross-Domain Insights

ExoSkull looks for patterns across domains:

| Pattern | Insight |
|---------|---------|
| Low sleep + low productivity | "Sen wpływa na pracę. Priorytet: sleep." |
| High spending + stress | "Stres koreluje z wydatkami. Mindful spending?" |
| No social + low mood | "Izolacja wpływa na nastrój. Zaplanuj spotkanie?" |
| Exercise + better sleep | "Ćwiczenia pomagają w śnie. Kontynuuj!" |

---

## Default Loops

When user starts, create these default Loops:

```sql
SELECT create_default_loops(tenant_id);
-- Creates: Health, Work, Finance, Relationships, Learning, Creativity
```

User can:
- Add custom loops
- Archive unused loops
- Merge similar loops
- Set privacy per loop

---

VERSION: 1.0
UPDATED: 2026-02-03
