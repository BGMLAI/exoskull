# Dynamic Skill Generation System for ExoSkull

## Cel

Umożliwić ExoSkull dynamiczne generowanie kodu nowych abilities (skills) w runtime, podobnie jak OpenClaw Foundry - system sam pisze kod nowych funkcjonalności na podstawie potrzeb użytkownika.

---

## Architektura

```
┌─────────────────────────────────────────────────────────────┐
│  1. SKILL NEED DETECTOR                                     │
│     - Gap Detection: "Nigdy nie mówisz o X"                 │
│     - User Request: "Chcę śledzić X"                        │
│     - Pattern Match: "Często wspominasz o kawie"            │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. SKILL GENERATOR (Claude Opus / GPT-4 Codex)             │
│     - Generuje kod TypeScript implementujący IModExecutor   │
│     - Generuje config_schema (JSON Schema)                  │
│     - Generuje SKILL.md (AgentSkills spec)                  │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. VALIDATOR & SECURITY AUDIT                              │
│     - Static analysis (blocked patterns: eval, require, fs) │
│     - Schema validation (implements IModExecutor?)          │
│     - Capability extraction (what data/APIs it accesses)    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. SANDBOX EXECUTION (isolated-vm)                         │
│     - 128MB memory limit                                    │
│     - 5s timeout                                            │
│     - API allowlist (supabase.select OK, fs BLOCKED)        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. APPROVAL GATEWAY (2FA)                                  │
│     - Capability disclosure: "Ten skill będzie..."          │
│     - User consent via 2 DIFFERENT channels                 │
│     - Timeout 24h = auto-reject                             │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  6. DEPLOYMENT & VERSIONING                                 │
│     - Register in exo_generated_skills                      │
│     - Version tags (skill@v1.0.0)                           │
│     - Rollback support                                      │
│     - Auto-archive after 30 days unused                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Struktura plików

### Nowy moduł `lib/skills/`

```
lib/skills/
├── types.ts                    # GeneratedSkill, SkillCapability, etc.
├── index.ts                    # Public API
├── detector/
│   ├── index.ts
│   ├── gap-detector.ts         # Integracja z Layer 8 Gap Detection
│   ├── request-parser.ts       # Parsowanie "chcę śledzić X"
│   └── pattern-matcher.ts      # Wykrywanie wzorców z konwersacji
├── generator/
│   ├── index.ts
│   ├── skill-generator.ts      # Główny generator (AI)
│   └── prompts/
│       └── executor-prompt.ts  # Prompt do generowania IModExecutor
├── validator/
│   ├── index.ts
│   ├── static-analyzer.ts      # AST-based code analysis
│   ├── security-auditor.ts     # Blocked patterns, vulnerabilities
│   └── capability-extractor.ts # Extract data/API access
├── sandbox/
│   ├── index.ts
│   ├── runtime.ts              # isolated-vm execution
│   └── api-allowlist.ts        # Whitelisted APIs
├── approval/
│   ├── index.ts
│   ├── disclosure-generator.ts # Human-readable capability disclosure
│   └── approval-gateway.ts     # Multi-channel 2FA approval
└── registry/
    ├── index.ts
    ├── dynamic-registry.ts     # Runtime skill registration
    ├── version-manager.ts      # Versions, rollback
    └── lifecycle-manager.ts    # Archive unused, monitor usage
```

### API Routes

```
app/api/skills/
├── generate/route.ts           # POST: Generate new skill
├── [id]/
│   ├── route.ts                # GET/PATCH/DELETE skill
│   ├── approve/route.ts        # POST: Approve skill (2FA)
│   └── rollback/route.ts       # POST: Rollback to version
└── execute/route.ts            # POST: Execute skill action
```

---

## Zmiany w istniejącym kodzie

### 1. Rozszerzyć `ModSlug` type (`lib/mods/types.ts`)

```typescript
// PRZED:
export type ModSlug = 'sleep-tracker' | 'energy-monitor' | ...;

// PO:
export type BuiltinModSlug = 'sleep-tracker' | 'energy-monitor' | ...;
export type ModSlug = BuiltinModSlug | `custom-${string}`;
```

### 2. Dodać dynamic loading do executor registry (`lib/mods/executors/index.ts`)

```typescript
import {
  getDynamicSkillExecutor,
  hasDynamicSkill,
} from "@/lib/skills/registry";

export function getModExecutor(slug: ModSlug): IModExecutor | null {
  // 1. Static executors (bundled)
  const factory = EXECUTORS[slug];
  if (factory) return factory();

  // 2. Dynamic (generated) skills
  if (hasDynamicSkill(slug)) {
    return getDynamicSkillExecutor(slug);
  }

  return null;
}
```

---

## Security Measures

### Blocked Patterns (static-analyzer.ts)

```typescript
const BLOCKED_PATTERNS = [
  /eval\s*\(/,
  /Function\s*\(/,
  /require\s*\(/,
  /import\s*\(/,
  /process\./,
  /fs\./,
  /__dirname/,
  /child_process/,
  /exec\s*\(/,
  /\.env/,
];
```

### API Allowlist (api-allowlist.ts)

```typescript
const ALLOWED = {
  supabase: ["from", "select", "eq", "single", "limit", "order"],
  supabase_write: ["insert", "update"], // requires approval
  blocked: ["rpc", "delete"],
};
```

### Sandbox (isolated-vm)

- 128MB memory limit
- 5 second timeout
- No access to: fs, process, require, eval

---

## Approval Flow (2FA - Dual Channel Confirmation)

**Wymaganie:** Potwierdzenie z 2 RÓŻNYCH kanałów przed deploy.

```
1. Skill wygenerowany → audit bezpieczeństwa
2. Audit OK → disclosure wygenerowany
3. KANAŁ 1: Disclosure wysłany (SMS/email/push):
   "Nowy skill 'Water Tracker' chce:
    - Odczytywać exo_water_entries
    - Zapisywać nowe wpisy
    Kod: ABC123
    [Zatwierdź] [Odrzuć]"
4. User odpowiada "approve ABC123" na KANAŁ 1 ✓
5. KANAŁ 2: Automatyczne potwierdzenie na INNYM kanale:
   "Potwierdź deploy 'Water Tracker' na [inny kanał]"
   - Jeśli kanał 1 = SMS → kanał 2 = email/voice/UI
   - Jeśli kanał 1 = email → kanał 2 = SMS/voice/UI
6. User potwierdza na KANAŁ 2 ✓✓
7. DOPIERO TERAZ → skill aktywowany

Alternatywne metody 2FA:
- Kod jednorazowy (6 cyfr) na 2 kanały
- Voice call z potwierdzeniem głosowym
- Biometric (FaceID/TouchID) + kanał tekstowy
- TOTP (Google Authenticator style)
```

---

## Kolejność implementacji

### Faza 1: Foundation

1. Database migration (`exo_generated_skills`, `exo_skill_versions`)
2. Types (`lib/skills/types.ts`)
3. Basic generator (`lib/skills/generator/skill-generator.ts`)

### Faza 2: Security

4. Static analyzer (`lib/skills/validator/static-analyzer.ts`)
5. Sandbox runtime (`lib/skills/sandbox/runtime.ts`)
6. API allowlist (`lib/skills/sandbox/api-allowlist.ts`)

### Faza 3: Approval

7. Capability extractor (`lib/skills/validator/capability-extractor.ts`)
8. Disclosure generator (`lib/skills/approval/disclosure-generator.ts`)
9. Approval gateway with 2FA (`lib/skills/approval/approval-gateway.ts`)

### Faza 4: Registration

10. Dynamic registry (`lib/skills/registry/dynamic-registry.ts`)
11. Version manager (`lib/skills/registry/version-manager.ts`)
12. Update `lib/mods/executors/index.ts` for dynamic loading

### Faza 5: API & Detection

13. API routes (`app/api/skills/*`)
14. Gap detector integration (`lib/skills/detector/gap-detector.ts`)
15. Pattern matcher (`lib/skills/detector/pattern-matcher.ts`)

### Faza 6: Testing

16. Unit tests (generator, validator, sandbox)
17. Integration tests (full flow)
18. Security tests (escape attempts)

---

## Zależności

```json
{
  "isolated-vm": "^4.7.0",
  "esprima": "^4.0.1"
}
```

---

## Przykład wygenerowanego skilla

**User request:** "Chcę śledzić ile piję wody"

**Generated skill:**

```typescript
class WaterTrackerExecutor implements IModExecutor {
  readonly slug = "custom-water-tracker";

  async getData(tenant_id: string) {
    const { data } = await supabase
      .from("exo_water_entries")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("logged_at", { ascending: false });
    return { entries: data, total_ml: sum(data.map((e) => e.amount_ml)) };
  }

  async getInsights(tenant_id: string) {
    const data = await this.getData(tenant_id);
    if (data.total_ml < 1000) {
      return [
        {
          type: "warning",
          title: "Pij więcej wody!",
          message: `Tylko ${data.total_ml}ml dziś`,
        },
      ];
    }
    return [];
  }

  async executeAction(tenant_id, action, params) {
    if (action === "log_water") {
      await supabase.from("exo_water_entries").insert({
        tenant_id,
        amount_ml: params.amount_ml,
        logged_at: new Date(),
      });
      return { success: true };
    }
    return { success: false, error: "Unknown action" };
  }

  getActions() {
    return [
      {
        slug: "log_water",
        name: "Zaloguj wodę",
        description: "Zapisz ile wody wypiłeś",
        params_schema: {
          type: "object",
          required: ["amount_ml"],
          properties: { amount_ml: { type: "number" } },
        },
      },
    ];
  }
}
```

---

## Powiązane pliki

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Główna architektura ExoSkull
- [lib/mods/types.ts](../lib/mods/types.ts) - Interface IModExecutor
- [lib/mods/executors/](../lib/mods/executors/) - Przykłady statycznych executorów
