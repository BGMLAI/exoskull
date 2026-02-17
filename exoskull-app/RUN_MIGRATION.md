# Instrukcja uruchomienia migracji Exoskull

## Problem

Baza danych jest współdzielona z IORS i ma własną historię migracji. Supabase CLI wykrywa konflikt.

## Rozwiązanie (wybierz jedno):

### Opcja 1: Supabase Dashboard (Najłatwiejsze)

1. Otwórz: https://supabase.com/dashboard/project/uvupnwvkzreikurymncs/sql/new
2. Skopiuj cały plik: `supabase/migrations/20260131000001_init_exoskull_schema.sql`
3. Wklej do SQL Editor
4. Kliknij "Run"
5. Sprawdź czy tabele się utworzyły: `SELECT * FROM agents;`

### Opcja 2: Bezpośrednie psql (jeśli masz zainstalowane)

```bash
psql "postgresql://postgres.uvupnwvkzreikurymncs:[PASSWORD]@db.uvupnwvkzreikurymncs.supabase.co:5432/postgres" -f supabase/migrations/20260131000001_init_exoskull_schema.sql
```

(Password znajdziesz w Settings → Database)

### Opcja 3: JavaScript execution

```bash
npm install
node scripts/run-migration.js
```

## Weryfikacja

Po uruchomieniu sprawdź czy tabele istnieją:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('tenants', 'agents', 'tasks', 'projects');
```

Powinno zwrócić 4 wiersze.
