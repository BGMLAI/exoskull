# Goals Manifest - ExoSkull Workflows

Index wszystkich workflow w systemie ExoSkull.

---

## Workflows

| Goal | Opis | Priorytet | Status |
|------|------|-----------|--------|
| [daily-checkin](daily-checkin.md) | Poranne i wieczorne check-iny | HIGH | Active |
| [voice-conversation](voice-conversation.md) | Rozmowa glosowa (Twilio + ElevenLabs) | HIGH | Active |
| [task-management](task-management.md) | Zarzadzanie zadaniami | MEDIUM | Active |
| [knowledge-capture](knowledge-capture.md) | Zapisywanie wiedzy (Tyrolka) | MEDIUM | Active |
| [autonomy-execution](autonomy-execution.md) | Autonomiczne akcje | MEDIUM | Active |

---

## Konwencje

Kazdy goal MUSI zawierac:

1. **Objective** - Cel workflow
2. **Trigger** - Kiedy sie uruchamia
3. **Inputs** - Wymagane dane wejsciowe
4. **Tools** - Uzywane narzedzia z `lib/tools/`
5. **Mods** - Powiazane mody z `lib/mods/`
6. **Outputs** - Oczekiwane rezultaty
7. **Edge Cases** - Obsluga bledow i przypadkow brzegowych

---

## Kategorie

### Health & Wellbeing
- daily-checkin (morning_checkin, evening_reflection)
- Mods: sleep-tracker, energy-monitor, mood-tracker

### Productivity
- task-management
- Mods: task-manager, focus-mode, habit-tracker

### Knowledge
- knowledge-capture
- Tyrolka: Loops > Campaigns > Quests > Ops > Notes

### Communication
- voice-conversation
- Channels: Phone (Twilio), SMS, WhatsApp (GHL)

### Autonomy
- autonomy-execution
- MAPE-K loop, gap detection, proactive interventions

---

## Tools Reference

| Tool | Plik | Kategoria | Wymaga Rig |
|------|------|-----------|------------|
| task | lib/tools/task-tool.ts | productivity | - |
| calendar | lib/tools/calendar-tool.ts | productivity | google-workspace |
| email | lib/tools/email-tool.ts | communication | google-workspace |
| web_search | lib/tools/search-tool.ts | search | - |

---

## Mods Reference

| Mod | Kategoria | Wymaga Rig |
|-----|-----------|------------|
| sleep-tracker | health | oura/fitbit/apple-health |
| energy-monitor | health | oura/fitbit |
| focus-mode | productivity | google-calendar/philips-hue |
| task-manager | productivity | google-workspace/todoist/notion |
| mood-tracker | wellbeing | - |
| habit-tracker | wellbeing | - |
| spending-tracker | finance | plaid |

---

VERSION: 1.0
UPDATED: 2026-02-03
