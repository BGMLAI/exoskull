# IORS — Model Ekonomiczny

> **Wersja:** 1.0
> **Data:** 2026-02-06
> **Zależności:** [IORS_VISION.md](./IORS_VISION.md), [IORS_ARCHITECTURE.md](./IORS_ARCHITECTURE.md)

---

## 1. Filozofia: "Mówię ci ile chcę zarobić. Ty decydujesz czy to fair."

### Odrzucone modele

| Model | Dlaczego NIE |
|---|---|
| **Subskrypcja (SaaS tiers)** | Sztywne. User płaci za features których nie używa. "Free tier" to dark pattern — ogranicza żeby sprzedać upgrade. Niezgodne z 4 Zasadami IORS. |
| **Freemium** | Dwa typy userów: darmowi (kosztują) i płatni (subsydiują). Misalignment incentives. |
| **Per-seat** | IORS to 1 instancja per user — seat pricing nie ma sensu. |
| **Flat rate** | Nie oddaje wartości. User który używa 10 min/mies płaci tyle samo co power user. |

### Wybrany model: Pay-Per-Usage z jawną marżą

**Dlaczego:**
- Tau: Płacisz za obrót (pętlę wartości), nie za stan (subskrypcję). Usage = loop rotation.
- Uczciwość: Zero ukrytych kosztów. User widzi DOKŁADNIE za co płaci.
- Skalowanie: Mały użytkownik płaci mało. Heavy user płaci więcej — ale proporcjonalnie do wartości.
- Zero barier wejścia: Brak minimum. Pierwsza rozmowa kosztuje grosze.
- Marża foundera JAWNA: "Z twoich $1 zarabiam $0.30. Reszta to koszty. Czy to fair?"

### Referencje z rynku (zbadane)

- **OpenAI:** Per-token (input/output), per-image, per-audio-minute. Benchmark pricing.
- **Anthropic:** Per-token z prompt caching (90% savings na cached tokens). Nasz model.
- **Stripe:** Metered billing API — gotowe do usage-based. Integrujemy.
- **Metronome/Orb:** Usage-based billing platforms — rozważone, ale Stripe wystarczy na start.
- **Twilio:** Per-SMS ($0.0079), per-minute voice ($0.014 outbound). Cost passthrough.

---

## 2. Granularne Koszty Per Modalność

### Breakdown: Co płaci user za każdą interakcję

```
┌─────────────────────────────────────────────────────────────┐
│  FAKTURA UŻYTKOWNIKA (przykład jednej interakcji voice)      │
│                                                              │
│  Koszt technologii:                                          │
│    Twilio inbound call:            $0.014/min                │
│    ElevenLabs STT:                 $0.003/min                │
│    Claude Sonnet 4.5 (reasoning):  $0.008 (avg tokens)      │
│    ElevenLabs TTS:                 $0.003/min                │
│    Supabase (storage, DB):         $0.001                    │
│    Vercel (compute):               $0.001                    │
│                                    ─────────                 │
│    SUBTOTAL Technology:            $0.030                     │
│                                                              │
│  Koszty operacyjne (% od technology):                        │
│    Marketing & acquisition:         5%  = $0.0015            │
│    R&D (rozwój systemu):           10%  = $0.003             │
│    Rezerwy (failures, retries):     5%  = $0.0015            │
│    Tantiemy twórców (marketplace):   0%  (brak mod w użyciu) │
│    Infrastruktura (monitoring):      3%  = $0.0009            │
│                                    ─────────                 │
│    SUBTOTAL Operations:            $0.0069                   │
│                                                              │
│  Marża foundera:                   30%  = $0.011             │
│                                    ═════════                 │
│  TOTAL:                            $0.048                    │
│                                                              │
│  ≈ 0.20 PLN za minutę rozmowy z IORS                        │
└─────────────────────────────────────────────────────────────┘
```

### Pricing per modalność

| Modalność | Koszt bazowy (tech) | + Operations (23%) | + Marża (30%) | Total per unit |
|---|---|---|---|---|
| **Text message** (SMS) | $0.008 | $0.010 | $0.013 | ~$0.013/msg |
| **Text message** (WhatsApp/Telegram) | $0.003 | $0.004 | $0.005 | ~$0.005/msg |
| **Voice inbound** (1 min) | $0.030 | $0.037 | $0.048 | ~$0.048/min |
| **Voice outbound** (1 min) | $0.035 | $0.043 | $0.056 | ~$0.056/min |
| **AI reasoning** (simple, Flash) | $0.001 | $0.001 | $0.002 | ~$0.002/req |
| **AI reasoning** (medium, Haiku) | $0.003 | $0.004 | $0.005 | ~$0.005/req |
| **AI reasoning** (complex, Sonnet) | $0.015 | $0.018 | $0.024 | ~$0.024/req |
| **AI reasoning** (deep, Opus) | $0.050 | $0.062 | $0.080 | ~$0.080/req |
| **Image generation** | $0.040 | $0.049 | $0.064 | ~$0.064/img |
| **Document generation** | $0.020 | $0.025 | $0.032 | ~$0.032/doc |
| **Pętla 15-min** (heartbeat) | $0.001 | $0.001 | $0.002 | ~$0.002/run |
| **Pętla 15-min** (z akcją) | $0.005-0.050 | varies | varies | depends on action |
| **Storage** (per GB/month) | $0.015 | $0.018 | $0.024 | ~$0.024/GB/mo |
| **Mod execution** | $0.001-0.010 | varies | varies | depends on mod |

### Miesięczny koszt typowego użytkownika

| Profil | Usage pattern | Szacowany koszt/miesiąc |
|---|---|---|
| **Light user** | 5 min voice/dzień, 20 text msgs/dzień, basic mods | $8-15/mo (~35-65 PLN) |
| **Normal user** | 15 min voice/dzień, 50 msgs/dzień, 5 mods, Bizzon basic | $25-45/mo (~110-200 PLN) |
| **Power user** | 30 min voice/dzień, 100 msgs/dzień, 10+ mods, Bizzon full, outbound calls | $60-120/mo (~260-520 PLN) |
| **Business** | Full Bizzon, outbound calls, document gen, multiple instances | $100-300/mo (~430-1300 PLN) |

**Porównanie z konkurencją:**
- ChatGPT Plus: $20/mo flat (ale ograniczenia)
- Claude Pro: $20/mo flat (ale ograniczenia)
- Pi (Inflection): Free / $? (nie ogłosili)
- Replika Pro: $70/year
- IORS Light user: ~$12/mo — **drożej niż flat-rate, ale uczciwie per usage**

**Argument za drożej:** IORS to nie chatbot. To cyfrowy bliźniak pracujący 24/7, z outbound actions, autonomią, 12 kanałami. $12/mo za "asystenta który dzwoni do lekarza i zarządza kalendarzem" to okazja.

---

## 3. BYOK — Bring Your Own Key

### Dwa tryby

**Tryb 1: Managed (domyślny)**
- User płaci per-usage ze wszystkimi kosztami
- Zero konfiguracji, działa od razu
- Koszty AI models wliczone w cenę

**Tryb 2: BYOK**
- User dostarcza własne API keys (Anthropic, OpenAI, Google, ElevenLabs)
- Koszt AI models: $0 z naszej strony (user płaci bezpośrednio providerom)
- User płaci nam TYLKO: operations (23%) + marża (30%) od infrastruktury (bez AI model costs)
- Rezultat: **40-60% taniej** dla power userów

**Implementacja BYOK:**

```typescript
interface TenantBilling {
  mode: 'managed' | 'byok';

  // BYOK keys (encrypted, per-tenant Vault)
  byok_keys?: {
    anthropic?: string;   // user's Anthropic API key
    openai?: string;      // user's OpenAI key
    google_ai?: string;   // user's Google AI key
    elevenlabs?: string;  // user's ElevenLabs key
  };

  // Billing
  stripe_customer_id: string;
  usage_this_period: UsageRecord[];
  billing_cycle: 'monthly' | 'weekly';
}
```

**BYOK routing:**
1. Check `tenant.billing.mode`
2. If BYOK + key exists → use user's key → charge $0 for AI
3. If BYOK + key missing for tier → fallback to managed (charge normally)
4. If managed → use our keys → charge full price

**Tabela:** `exo_billing_config` per tenant, `exo_usage_records` per interaction.

---

## 4. Marketplace — Tantiemy i Auto-Przepływy

### Dwustronny rynek

**Twórcy** (developers, power users, IORS sam) tworzą mody, rigi, skille.
**Użytkownicy** instalują i używają.
**Tantiemy:** Twórcy zarabiają per-usage, nie per-install.

### Model tantiemowy

```
User płaci za mod usage: $0.005/execution

Podział:
├── Twórca moda:        70%  = $0.0035
├── Platform (my):      25%  = $0.00125
└── Marketplace fund:    5%  = $0.00025 (marketing, review, QA)
```

**70/30 split (twórca/platforma)** — standard rynkowy (Apple App Store: 70/30, Shopify: 80/20, Stripe: varies). Wybraliśmy 70/30 jako uczciwy kompromis — twórca dostaje większość.

**Dlaczego usage-based, nie per-install:**
- Per-install: twórca zarabia raz, potem zero motywacji do utrzymania
- Per-usage: twórca zarabia gdy mod DZIAŁA i jest WARTOŚCIOWY → alignment incentives
- Tau: tantiema to pętla wartości (twórca → mod → user → usage → tantiema → twórca)

### Auto-przepływy (Stripe Connect)

```
User interaction → usage logged → billing period ends →
Stripe invoice → user pays → Stripe Connect splits:
  → 70% to creator's connected account
  → 25% to platform account
  → 5% to marketplace fund

Payout: weekly (creators) / monthly (platform)
Minimum payout: $10 (below → accumulate)
```

**Implementacja:** Stripe Connect (Standard accounts for creators), Stripe Metered Billing (usage tracking), Stripe Invoicing (automatic).

### Marketplace Discovery

Mody odkrywane przez:
1. **IORS proponuje** — "Znalazłem mod od community który robi X. Chcesz spróbować?" (primary discovery)
2. **Marketplace browse** — ExoSkull panel, searchable catalog
3. **Peer recommendation** — "IORS użytkownika Y poleca ten mod" (za zgodą)
4. **Trending** — "Popularne w tym tygodniu"

### Bezpieczeństwo marketplace

Każdy community mod przechodzi:
1. **AST analysis** — automated security scan (no eval, no network calls poza allowlist)
2. **Sandbox test** — execution w isolated-vm (128MB, 5s timeout)
3. **Code review** — AI-assisted (Sonnet) + manual for popular mods
4. **10-user threshold** — community verified after 10 active users
5. **Feedback loop** — auto-delist if satisfaction < 3/5 after 50 uses

---

## 5. Revenue Model i Unit Economics

### Revenue Streams

| Stream | % Revenue (Year 1 est.) | Opis |
|---|---|---|
| **AI usage (managed)** | 50% | Per-usage AI costs + markup |
| **Platform fee** | 25% | Infrastructure, storage, compute |
| **Marketplace cut** | 10% | 25% of creator payouts |
| **BYOK platform fee** | 10% | Operations + marża (no AI costs) |
| **Premium features** | 5% | Priority processing, extra storage, SLA |

### Unit Economics (per user per month)

| Metryka | Light | Normal | Power |
|---|---|---|---|
| **Revenue** | $12 | $35 | $90 |
| **COGS (AI + infra)** | $6 | $18 | $45 |
| **Gross margin** | $6 (50%) | $17 (49%) | $45 (50%) |
| **CAC** (target) | $15 | $15 | $15 |
| **Payback period** | 2.5 mo | 0.9 mo | 0.3 mo |
| **LTV** (12 mo, 5% churn) | $131 | $383 | $984 |
| **LTV/CAC** | 8.7x | 25.5x | 65.6x |

**Benchmark:** SaaS standard LTV/CAC > 3x. Nasze > 8x nawet na light users.

### Projections (Year 1-3)

| Metryka | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| **Users** | 1,000 | 15,000 | 100,000 |
| **Avg revenue/user/mo** | $25 | $30 | $35 |
| **MRR** | $25K | $450K | $3.5M |
| **ARR** | $300K | $5.4M | $42M |
| **Gross margin** | 45% | 50% | 55% |
| **Marketplace creators** | 50 | 500 | 5,000 |
| **Marketplace GMV/mo** | $2K | $50K | $500K |

---

## 6. Ekonomia jako Pętle Tau

### Usage = Loop Rotation

Każde użycie IORS to obrót pętli wartości:

```
User ma problem →
IORS rozumie (AI cost) →
IORS działa (tool cost) →
User dostaje wartość →
User płaci (proportional to value delivered) →
System ma środki na rozwój →
System lepiej rozumie →
User dostaje WIĘCEJ wartości →
... (spirala wzwyż)
```

**Przefazowanie ekonomiczne:**
- Phase 1: "Płacę za asystenta" (per-interaction)
- Phase 2: "Płacę za system który zarządza moim życiem" (increasing usage, increasing value)
- Phase 3: "System ZARABIA dla mnie więcej niż kosztuje" (Bizzon generuje revenue > costs)

### Transparentność jako Tau

User widzi DOKŁADNIE breakdown każdej złotówki:
- "Z twoich $35 w tym miesiącu: $18 to koszty AI/infra, $5 to operacje, $1 to marketplace creators, $11 to moja marża."
- User decyduje czy to fair
- Jeśli nie → BYOK → obniża koszty
- Transparentność buduje zaufanie → zaufanie buduje retention → retention buduje LTV → LTV buduje możliwości rozwoju systemu

To nie jest "pricing page". To **dialog o wartości** — pętla Tau między userem a systemem.

### Compensation w ekonomii

Gdy jeden kanał drożeje (np. Twilio podnosi ceny voice):
- System kompensuje: routuje więcej na tańsze kanały (WhatsApp, Telegram)
- Informuje usera: "Voice podrożał 10%. Mogę więcej robić przez WhatsApp — chcesz?"
- User decyduje

Gdy user ma mało budżetu:
- System obniża tier modeli (Sonnet → Haiku → Flash)
- Zmniejsza częstotliwość Pętli (co 15 min → co 1h)
- Informuje: "Masz mało środków. Obniżyłem jakość AI żeby wystarczyło na cały miesiąc. Chcesz dolać?"

---

## 7. Porównanie z Konkurencją

| | **IORS** | **ChatGPT Plus** | **Claude Pro** | **Replika** | **Pi** |
|---|---|---|---|---|---|
| **Model** | Pay-per-usage | $20/mo flat | $20/mo flat | $70/year | Free/? |
| **Voice** | Pełny (12 kanałów) | Ograniczony | Brak | Ograniczony | Tak |
| **Proaktywność** | 24/7 autonomous | Brak | Brak | Minimalna | Minimalna |
| **Personalizacja** | Pełna (imię, głos, styl) | Minimalna | Brak | Tak | Tak |
| **Outbound actions** | Tak (dzwoni, pisze, scheduluje) | Brak | Brak | Brak | Brak |
| **Marketplace** | Usage-based tantiemy | Brak (GPTs bezpłatne) | Brak | Brak | Brak |
| **Transparentność** | Jawna marża | Brak | Brak | Brak | Brak |
| **BYOK** | Tak | Brak | Brak | Brak | Brak |
| **Bizzon (business)** | Tak | Brak | Brak | Brak | Brak |

**Unfair advantage IORS:**
1. **Proaktywność** — jedyny system który INICJUJE (nie tylko reaguje)
2. **Transparentność** — jedyny z jawną marżą
3. **BYOK** — power users obniżają koszty
4. **12 kanałów** — spotykamy usera tam gdzie jest
5. **Bizzon** — prowadzi biznes, nie tylko odpowiada na pytania
6. **Marketplace z tantiemami** — twórcy zarabiają, ekosystem rośnie

---

---

## 8. System Afiliacyjny

### Model referral

X% revenue od poleconego usera przez **pierwsze 3 miesiące** trafia do polecającego.

**Mechanika:**
- Polecający dostaje unikalny link/kod referral
- Polecony rejestruje się → przypisanie do referrer
- Przez 3 miesiące: X% (np. 15%) z revenue poleconego → payout do polecającego
- Payout: Stripe Connect (ten sam system co marketplace)

**Anti-fraud:**
- Minimum 30 dni aktywności poleconego (nie fake signups)
- Max 100 referrali per user (prevent spam rings)
- Polecony musi wydać min $5 łącznie (nie "darmowe" konta)

**Tabela:**
```sql
CREATE TABLE exo_referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  referred_tenant_id UUID REFERENCES exo_tenants(id),
  referral_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'active', 'expired', 'fraud'
  revenue_share_pct NUMERIC DEFAULT 15,
  active_until TIMESTAMPTZ,       -- 3 months from referred signup
  total_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Revenue stream:** Cost-of-acquisition via referral < paid ads. Win-win — polecający zarabia, platforma zyskuje usera taniej.

---

## 9. Solo Founder Economics

### System zaprojektowany do prowadzenia przez 1 osobę

**Automation-first:**
- Billing: auto (Stripe Metered + Connect)
- Payouts: auto (marketplace + referrals)
- Infrastructure: managed services (Vercel, Supabase, Cloudflare R2)
- Monitoring: auto-alerts (Vercel, Supabase)
- QA: automated pipeline (no manual review for basic mods)
- Customer support: IORS sam obsługuje userów (meta!)

**Community-driven:**
- Marketplace review: power users (Reviewer tier) sprawdzają mody
- Bug reports: community triage
- Feature requests: community votes
- Documentation: community contributors

**No-hire dependencies:**
- Zero FTE required for operations
- Growth = more users + more mods + more revenue
- Costs scale linearly (per-usage), revenue scales super-linearly (network effects)

**Break-even solo:**
- Infrastructure: ~$500/mo (Vercel Pro, Supabase Pro, Cloudflare)
- External: ~$200/mo (Composio, Twilio, ElevenLabs)
- Total overhead: ~$700/mo
- Break-even: ~70 paying users (at avg $10/mo margin after costs)

---

## 10. Open Mod Licensing

### Mody NIE są zamknięte na platformie

Mody z marketplace **MOGĄ** być używane w zewnętrznych produktach. Nie zamykamy ekosystemu.

**Licensing model:**
- Creator decyduje o licencji swojego moda (MIT, Apache, commercial, custom)
- Platform fee obowiązuje TYLKO przy dystrybucji przez nasz marketplace
- Jeśli creator dystrybuuje poza marketplace → zero opłat dla nas
- Marketplace to WARTOŚĆ (discovery, trust, billing), nie lock-in

**Dlaczego open:**
- Lock-in odpycha developerów → mniejszy ekosystem
- Open = więcej creatorów = więcej modów = więcej userów = więcej revenue (paradoks: otwartość zarabia więcej)
- "Use anywhere" = trust = creator-first philosophy

---

*Implementacja billing: Stripe Metered Billing + Stripe Connect*
*Powiązane: [IORS_GOVERNANCE.md](./IORS_GOVERNANCE.md) — transparentność i governance*
