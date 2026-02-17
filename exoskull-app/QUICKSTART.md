# Exoskull - Quick Start

## 1. Uruchom migrację SQL

**Otwórz Supabase SQL Editor:**
https://supabase.com/dashboard/project/uvupnwvkzreikurymncs/sql/new

**Wklej i uruchom:**

```sql
-- Skopiuj całą zawartość z:
supabase/migrations/20260131000002_exoskull_schema.sql

-- Kliknij "Run" (F5)
```

To utworzy schema `exoskull` z wszystkimi tabelami (11 tabel + 5 core agents).

---

## 2. Pobierz Anon Key

**Otwórz:**
https://supabase.com/dashboard/project/uvupnwvkzreikurymncs/settings/api

**Skopiuj "anon public" key**

**Wklej do `.env.local`:**

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=twój-anon-key-tutaj
```

---

## 3. Uruchom aplikację

```bash
npm run dev
```

Otwórz: http://localhost:3000

---

## 4. Utwórz pierwszego użytkownika

**Metoda 1: Supabase Dashboard**
https://supabase.com/dashboard/project/uvupnwvkzreikurymncs/auth/users
→ "Add user" → podaj email + hasło

**Metoda 2: Kod (dodaj stronę /signup)**

---

## Gotowe!

Dashboard powinien działać i pokazywać:

- 0 zadań (na start)
- Brak check-in dzisiaj
- 5 aktywnych agentów (core)

---

## Troubleshooting

**Problem: "relation does not exist"**
→ Upewnij się że migracja się wykonała (sprawdź w SQL Editor: `SELECT * FROM exoskull.agents;`)

**Problem: "permission denied"**
→ Sprawdź czy używasz poprawnego anon key

**Problem: "no rows returned"**
→ Normalne - brak danych na start. Stwórz użytkownika.
