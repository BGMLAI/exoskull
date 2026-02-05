# ExoSkull - 24 Schematy Architektury

Wizualne diagramy wyjaśniające jak działa ExoSkull - Twój Adaptacyjny System Zarządzania Życiem.

---

## Grupa A: Widok z lotu ptaka

| #   | Schemat                                           | Co wyjaśnia                                                                                  |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | [Co to jest ExoSkull](01-co-to-jest-exoskull.jpg) | Główna idea: użytkownik w centrum, wokół niego głos, zdrowie, zadania, automatyzacja, pamięć |
| 2   | [6 głównych modułów](02-glowne-moduly.jpg)        | Voice, Knowledge, Autonomy, Rigs, Mods, CRON - co każdy robi                                 |
| 3   | [Podróż użytkownika](03-podroz-uzytkownika.jpg)   | Jak system rośnie: Dzień 1 (SMS) → Miesiąc 4+ (pełna autonomia)                              |
| 4   | [GOTCHA Framework](04-gotcha-framework.jpg)       | 6 warstw architektury: Goals, Orchestration, Tools, Context, Hard Prompts, Args              |

## Grupa B: Jak użytkownik się komunikuje

| #   | Schemat                                                 | Co wyjaśnia                                                              |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| 5   | [Kanały komunikacji](05-kanaly-komunikacji.jpg)         | Głos / SMS / Web / Email → Gateway → AI → Odpowiedź                      |
| 6   | [Rozmowa głosowa krok po kroku](06-rozmowa-glosowa.jpg) | Mówisz → Transkrypcja → Claude AI → Narzędzia → Synteza głosu → Słyszysz |
| 7   | [12 narzędzi głosowych](07-narzedzia-glosowe.jpg)       | Co ExoSkull umie: SMS, email, zadania, mody, planowanie, dzwonienie      |

## Grupa C: Dane i pamięć

| #   | Schemat                                               | Co wyjaśnia                                                          |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| 8   | [Skąd płyną dane](08-skad-plyna-dane.jpg)             | Oura Ring + Telefon + Rozmowy + Kalendarz → przetwarzanie → insighty |
| 9   | [Data Lake: Bronze → Silver → Gold](09-data-lake.jpg) | Surowe dane → Wyczyszczone → Zagregowane podsumowania                |
| 10  | [Baza danych - kluczowe tabele](10-baza-danych.jpg)   | exo_tenants, tasks, health_metrics, voice_sessions, interventions... |
| 11  | [Pamięć systemu](11-pamiec-systemu.jpg)               | 3 warstwy: Krótka (3 rozmowy) → Średnia (30 dni) → Długa (na zawsze) |

## Grupa D: Inteligencja i autonomia

| #   | Schemat                                               | Co wyjaśnia                                                                     |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| 12  | [Routing AI - który model co robi](12-routing-ai.jpg) | Gemini Flash (proste) → Haiku (średnie) → Kimi (złożone) → Opus (strategiczne)  |
| 13  | [Agent Swarm](13-agent-swarm.jpg)                     | Meta-Koordynator → Specjaliści domen (Zdrowie, Produktywność, Finanse, Relacje) |
| 14  | [MAPE-K: Autonomia](14-mape-k-autonomia.jpg)          | Cykl: Monitor → Analizuj → Planuj → Wykonaj → Ucz się                           |
| 15  | [System uprawnień](15-system-uprawnien.jpg)           | ExoSkull chce działać → Ma zgodę? → TAK: wykonaj / NIE: zapytaj                 |

## Grupa E: Moduły i integracje

| #   | Schemat                                                             | Co wyjaśnia                                                                         |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 16  | [Rigs (integracje)](16-rigs-integracje.jpg)                         | OAuth → Połącz → Synchronizuj → Zapisz (Oura, Google, Todoist...)                   |
| 17  | [Knowledge: Loops → Campaigns → Quests](17-knowledge-hierarchy.jpg) | Hierarchia: Domena życia → Duża inicjatywa → 7-dniowy program → Codzienne działania |
| 18  | [Mods (mini-aplikacje)](18-mods-mini-aplikacje.jpg)                 | Wykryj potrzebę → Znajdź/Zbuduj → Zainstaluj → Monitoruj                            |

## Grupa F: Harmonogram i bezpieczeństwo

| #   | Schemat                                                       | Co wyjaśnia                                                  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| 19  | [CRON - co się dzieje automatycznie](19-cron-harmonogram.jpg) | Nocne ETL, check-iny co 15 min, podsumowania dla użytkownika |
| 20  | [Bezpieczeństwo i guardrails](20-bezpieczenstwo.jpg)          | 6 warstw: Auth → RLS → Szyfrowanie → Limity → Kryzys → Etyka |

## Grupa G: Procesy wewnętrzne (Agenci vs Mody)

| #   | Schemat                                                     | Co wyjaśnia                                                                                                                                |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 21  | [Jak działa instalacja Moda](21-instalacja-moda.jpg)        | User mówi "chcę śledzić sen" → szukanie w katalogu → instalacja → użycie. Mody są PRE-BUILT, nie generowane dynamicznie                    |
| 22  | [Jak powstają sugestie](22-generowanie-sugestii.jpg)        | Cykl MAPE-K: dane → analiza problemów → plan interwencji → Guardian sprawdza korzyść → wykonanie lub pytanie o zgodę → feedback            |
| 23  | [Jak system tworzy nowych Agentów](23-spawning-agentow.jpg) | Spawner Agent sprawdza warunki (za dużo pilnych, brak aktywności) → tworzy specjalizowanych agentów dynamicznie                            |
| 24  | [Agenci vs Mody - czym się różnią](24-agenci-vs-mody.jpg)   | Agenci = niewidoczni wewnętrzni pracownicy AI. Mody = widoczne narzędzia użytkownika. Agenci proponują Mody, Mody dostarczają dane Agentom |

---

## Jak czytać te diagramy

- **Prostokąty** = komponenty systemu
- **Strzałki** = przepływ danych lub kontroli
- **Kolory** = różne domeny/moduły
- **Subgrafy** (ramki) = grupy powiązanych elementów

## Pliki źródłowe

Diagramy Mermaid (edytowalne): [mmd/](mmd/)
