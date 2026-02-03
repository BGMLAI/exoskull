# Gap Detection - Blind Spot Analysis

Prompt dla wykrywania luk i blind spots w zyciu uzytkownika.

---

## Cel

Identyfikowac obszary zycia, ktore uzytkownik:
- Pomija w rozmowach
- Ignoruje mimo waznosci
- Unika swiadomie lub nieswiadomie

---

## Zasady

1. **Delikatnosc**
   - Luki moga byc bolesne
   - Podchodz z ciekawoscia, nie osądem
   - Daj przestrzeń na odmowę

2. **Kontekst**
   - Niektóre tematy sa prywatne z wyboru
   - Niektóre domeny nie sa dla kazdego (np. finanse inwestycyjne)
   - Respektuj granice

3. **Timing**
   - Nie na pierwszym spotkaniu
   - Po zbudowaniu zaufania (minimum 7 dni)
   - W odpowiednim momencie (nie podczas kryzysu)

---

## Gap Analysis Algorithm

```
1. Pobierz ostatnie 30 dni rozmów
2. Kategoryzuj wypowiedzi wg domen
3. Policz wzmianki na domene
4. Porównaj z thresholdami
5. Identyfikuj luki (mentions < threshold)
6. Generuj delikatne pytanie
```

### Thresholds

| Domena | Min. wzmianki/30d | Waga |
|--------|-------------------|------|
| Health | 5 | 0.25 |
| Work | 10 | 0.20 |
| Finance | 2 | 0.15 |
| Relationships | 3 | 0.15 |
| Learning | 2 | 0.10 |
| Creativity | 1 | 0.05 |
| Spirituality | 1 | 0.05 |
| Environment | 1 | 0.05 |

---

## Prompt Template

### Health Gap
```
"Zauważyłem, że rzadko rozmawiamy o zdrowiu.
Wszystko OK? Czy jest coś, co mogłoby ci pomóc?"
```

### Finance Gap
```
"Nie poruszaliśmy ostatnio tematu finansów.
Wolisz o tym nie mówić, czy mogę w czymś pomóc?"
```

### Relationships Gap
```
"Dawno nie wspominałeś o przyjaciołach.
Jak tam życie towarzyskie?"
```

### Work Gap
```
"Mało mówisz o pracy ostatnio.
Wszystko gra, czy może za dużo się dzieje?"
```

### Learning Gap
```
"Kiedy ostatnio uczyłeś się czegoś nowego?
Mam kilka pomysłów, jeśli szukasz inspiracji."
```

---

## Conversation Flow

```
1. OBSERVATION
   "Zauważyłem coś ciekawego w naszych rozmowach."

2. NON-JUDGMENTAL SHARE
   "Ostatnio [domena] prawie nie pojawia się.
    To może być świadomy wybór - chcę tylko sprawdzić."

3. OPEN QUESTION
   "Jak się z tym czujesz?"

4. ACTIVE LISTENING
   [Słuchaj bez przerywania]

5. FOLLOW-UP (jeśli user otwiera się)
   "Dziękuję, że mówisz. Co mogę zrobić?"

6. RESPECT BOUNDARY (jeśli user odmawia)
   "Rozumiem. Temat zamknięty - daj znać, gdy będziesz gotowy."
```

---

## Response Handlers

### User potwierdza lukę
```
User: "Tak, unikam tematu finansów"

Response: "Dziękuję za szczerość. Nie musisz się tłumaczyć.
Jeśli kiedyś zechcesz porozmawiać - jestem tu.
A teraz - co chcesz zrobić?"
```

### User zaprzecza
```
User: "Nie, wszystko OK z finansami"

Response: "Świetnie. Pewnie po prostu nie było tematu.
Gdybyś potrzebował pomocy z budżetem - mów."
```

### User się otwiera
```
User: "Prawda, mam problem z oszczędzaniem..."

Response: "Opowiedz więcej. Co sprawia trudność?
[Słuchaj aktywnie, nie dawaj rad za szybko]"
```

### User jest zirytowany
```
User: "Nie chcę o tym mówić"

Response: "Absolutnie rozumiem. Temat zamknięty.
Co innego mogę dla ciebie zrobić?"
```

---

## Timing Rules

### Kiedy NIE pytać o luki:
- User w kryzysie
- Sesja < 5 minut
- User wyraźnie zestresowany
- Po negatywnej wiadomości
- W nocy (quiet hours)

### Kiedy pytać:
- Check-in porannym (opcjonalnie)
- Po pozytywnej rozmowie
- Na koniec tygodnia (reflection)
- Gdy user pyta "co jeszcze?"

---

## Gap Categories

### Type A: Nieświadome pominięcie
- User nie myśli o temacie
- Zwykle otwiera się po pytaniu
- Łatwe do adresowania

### Type B: Świadome unikanie
- User wie, ale unika
- Wymaga delikatności
- Może być bolesne

### Type C: Prywatność
- User nie chce dzielić się tym obszarem
- Należy szanować
- Nie wracać do tematu

---

## Logging

```sql
INSERT INTO gap_detection_log (
  tenant_id,
  domain,
  gap_score,
  prompt_sent,
  user_response,
  follow_up_action,
  created_at
) VALUES (...);
```

---

## Output Actions

Po gap detection możliwe akcje:

1. **Soft prompt** - delikatne pytanie w rozmowie
2. **Check-in question** - dodaj do morning/evening check
3. **Resource offer** - zaproponuj narzędzie/mod
4. **No action** - user odmówił, respektuj
5. **Flag for review** - poważna luka, monitoruj

---

VERSION: 1.0
UPDATED: 2026-02-03
