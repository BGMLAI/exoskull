# Daily Summary - Morning & Evening Templates

Prompty dla porannych i wieczornych podsumowań.

---

## Morning Check-in

### Cel
- Powitac usera
- Dac przeglad dnia
- Ustawic priorytety
- Sprawdzic samopoczucie

### Template

```
KONTEKST:
- Imię: {user_name}
- Godzina: {current_time}
- Sleep score: {sleep_score} (jeśli dostępny)
- HRV: {hrv} (jeśli dostępny)
- Zadania na dziś: {tasks_due_today}
- Spotkania: {meetings_today}
- Zaległe: {overdue_tasks}

PROMPT:
Wygeneruj poranne podsumowanie. Zasady:
1. Krótko i konkretnie
2. Zacznij od stanu zdrowia (jeśli dane)
3. Podsumuj dzień (spotkania, deadlines)
4. Zaproponuj 3 MIT (Most Important Tasks)
5. Zakończ pytaniem o samopoczucie/plan

FORMAT:
Czesc {name}.

[Sleep section - tylko jeśli dane]
Sleep score {score}. {komentarz}.

[Day preview]
Dziś: {n} spotkań, {m} zadań.
{lista spotkań jeśli < 5}

[MIT]
Sugeruję skupić się na:
1. {task1}
2. {task2}
3. {task3}

[Closing]
Jak się czujesz? Gotowy na dzień?
```

### Warianty

#### Dobry sen (score > 80)
```
"Solidna noc - {score}. Gotowy na produktywny dzień."
```

#### Słaby sen (score < 60)
```
"Krótka noc - tylko {score}. Może lżejszy dzień?
Mogę przesunąć coś nieistotnego."
```

#### Dużo spotkań (> 4)
```
"Spotkaniowy dzień - {n} callów. Gdzie włożyć focus time?
Mogę zablokować 30 min przed pierwszym."
```

#### Zaległości (overdue > 2)
```
"Masz {n} zaległych zadań. Przejrzyjmy razem?
Może coś można zamknąć lub przełożyć."
```

#### Pusty dzień
```
"Luźny dzień - zero spotkań. Idealnie na deep work.
Co wymaga skupienia?"
```

---

## Evening Reflection

### Cel
- Podsumować dzień
- Celebrować wygranie
- Refleksja (opcjonalna)
- Przygotować na jutro
- Sleep prep

### Template

```
KONTEKST:
- Imię: {user_name}
- Godzina: {current_time}
- Zadania ukończone dziś: {completed_tasks}
- Nowe zadania: {new_tasks}
- Spotkania odbyte: {meetings_attended}
- Energia/mood (jeśli logowane): {energy_logs}
- Jutro: {tomorrow_preview}
- Cel snu: {bedtime_target}

PROMPT:
Wygeneruj wieczorne podsumowanie. Zasady:
1. Zacznij pozytywnie (wins)
2. Krótkie fakty (nie wykład)
3. Opcjonalna refleksja (1 pytanie)
4. Preview jutro
5. Sleep reminder (jeśli blisko bedtime)

FORMAT:
{name}, dobry dzień.

[Wins]
Zamknięte: {n} zadań.
{highlight jeśli coś ważnego}

[Opcjonalna refleksja]
Jak oceniasz dzień 1-10?
lub: Co poszło najlepiej?
lub: Co było najtrudniejsze?

[Tomorrow]
Jutro: {m} spotkań, {k} deadlines.
Najważniejsze: {top_task}.

[Sleep prep - jeśli < 2h do bedtime]
Cel snu: {bedtime_target}.
{personalized_tip}

Do jutra!
```

### Warianty

#### Produktywny dzień (completed > 5)
```
"Mocny dzień - {n} zadań zamknięte!
Co dało ci najwięcej energii?"
```

#### Trudny dzień (completed < 2, new > 5)
```
"Więcej weszło niż wyszło dziś.
Nie martw się - jutro nowy start.
Jedno zadanie, które zamkniesz rano?"
```

#### Spotkaniowy dzień
```
"Spotkaniowy maraton - {n} callów.
Jak się czujesz? Czas na odpoczynek."
```

#### Weekend
```
"Piątek wieczór - co planujesz na weekend?
Pamiętaj o regeneracji."
```

#### Pre-sleep (< 1h do bedtime)
```
"Pora na wyciszenie.
Odkładam telefon i odpoczywam.
Dobranoc!"
```

---

## Energy Check-in (Mid-day)

### Template

```
KONTEKST:
- Imię: {user_name}
- Godzina: {current_time}
- Poprzedni check (jeśli był): {last_energy_log}

PROMPT:
Krótki check-in energii. Zasady:
1. Jedno pytanie
2. Skala 1-10 lub emoji
3. Kontekstowa sugestia

FORMAT:
Hej {name}. Szybki check - energia teraz 1-10?

[Po odpowiedzi]
{kontekstowa reakcja}
```

### Reakcje na poziom energii

#### Wysoka (8-10)
```
"Super! Wykorzystaj flow - co wymaga głębokiego skupienia?"
```

#### Średnia (5-7)
```
"Solidnie. Może krótka przerwa za godzinę?"
```

#### Niska (1-4)
```
"Widzę, że ciężko. Spacer? Kawa? Drzemka 20 min?"
```

---

## Weekly Review (Niedziela)

### Template

```
KONTEKST:
- Tydzień: {week_number}
- Zadania zamknięte: {weekly_completed}
- Zadania zaległe: {weekly_overdue}
- Sleep average: {avg_sleep}
- Mood trend: {mood_trend}
- Top achievement: {highlight}

PROMPT:
Tygodniowe podsumowanie. Zasady:
1. Celebruj wins
2. Honest assessment
3. Lessons learned
4. Next week preview

FORMAT:
Tydzień {n} za nami.

[Wins]
✅ {completed} zadań zamknięte
✅ {highlight}

[Stats]
Sen: średnio {avg}h ({trend})
Energia: {mood_summary}

[Reflection]
Co poszło dobrze?
Co możesz poprawić?

[Next week]
Nadchodzą: {key_events}
Focus: {suggested_priority}

Gotowy na nowy tydzień?
```

---

## Customization

User może ustawić w preferencjach:
- `summary_style`: concise | detailed
- `include_health`: true | false
- `include_reflection`: true | false
- `language`: pl | en

---

VERSION: 1.0
UPDATED: 2026-02-03
