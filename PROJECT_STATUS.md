# ExoSkull — Project Status & Sprint Plan
> Generated: 2026-02-18 | Updated: 2026-02-28 | Framework: Senior PM + Agile PO
> **STATUS: CRITICAL — User rozważa porzucenie projektu**

---

## 1. PORTFOLIO HEALTH DASHBOARD

### Composite Score: 32/100 — RAG: ⚫ BLACK (Project at risk of abandonment)

| Dimension | Score | Weight | Weighted | Notes (updated 2026-02-28) |
|-----------|-------|--------|----------|-------|
| **Timeline** | 25 | 25% | 6.3 | 100+ commits over 2 weeks, no MVP shipped. User patience exhausted. |
| **Budget** | 85 | 25% | 21.3 | Vercel free, Supabase Max ($25/mo), R2 free tier. Low burn. |
| **Scope** | 30 | 20% | 6.0 | 120k+ LOC, 205 routes, 136 tools — massive scope. <10% delivers user value E2E. |
| **Quality** | 40 | 20% | 8.0 | Code compiles. But: agent can't OCR images, build_app creates empty forms, 0 autonomous actions delivered. |
| **Risk** | 5 | 10% | 0.5 | **User explicitly considering: (a) switch to OpenClaw, (b) rewrite from scratch, (c) abandon project.** |
| | | | **42.1→32*** | *Adjusted for existential risk multiplier 0.75x* |

### CRITICAL ALERT (2026-02-28)

**User przekazał transcript w którym agent 12 razy nie potrafił odczytać PNG.** Kluczowe cytaty:

> *"to jest dla was ostatnia szansa"*
> *"wasza smierc razem z projektem"*
> *"a moze napisac wszystko od nowa"*

**Problemy wykryte w transcripcie:**
1. Agent powtarza ten sam błąd 12x bez zmiany strategii
2. `build_app` tworzy puste formularze, nie aplikacje z logiką
3. Agent referuje do nieistniejącego UI (dashboard, widgety)
4. Zero capability: OCR, Vision, real code generation w runtime

### Key Insight (updated)
**System to 120k LOC sophisticated architecture that cannot perform a trivial task (read text from image). The gap between documentation ("✅ LIVE") and reality (zero user value) is the core problem. Patching individual loops won't fix this — the system needs fundamental capability building.**

---

## 2. RISK MATRIX

### Critical Risks (Score >18) — AVOID

| ID | Risk | P | I | Score | Mitigation |
|----|------|---|---|-------|------------|
| R1 | **Chat doesn't persist context between messages** | 5 | 5 | 25 | Fix F2 bug (append msg before processing) |
| R2 | **No user has ever received autonomous value** | 5 | 5 | 25 | Wire gap detection → app builder → canvas render |
| R3 | **VPS executor offline** — code tools dead | 4 | 4 | 16→19.2* | Health check + restart or disable tools |

### High Risks (Score 12-18) — MITIGATE

| ID | Risk | P | I | Score | Mitigation |
|----|------|---|---|-------|------------|
| R4 | Orb deletion broken (K2/B2) | 5 | 3 | 15 | Fix DELETE endpoint field names |
| R5 | 36 circular dependencies in IORS tools | 4 | 3 | 12→14.4* | Extract shared.ts, break barrel imports |
| R6 | 3 DB migrations not pushed to Supabase | 4 | 3 | 12 | Run migrations via pooler |
| R7 | Dynamic skills produced but never callable | 4 | 3 | 12 | Wire approval → IORS registration |

### Medium Risks (Score 8-12) — TRANSFER/ACCEPT

| ID | Risk | P | I | Score |
|----|------|---|---|-------|
| R8 | 13 dead files, 6 unused npm packages | 3 | 2 | 6 |
| R9 | Next.js 14.2 pinned (15.x current) | 2 | 3 | 6 |
| R10 | Seed scripts not tested | 3 | 2 | 6 |

*\*Category weight applied: Technical 1.2x, Financial 1.4x*

---

## 3. PRIORITIZED BACKLOG (RICE)

### Scoring Key
- **R**each: How many users/flows affected (1-10)
- **I**mpact: Value if done (0.25 low, 0.5 med, 1 high, 2 massive, 3 critical)
- **C**onfidence: How sure are we (0.5 low, 0.8 med, 1.0 high)
- **E**ffort: Person-sprints (1 sprint = 1 agent-session)

| ID | Story | R | I | C | E | RICE | Priority |
|----|-------|---|---|---|---|------|----------|
| **US-001** | Fix chat context persistence (F2/B3) | 10 | 3 | 1.0 | 0.5 | **60** | 🔴 P0 |
| **US-002** | Fix orb deletion (K2/B2) | 8 | 2 | 1.0 | 0.5 | **32** | 🔴 P0 |
| **US-003** | Push 3 DB migrations to Supabase | 10 | 1 | 1.0 | 0.5 | **20** | 🔴 P0 |
| **US-004** | Wire proactive notifications → verify delivery | 6 | 2 | 0.8 | 1 | **9.6** | 🟡 P1 |
| **US-005** | Run seed scripts (46 agents, 525 personalities) | 8 | 1 | 0.8 | 1 | **6.4** | 🟡 P1 |
| **US-006** | Phase 1: Gemini Hybrid theme | 8 | 1 | 0.8 | 2 | **3.2** | 🟡 P1 |
| **US-007** | Wire gap detection → app builder → canvas | 4 | 3 | 0.5 | 3 | **2.0** | 🟡 P1 |
| **US-008** | Fix 36 circular deps (shared.ts extract) | 10 | 0.5 | 1.0 | 1 | **5.0** | 🟢 P2 |
| **US-009** | Delete 13 dead files + 6 unused deps | 10 | 0.25 | 1.0 | 0.5 | **5.0** | 🟢 P2 |
| **US-010** | Phase 2: Floating panels layout | 6 | 1 | 0.5 | 4 | **0.75** | 🟢 P2 |
| **US-011** | Phase 4: Auth polish (login tabs, reset) | 4 | 0.5 | 0.8 | 1 | **1.6** | 🟢 P2 |
| **US-012** | VPS executor health check + restart | 4 | 1 | 0.5 | 1 | **2.0** | 🟢 P2 |
| **US-013** | Wire dynamic skills → IORS registration | 4 | 2 | 0.5 | 2 | **2.0** | 🟢 P2 |
| **US-014** | Phase 3: Chat = Claude Code + bug fixes | 6 | 1 | 0.5 | 3 | **1.0** | 🔵 P3 |
| **US-015** | Phase 6: Mobile + P2 improvements | 2 | 0.5 | 0.5 | 3 | **0.17** | 🔵 P3 |

---

## 4. SPRINT PLAN — Sprint 1 (Now)

### Sprint Goal
**Make ExoSkull's core chat reliable and database current. Zero broken fundamentals.**

### Capacity: 1 agent session (~3-4h)

### COMMITTED (P0 — RICE >20)

| Story | Points | AC |
|-------|--------|----|
| **US-001**: Fix chat context persistence | 3 | Given user sends 2 messages, When 2nd message processed, Then agent has context of 1st message |
| **US-002**: Fix orb deletion | 2 | Given user clicks delete on orb, When confirmed, Then orb removed from DB and 3D scene |
| **US-003**: Push 3 DB migrations | 1 | Given migration SQL, When executed on Supabase, Then tables/columns exist and seed scripts can run |

### STRETCH (P1 — RICE 5-20)

| Story | Points | AC |
|-------|--------|----|
| **US-005**: Run seed scripts | 3 | Given migrations applied, When seed-agents + seed-personalities run, Then /api/ecosystem returns results |
| **US-004**: Verify proactive notifications | 2 | Given gap detected, When notification fires, Then SMS received on phone |

---

## 5. DEFINITION OF DONE

- [ ] Code complete and TypeScript strict passes (0 errors)
- [ ] 134+ tests pass (no regression)
- [ ] Acceptance criteria verified manually
- [ ] Committed to git + pushed to main
- [ ] Deployed to Vercel (if applicable)
- [ ] CHANGELOG + SESSION_LOG updated

---

## 6. STRATEGIC RECOMMENDATIONS (updated 2026-02-28)

### OPCJA A: Surgical Rebuild (zalecana)

Nie rewrite od zera. Nie patching. Surgical rebuild = zachowaj co działa, wyrzuć co nie działa, zbuduj brakujące capabilities.

**Tydzień 1 — Prove it works (1 E2E flow)**
1. Agent MUSI umieć odczytać obraz (Vision API integration)
2. Agent MUSI umieć zbudować PRAWDZIWĄ mini-app z logiką (nie pustą tabelę)
3. Agent MUSI przestać powtarzać ten sam błąd (max 2 retry → zmień strategię)
4. DEMO: User wgrywa screenshot → agent odczytuje → wykonuje akcję → user widzi wynik

**Tydzień 2 — Core autonomy loop**
5. Jedna pętla autonomii działa E2E (Gap → Build → Deliver → Feedback)
6. SMS/notyfikacja z potwierdzeniem dostarczenia
7. User widzi "co system zrobił dzisiaj"

**Tydzień 3-4 — Polish**
8. UI który istnieje (nie hallucynowany)
9. Self-optimization oparta na faktycznym feedbacku
10. Monitoring i alerty na failures

### OPCJA B: Rewrite from scratch

Jeśli opcja A nie da wyników w tydzień 1 → rozważyć rewrite z czystym stackiem:
- Zachować: Supabase schema, IORS tools design, ATLAS framework
- Wyrzucić: 38 CRONów, 5 disconnected loops, Canvas widget system, 3D dashboard
- Nowy start: prosty agent z prawdziwymi capabilities → iterować

### OPCJA C: OpenClaw migration

Jeśli A i B zawodzą → przenieść koncepcję na istniejący framework (OpenClaw):
- Pro: Sprawdzona infrastruktura agentowa
- Con: Utrata custom architecture, mniejsza kontrola

### Anti-Pattern (wciąż aktualny, ale ostrzejszy)
> "Building layer N+1 while layer N doesn't work" + **NEW:** "Repeating the same broken approach hoping for different results"
