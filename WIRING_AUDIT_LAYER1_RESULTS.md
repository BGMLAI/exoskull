# A4 Warstwa 1 — Static Analysis Results

**Date:** 2026-02-17
**Tools:** tsc --strict, madge (circular + orphans), Knip (dead code)
**Codebase:** 902 files scanned

---

## 1. tsc --strict — PASS (0 errors)

TypeScript strict mode passes cleanly. No `any` leaks, no missing null checks at the type level.

---

## 2. Circular Dependencies — 36 found

### Critical: `lib/iors/tools/` barrel pattern (35 cycles)

All 35 cycles follow the same pattern:
```
lib/iors/tools/index.ts → lib/iors/tools/<tool-file>.ts → lib/iors/tools/index.ts
```

**Root cause:** `index.ts` re-exports all tools, and individual tool files import from `index.ts` (likely for shared types or other tools). `dashboard-tools.ts` is the one importing FROM index.ts (line 11 in madge output), creating the cycle.

**Affected files (34 tool modules):**
- app-builder-tools, autonomy-tools, canvas-tools, capabilities-tools, code-execution-tools, code-generation-tools, communication-tools, composio-tools, content-tools, dashboard-tools, debate-tools, dynamic-handler, email-tools, emergency-tools, emotion-tools, feedback-tools, google-drive-tools, google-fit-tools, integration-tools, knowledge-analysis-tools, knowledge-tools, mcp-bridge-tools, memory-tools, mod-tools, outbound-tools, personality-tools, planning-tools, ralph-tools, self-config-tools, skill-goal-tools, strategy-tools, task-tools, tyrolka-tools, value-tools, web-tools

**Fix:** Extract shared types/helpers into `lib/iors/tools/shared.ts` and import from there instead of from `index.ts`.

### Minor: InboxSidebar ↔ MessageListItem (1 cycle)
```
components/inbox/InboxSidebar.tsx → components/inbox/MessageListItem.tsx → InboxSidebar.tsx
```
**Fix:** Extract shared types into `components/inbox/types.ts`.

---

## 3. Knip Dead Code Analysis

### 3a. Unused Files (19 orphans)
| File | Assessment |
|------|------------|
| `lib/onboarding/types.ts` | Dead — onboarding uses different types |
| `lib/rigs/facebook/index.ts` | Dead — Facebook rig not active |
| `lib/rigs/telegram/client.ts` | Dead — Telegram not integrated |
| `lib/skills/catalog/index.ts` | Dead — skills use different registry |
| `lib/skills/index.ts` | Dead — registry moved |
| `lib/stores/useInterfaceStore.ts` | Dead — cockpit store replaced it |
| `lib/swarm/coordinator.ts` | Dead — swarm moved to lib/ai/swarm |
| `lib/tools/email-tool.ts` | Dead — email tools in iors/tools |
| `lib/ui/adaptive-theme.tsx` | Dead — theme in providers |
| `lib/ui/color-palette.ts` | Dead — colors in CSS vars |
| `lib/unified-thread-repair.ts` | Dead — one-time migration script |
| `lib/voice/index.ts` | Dead — voice uses direct imports |
| `lib/voice/web-speech.ts` | Dead — not used (Web Speech API fallback) |
| `run-migration.js` | Dead — duplicate of scripts/ |
| `scripts/backfill-note-embeddings.ts` | Keep — utility script |
| `scripts/fix-twilio-routing.ts` | Keep — utility script |
| `scripts/generate-audio-cache.ts` | Keep — utility script |
| `scripts/run-migration.js` | Keep — utility script |
| `tests/mocks/supabase.ts` | Keep — test mock |

**Safe to delete: 13 files** (excluding scripts/ and tests/)

### 3b. Unused Dependencies (15)
| Package | Used? | Action |
|---------|-------|--------|
| `@arwes/animated` | No refs | REMOVE |
| `@arwes/bgs` | No refs | REMOVE |
| `@arwes/frames` | No refs | REMOVE |
| `@arwes/react` | No refs | REMOVE |
| `@arwes/text` | No refs | REMOVE |
| `arwes` | No refs | REMOVE (all 6 arwes packages = dead) |
| `@radix-ui/react-avatar` | Shadcn UI | KEEP (may be used indirectly) |
| `@radix-ui/react-slot` | Shadcn UI | KEEP (used by Button) |
| `@radix-ui/react-toast` | Shadcn UI | KEEP |
| `@react-three/uikit` | Three.js scene | VERIFY |
| `date-fns` | Used in code | FALSE POSITIVE — keep |
| `pg` | Supabase pooler | VERIFY |
| `react-force-graph-2d` | Mindmap | VERIFY |
| `react-grid-layout` | Canvas widgets | KEEP |
| `recharts` | Dashboard charts | VERIFY |

**Safe to remove: 6 arwes packages** (the Arwes sci-fi UI library was replaced by custom CSS)

### 3c. Unused devDependencies (5)
| Package | Action |
|---------|--------|
| `@testing-library/react` | KEEP — used in tests |
| `@types/react-grid-layout` | KEEP — types for grid layout |
| `eslint` | KEEP — linting |
| `eslint-config-next` | KEEP — Next.js linting |
| `puppeteer` | VERIFY — browser testing? |

### 3d. Unlisted Dependencies (used but not in package.json)
| Package | Location | Action |
|---------|----------|--------|
| `three-stdlib` | components/3d/CyberpunkSceneInner.tsx | ADD to deps |
| `postprocessing` | components/3d/ScenePostProcessing.tsx | ADD to deps |
| `zod` | lib/agent-sdk/iors-mcp-server.ts | Already transitive — ADD explicitly |
| `@vitest/coverage-v8` | vitest.config.ts | ADD to devDeps |

### 3e. Unused Exports — 133 exports, 134 types

**Top offenders by module:**

| Module | Unused exports | Notes |
|--------|---------------|-------|
| `lib/agents/index.ts` | 17 | Agent system barrel — many unused re-exports |
| `lib/mods/executors/index.ts` | 22 | Mod executors — many unused factory functions |
| `lib/security/index.ts` | 14 | Security barrel — embeddings helpers unused |
| `lib/ai/index.ts` | 11 | AI barrel — cost/token helpers unused |
| `lib/autonomy/index.ts` | 10 | Autonomy barrel — action executor unused |
| `lib/ai/swarm/index.ts` | 11 | Swarm barrel — data collectors unused |
| `lib/iors/tools/channel-filters.ts` | 2 | Channel filter constants |
| `lib/cron/dispatcher.ts` | 8 | Channel dispatchers (messenger, telegram, etc.) |
| UI components | ~15 | Shadcn re-exports (normal) |

**Assessment:** Most unused exports are in barrel files (`index.ts`) re-exporting things that no consumer imports. The actual implementations may still be used internally. **Low risk — clean up barrel files, don't delete implementations.**

---

## 4. Summary & Recommendations

### Priority 1 — Quick Wins (do now)
1. **Remove 6 arwes packages** from package.json (~2MB savings)
2. **Add 4 unlisted deps** (three-stdlib, postprocessing, zod, @vitest/coverage-v8)
3. **Delete 13 dead files** (see 3a above)

### Priority 2 — Structural (next sprint)
4. **Fix circular deps in lib/iors/tools/** — Extract `shared.ts` with common types/helpers
5. **Fix InboxSidebar cycle** — Extract shared types
6. **Clean barrel files** — Remove unused re-exports from index.ts files

### Priority 3 — Debt Tracking (backlog)
7. **133 unused exports** — Most are barrel re-exports, low impact but worth auditing module-by-module
8. **Verify 4 deps** (@react-three/uikit, pg, react-force-graph-2d, recharts) — may be used dynamically

### Health Score

| Metric | Score | Notes |
|--------|-------|-------|
| Type Safety (tsc --strict) | **A** | 0 errors |
| Circular Dependencies | **D** | 36 cycles (35 from one pattern) |
| Dead Code | **C+** | 13 dead files, 6 dead packages |
| Dependency Hygiene | **B-** | 4 unlisted, 6 unused |
| Export Hygiene | **C** | 133 unused exports |
| **Overall** | **C+** | Main issue: iors/tools barrel pattern |
