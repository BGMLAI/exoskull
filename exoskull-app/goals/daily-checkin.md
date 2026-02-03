# Goal: Daily Check-in

Poranne i wieczorne check-iny - podstawa kontaktu z uzytkownikiem.

---

## Objective

Utrzymac regularny kontakt z uzytkownikiem przez check-iny:
- **Rano:** Stan, energia, plan dnia
- **Wieczor:** Podsumowanie, refleksja, sleep prep

---

## Trigger

| Job | Czas | Kanal |
|-----|------|-------|
| morning_checkin | 06:00-09:00 (user timezone) | Voice/SMS |
| evening_reflection | 20:00-22:00 (user timezone) | Voice/SMS |

Konfiguracja w: `exo_scheduled_jobs`, `exo_user_job_preferences`

---

## Inputs

### Morning Check-in
- Sleep data (jesli Oura/Fitbit podlaczone)
- Kalendarz dnia (jesli Google Calendar podlaczone)
- Open tasks (z exo_tasks)
- HRV/readiness (jesli dostepne)

### Evening Reflection
- Day summary (zliczone: tasks completed, meetings, messages)
- Energy levels logged during day
- Mood data (jesli mood-tracker aktywny)
- Tomorrow calendar preview

---

## Tools

| Tool | Uzycie |
|------|--------|
| task | Pobierz/zaktualizuj zadania |
| calendar | Sprawdz plan dnia |
| - | Sleep/HRV z Oura via Rig |

---

## Mods

| Mod | Rola |
|-----|------|
| sleep-tracker | Sleep score, recommendations |
| energy-monitor | Energy levels, patterns |
| mood-tracker | Mood history, trends |
| habit-tracker | Habit reminders for the day |

---

## Outputs

### Morning
1. Greeting z personalnym kontekstem
2. Sleep summary (jesli dane)
3. Day preview (meetings, deadlines)
4. Top 3 priorities (MIT - Most Important Tasks)
5. Habit reminders

### Evening
1. Day summary (wins, completed tasks)
2. Reflection prompt ("Co poszlo dobrze? Co bylo trudne?")
3. Tomorrow preview
4. Sleep recommendation (based on HRV, sleep debt)
5. Gratitude prompt (optional)

---

## Flow: Morning Check-in

```
1. Trigger: CRON at user's morning_checkin_time
2. Check channel preference (voice/sms)
3. Gather context:
   - Sleep: Oura/Fitbit sync → sleep_score, HRV
   - Calendar: Google Calendar → today's events
   - Tasks: exo_tasks → pending, due_today
4. Build message:
   - IF sleep_score < 70: "Krotka noc. Moze lzejszy dzien?"
   - IF meetings > 3: "Duzo spotkan. Blokuje focus time?"
   - IF overdue_tasks > 2: "Masz zaleglosci. Przejrzyjmy?"
5. Deliver via channel
6. Log to exo_scheduled_job_logs
```

---

## Flow: Evening Reflection

```
1. Trigger: CRON at user's evening_reflection_time
2. Gather context:
   - Completed tasks today
   - Energy logs (if any)
   - Mood check-ins (if any)
   - Calendar: tomorrow preview
3. Build message:
   - Day wins: "[N] zadan skonczonych"
   - Reflection: "Jak oceniasz dzien 1-10?"
   - Tomorrow: "[M] spotkan, [K] deadlines"
   - Sleep: "Cel: 22:30 w lozku" (based on bedtime_target)
4. Deliver via channel
5. If voice: listen for response, extract mood/notes
6. Log to database
```

---

## Edge Cases

| Przypadek | Obsluga |
|-----------|---------|
| User nie odpowiada | Retry 1x po 30min, potem skip |
| Sleep data unavailable | Skip sleep section, suggest connecting Oura |
| Calendar empty | "Luzy dzien - czas na focus work?" |
| User says "nie teraz" | Snooze 2h, mark preference |
| Quiet hours (22-07) | NEVER call/SMS unless emergency |

---

## Metrics

Track w `exo_scheduled_job_logs`:
- response_rate (% odpowiedzi)
- avg_mood_score (jesli trackowane)
- completion_rate (% check-ins delivered)

---

## Config Reference

```yaml
# W exo_user_job_preferences
morning_checkin:
  enabled: true
  time: "07:00"
  channel: "voice"  # or "sms"

evening_reflection:
  enabled: true
  time: "21:00"
  channel: "sms"
```

---

VERSION: 1.0
UPDATED: 2026-02-03
