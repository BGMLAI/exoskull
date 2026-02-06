# IORS — Governance, Transparency & IP Protection

> **Wersja:** 1.0
> **Data:** 2026-02-06
> **Zależności:** [IORS_VISION.md](./IORS_VISION.md), [IORS_ECONOMICS.md](./IORS_ECONOMICS.md)

---

## 1. Transparency Mechanisms

### Jawne koszty

Każdy user w każdej chwili widzi:
- **Breakdown bieżącego miesiąca:** ile zapłacił, za co, ile z tego to marża
- **Per-interaction cost:** po każdej interakcji opcjonalnie widoczny koszt ("ta rozmowa kosztowała $0.12")
- **Cost projection:** "Przy obecnym tempie, ten miesiąc to ~$28"
- **Historical trend:** wykres kosztów month-over-month

### Jawne algorytmy

- **AI routing:** User wie który model (Flash/Haiku/Sonnet/Opus) obsługuje jego request i dlaczego
- **Proactivity logic:** User widzi DLACZEGO IORS zainicjował kontakt ("Zauważyłem wzorzec X — dlatego piszę")
- **Gamification:** Każdy element oznaczony i wyjaśniony (patrz [IORS_GAMIFICATION.md](./IORS_GAMIFICATION.md))
- **Mod recommendations:** "Proponuję ten mod bo: [powód]. Twórca: [kto]. Cost: [ile]."

> **Uwaga:** Algorytmy i mechanizmy jawne dla usera. Teoria Tau (wewnętrzne DNA systemu) NIE jest eksponowana w UI — system po prostu DZIAŁA wg tych zasad. Terminologia Tau to internal framework, nie user-facing brand.

### Jawna manipulacja

Gamification, proactive nudges, habit building — wszystko oznaczone:
> "Ten element (poranny check-in reminder) jest zaprojektowany żeby budować nawyk. Możesz go wyłączyć."

IORS nie ukrywa swoich technik. Buduje zaufanie transparentnością.

### Implementacja

Dashboard ExoSkull → sekcja "Transparentność":
- Tab "Koszty" — breakdown, projection, history
- Tab "Algorytmy" — co IORS robi i dlaczego
- Tab "Dane" — jakie dane ma IORS, skąd, do czego je używa
- Tab "Autonomia" — jakie zgody ma IORS, co zrobił autonomicznie (audit log)

---

## 2. DAO Governance — Ocena Zasadności

### Zbadane: czy DAO jest właściwe dla IORS?

| Aspekt | Za DAO | Przeciw DAO |
|---|---|---|
| **Decentralizacja** | Community ownership, trust | Complexity, slow decisions |
| **Tokenomics** | Alignment incentives | Regulatory risk (SEC), speculation |
| **Governance** | Democratic | Token whales dominate, voter apathy |
| **Technical** | On-chain transparency | Gas fees, UX nightmare, blockchain complexity |
| **Audience** | Crypto-native users | IORS targets mainstream users — "moja mama ma to używać" |

### Werdykt: NIE-DAO. Własność foundera ZAWSZE. DAO-inspired wartości.

Pełny DAO z tokenami i blockchain jest **nieodpowiedni** dla IORS:
1. **Target audience:** IORS ma być dla KAŻDEGO, nie tylko crypto-native. Wallet, gas fees, tokens = bariera.
2. **Regulatory risk:** Token = potential security (SEC). Niepotrzebne ryzyko.
3. **UX:** Blockchain UX wciąż jest zły. IORS ma być prosty.
4. **Speed:** DAO governance jest WOLNY. IORS potrzebuje szybkich iteracji.
5. **Solo founder:** Firma prowadzona jednoosobowo. DAO wymaga governance overhead.

**Wartości DAO (transparentność, community input) — TAK. Struktura DAO — NIE.**

### Progresywna Governance (founder-led, community-informed)

**Faza 1 (Year 1): Pełna kontrola foundera**
- Founder decyduje o WSZYSTKIM (architektura, business model, features, ethics)
- Publikuje decyzje + uzasadnienie (transparentność)
- Community: feedback via Discord/forum, bug reports, feature requests
- Ownership: 100% founder

**Faza 2 (Year 2): Advisory council**
- Power users + top creators → advisory council (głos doradczy, NIE decyzyjny)
- Community feature voting (1 user = 1 vote, top 3 features per quarter → consideration)
- Founder: final decision maker + override right z uzasadnieniem
- Ownership: 100% founder

**Faza 3 (Year 3+): Community governance (jeśli sens ma)**
- Rozważyć: community council z binding votes na marketplace policies
- Founder zachowuje veto na: safety, ethics, technical architecture, business model
- Ownership: **ZAWSZE founder** — DAO NIGDY nie przejmuje ownership
- Token-based governance: MOŻE w przyszłości, ale nie blockchain-based (w-app tokeny, nie crypto)

### Transparency Reports (kwartalnie od roku 1)

- Revenue, costs, margin breakdown
- User growth, retention, satisfaction
- AI model usage patterns
- Marketplace economics (creator payouts)
- Security incidents
- Governance decisions + uzasadnienia

---

## 3. Community Model

### Turkusowa Organizacja (Teal) — Inspiracja

Frederic Laloux "Reinventing Organizations" (2014): Teal organizations = self-management + wholeness + evolutionary purpose.

**Aplikacja do IORS community:**

| Teal Principle | IORS Implementation |
|---|---|
| **Self-management** | Community tworzy mody, moderuje marketplace, tworzy guidelines — bez centralnej kontroli |
| **Wholeness** | IORS traktuje usera jako pełnego człowieka (nie "customer") — wellbeing first |
| **Evolutionary purpose** | System ewoluuje z community, nie jest planowany top-down |

### Role w community

| Rola | Kto | Co robi |
|---|---|---|
| **User** | Każdy | Używa IORS, daje feedback, głosuje |
| **Creator** | Devs, power users | Tworzy mody, rigi, skille na marketplace |
| **Reviewer** | Zaufani userzy | Code review community mods, quality control |
| **Council** | Wybrani (7-11) | Governance decisions, ethical guidelines |
| **Founder** | Founder (solo) | Vision, technical direction, safety veto, ALL final decisions |

### Community-driven development

1. **Bug reports → Triage → Fix** — community zgłasza, team priorytetyzuje
2. **Feature requests → Vote → Build** — community proponuje i głosuje
3. **Mods → Review → Publish** — community tworzy, reviewers weryfikują
4. **Guidelines → Discuss → Adopt** — community dyskutuje, council adoptuje

---

## 4. Trust Framework

### Trust tiers

| Tier | Trust level | Earned by | Capabilities |
|---|---|---|---|
| **New** | 0 | Registration | Use IORS, basic mods |
| **Verified** | 1 | 30 days + email verified + $10 spent | Rate mods, write reviews |
| **Contributor** | 2 | Published 1+ mod, 3+ positive reviews | Publish mods, join beta features |
| **Reviewer** | 3 | Contributor + invited by council | Review community mods, report issues |
| **Council** | 4 | Elected by community | Governance votes, ethical guidelines |

### Trust actions

- **Build trust:** Consistent positive feedback from users, quality mods, helpful community participation
- **Lose trust:** Malicious mods, spam, manipulation, ToS violation
- **Rebuild trust:** After violation — 90 day probation, re-verification

---

## 5. Strategia Ochrony IP

### Co chronimy

| Element | Wartość | Strategia |
|---|---|---|
| **Architektura systemu** (Pętla, Tau integration, autonomy model) | WYSOKA — to nasz unfair advantage | Trade secret + defensive publication |
| **LOOPCODE** (personality framework) | WYSOKA — unikalny fundament | Trade secret |
| **Mod composition protocol** | ŚREDNIA — novel approach | Trade secret |
| **Pipeline determinizmu** | ŚREDNIA — nie unikalny ale ważny | Trade secret |
| **Nomenklatura** (IORS, Bizzon, ExoSkull, Exoskulleton) | WYSOKA — brand identity | Trademark |
| **Marketplace model** (usage-based tantiemy) | NISKA — łatwy do skopiowania | Brak ochrony (too generic) |
| **UI/UX patterns** (Canvas widgets) | NISKA | Design patents (jeśli uniquely novel) |

### Trade Secrets (primary strategy)

**Dlaczego trade secrets > patenty dla IORS:**

1. **Patenty AI są słabe:** US Patent Office odrzuca wiele AI patents (Alice Corp v. CLS Bank — abstract idea). EU jeszcze bardziej restrykcyjna.
2. **Patent disclosure:** Patent WYMAGA ujawnienia implementacji — co pozwala kopiować (z modyfikacją).
3. **Patent cost:** $15-30K per patent, 3-5 lat procesu. Startup nie ma na to środków.
4. **Trade secrets are free:** Zero kosztów, natychmiastowa ochrona, trwają dopóki tajne.
5. **Speed:** AI architektura zmienia się szybciej niż patent process (3-5 lat).

**Implementacja trade secrets:**
- NDA dla wszystkich kontrybutorów (employees, contractors, advisors)
- Code access control (principle of least privilege)
- Architecture docs NIGDY publiczne (ten dokument = internal only)
- Obfuscation kluczowych algorytmów w produkcji
- Split knowledge — żaden jeden człowiek nie zna CAŁEGO systemu

### Defensive Publication

**Dla elementów które chcemy chronić przed patentowaniem przez INNYCH:**
- Publikujemy opis (np. "system oparty na 15-minutowej pętli autonomicznej z 6 podpętlami") na platformie typu Defensive Patent License, DBLP, lub ResearchGate
- To tworzy "prior art" — nikt inny nie może tego opatentować
- ALE nie ujawniamy implementacji — tylko koncept

**Elementy do defensive publication:**
- Koncepcja Pętli 15-min z podpętlami
- Natural language mod composition
- Tau-based decision framework (zasoby × tło)
- Transparent margin billing model

### Trademark

**Zgłosić do EUIPO + USPTO:**
- "IORS" — wordmark
- "ExoSkull" — wordmark + logo
- "Exoskulleton" — wordmark
- "Bizzon" — wordmark
- "LOOPCODE" — wordmark

**Koszt:** ~€1,500-3,000 per trademark (EUIPO), ~$250-350 per class (USPTO).
**Priorytet:** ExoSkull (brand name) → IORS → Bizzon → reszta.

### Dual Licensing (Phase 2+)

Gdy system dojrzeje:
- **Core engine:** Proprietary license (Exoskulleton runtime)
- **Mod SDK:** Open source (MIT/Apache) — pozwala community budować mody
- **Marketplace:** Platform-specific licensing, ale **mody NIE SĄ zamknięte**

**Open Mod Philosophy:**
- Mody z marketplace MOGĄ być używane w zewnętrznych produktach
- Creator decyduje o licencji swojego moda (MIT, commercial, custom)
- Platform fee obowiązuje TYLKO przy dystrybucji przez nasz marketplace
- Marketplace to WARTOŚĆ (discovery, trust, billing), nie lock-in
- "Use anywhere" = więcej creatorów = większy ekosystem

### Terms of Service

ToS musi zawierać:
- **No scraping:** Zakaz scrapowania architektury core, API
- **No reverse engineering:** Zakaz reverse-engineering algorytmów core engine
- **Data ownership:** User jest właścicielem SWOICH danych. My jesteśmy custodianem.
- **IP assignment:** Mody published na marketplace — creator zachowuje PEŁNE IP. Marketplace = non-exclusive distribution license.
- **Mod portability:** Creator może dystrybuować swój mod gdzie chce. Zero lock-in.

### OpenClaw IP Risk Assessment

**Zbadane:** Czy nazewnictwo IORS koliduje z OpenClaw lub innymi projektami?

| Termin | Risk | Assessment |
|---|---|---|
| "Mod" | BRAK | Generic term (gaming, software). Nie do opatentowania/trademark. |
| "Rig" | BRAK | Generic term (gaming, VFX, hardware). Nie do opatentowania. |
| "Marketplace" | BRAK | Generic term. Setki platform używa. |
| "ExoSkull" | NISKI | Unikalna nazwa. Trademark search recommended przed launch. |
| "IORS" | NISKI | Akronim, unikalna kombinacja. Brak konfliktu. |
| "Exoskulleton" | NISKI | Neologizm. Unikalna kombinacja. |
| "LOOPCODE" | NISKI | Neologizm. Brak istniejącego trademarku. |
| "Pętla" | BRAK | Generic Polish word. |

**OpenClaw:** AI legal research platform — zero overlap z naszym produktem. Brak ryzyka konfliktu.

**Rekomendacja:** Trademark filing dla "ExoSkull" (priorytet) + "IORS" (secondary). Koszt: ~€1,500-3,000 per mark (EUIPO).

### Praktyczne kroki (natychmiast)

1. **Teraz:** NDA template dla kontrybutorów
2. **Teraz:** Trademark application: "ExoSkull" (EUIPO + USPTO)
3. **Miesiąc 1:** Defensive publications (Pętla, Tau decision, mod composition)
4. **Miesiąc 3:** Full ToS draft (prawnik IP)
5. **Miesiąc 6:** Trademark applications: IORS, Bizzon, Exoskulleton
6. **Phase 2:** Dual licensing strategy (gdy mamy Mod SDK)

---

## 6. Etyka AI

### Zasady etyczne IORS

1. **No hallucination policy:** IORS nie zmyśla danych. Jeśli confidence < 70% → disclaimer. Cross-check z DB.
2. **No medical/legal/financial advice:** "Widzę wzorzec X, ale skonsultuj się z lekarzem/prawnikiem/doradcą."
3. **No manipulation:** IORS nie manipuluje userem. Gamification jawna. Proaktywność w ramach zgód.
4. **No surveillance:** Wszystkie dane opt-in. User wie dokładnie co zbieramy i po co.
5. **No discrimination:** Bias testing na modelach. Equal service quality niezależnie od profilu.
6. **Crisis protocol:** Mental health crisis → immediate escalation → human professional.
7. **Right to disconnect:** User może wyłączyć IORS w każdej chwili. Zero questions asked.
8. **Data portability:** Full export w standardowym formacie (JSON). Zero lock-in.
9. **Transparent AI:** User wie kiedy rozmawia z AI (nie udajemy człowieka w outbound calls).
10. **Evolutionary purpose:** System służy userowi, nie odwrotnie. Metrics: user wellbeing, nie engagement.

### Ethical Review Process

Nowe features przechodzą "Ethics Check":
1. **Czy to służy wellbeing usera?** (nie naszemu revenue)
2. **Czy user może to wyłączyć?** (zawsze tak)
3. **Czy transparentne?** (user wie co robi i dlaczego)
4. **Czy mogłoby komuś zaszkodzić?** (edge cases, vulnerable users)
5. **Czy przetestowane na bias?** (różne demografie)

Jeśli DOWOLNY punkt = "nie" → blokada do rozwiązania.

---

*Powiązane: [IORS_ECONOMICS.md](./IORS_ECONOMICS.md) — transparentność kosztów*
*Powiązane: [IORS_GAMIFICATION.md](./IORS_GAMIFICATION.md) — etyczna grywalizacja*
