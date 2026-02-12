# ExoSkull Agent Team Prompts

Ready-to-paste prompts for coordinating multiple Claude Code instances on ExoSkull.

**Prerequisites:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.json env.
**Display mode:** in-process (default) — use Shift+Up/Down to switch teammates, Ctrl+T for task list.
**Force in-process (if needed):** `claude --teammate-mode in-process`

---

## 1. Parallel Code Review

Best for: reviewing a PR or batch of recent changes from multiple angles simultaneously.

```
Create an agent team to review recent ExoSkull changes. Spawn three reviewers:

- Security reviewer: focus on auth, RLS policies, API key exposure, injection vectors in exoskull-app/app/api/ and lib/. Check that all CRON endpoints verify CRON_SECRET. Check for SQL injection in any raw queries.

- Performance reviewer: check DB queries for N+1 problems, missing indexes, unnecessary sequential awaits that could be Promise.all. Focus on lib/iors/conversation-handler.ts, lib/gateway/, and API routes with multiple DB calls.

- Architecture reviewer: verify IORS patterns are consistent, gateway channels follow the adapter pattern, error logging follows CLAUDE.md rules (structured context, never bare catch/throw). Check that new code reuses existing utilities from lib/.

Have them each review independently, then share findings. Synthesize into a prioritized action list.
```

---

## 2. Multi-Module Feature Development

Best for: new features that span backend, frontend, and IORS integration.

```
Create an agent team to implement [DESCRIBE FEATURE HERE]. Spawn teammates:

- Backend teammate: owns API routes (exoskull-app/app/api/) and server logic (exoskull-app/lib/). Creates DB migrations if needed. Must follow existing patterns in lib/supabase.ts for DB access.

- Frontend teammate: owns React components (exoskull-app/app/dashboard/, exoskull-app/components/). Must use existing UI patterns (Tailwind, shadcn/ui components). Self-fetching widget pattern if adding to canvas.

- IORS teammate: owns tool definitions (lib/iors/tools/) and conversation-handler.ts integration. Must register new tools in the handler's tool array and update system prompt tool list.

Require plan approval before any teammate makes changes. Only approve plans that:
1. Include error logging with structured context
2. Don't duplicate existing utilities
3. Follow the project's existing patterns
```

---

## 3. Debugging with Competing Hypotheses

Best for: bugs where the root cause is unclear and could be in multiple subsystems.

```
[DESCRIBE THE BUG AND SYMPTOMS HERE]

Spawn 4 agent teammates to investigate different hypotheses. Have them actively challenge each other's theories:

- Teammate 1 (Gateway): investigate lib/gateway/message-gateway.ts, channel adapters, and message routing. Check if the message reaches processUserMessage() correctly.

- Teammate 2 (Database): investigate Supabase queries, RLS policies, migration state. Check if data is being written/read correctly. Verify table schemas match code expectations.

- Teammate 3 (AI Router): investigate lib/ai-router/, circuit-breaker state, model availability. Check if API calls succeed and responses parse correctly.

- Teammate 4 (Frontend): investigate React components, API fetch calls, state management. Check browser console for errors, network tab for failed requests.

Each teammate should:
1. State their hypothesis clearly
2. Gather evidence for/against
3. Message other teammates to challenge their findings
4. Converge on the actual root cause

Update findings with the consensus diagnosis and fix recommendation.
```

---

## 4. IORS System Audit

Best for: periodic health check of the entire IORS (Intelligent Orchestrated Response System).

```
Create an agent team to audit the IORS system end-to-end. Spawn teammates:

- MAPEK Loop auditor: trace the full MAPEK-K loop in lib/iors/loop-tasks/. Verify all 6 phases (monitor, analyze, plan, execute, knowledge, maintenance) are wired correctly. Check that optimization auto-tuning in optimization.ts makes sensible decisions. Report any dead code paths.

- Tool auditor: audit all tools in lib/iors/tools/ (currently ~42 tools across 11 categories). For each tool, verify: error handling exists, return types are consistent, no hardcoded values that should be configurable. Flag tools that could be consolidated.

- Learning pipeline auditor: verify the full learning cycle — highlights (lib/learning/), pattern detection, self-updater decay, skill lifecycle. Check that learning_events table is populated correctly. Verify highlight_decay and skill_lifecycle maintenance handlers work.

Each auditor produces a severity-rated report:
- P0: broken functionality
- P1: missing error handling or data integrity risk
- P2: code quality / consistency issues

Synthesize into a single prioritized action list.
```

---

## 5. Cross-Layer Refactor (with Delegate Mode)

Best for: refactoring a component that spans DB, API, UI, and tests. Lead coordinates only.

```
Create an agent team to refactor [DESCRIBE COMPONENT].

After team creation, I'll press Shift+Tab to enable delegate mode (lead coordinates only, doesn't write code).

Spawn teammates with task dependencies:

- DB specialist: create/modify Supabase migrations, update RPC functions. Must complete first — other teammates depend on schema.

- API specialist: update route handlers in app/api/, modify lib/ server code. Depends on DB specialist finishing.

- UI specialist: update React components, hooks, and dashboard pages. Depends on API specialist finishing.

- Test specialist: write integration tests for all changes. Depends on all other teammates finishing.

Set task dependencies: DB → API → UI → Tests (sequential).

Quality gates:
- DB migrations must be reversible
- API changes must include error logging
- UI must use existing component library
- Tests must cover happy path + error cases

Wait for all teammates to complete before synthesizing results.
```

---

## 6. Research Sprint

Best for: evaluating a new technology, library, or approach from multiple angles before implementation.

```
Create an agent team to research [DESCRIBE TOPIC]. Spawn teammates:

- Technical feasibility: explore the codebase to understand current architecture, find integration points, estimate complexity. Focus on exoskull-app/lib/ and existing patterns.

- Documentation & examples: search for documentation, tutorials, community examples. Evaluate API stability, maintenance status, and ecosystem health.

- Devil's advocate: find reasons NOT to adopt this. Look for: performance concerns, security risks, maintenance burden, vendor lock-in, simpler alternatives.

Each teammate shares findings. Synthesize into a go/no-go recommendation with:
- Pros and cons
- Implementation estimate (files to change, new dependencies)
- Risk assessment
- Recommended approach if "go"
```

---

## 7. Full E2E Browser Audit — Test, Fix, Improve UX

Best for: comprehensive browser-based walkthrough of every page, widget, and flow. Tests what works, fixes what's broken, improves UX. Uses Playwright MCP for real browser interaction.

**Pre-requisite:** App must be running locally (`npm run dev` in exoskull-app/) or deployed at a URL.

```
Create an agent team to do a full end-to-end browser audit of ExoSkull. The app is running at http://localhost:3000.

Every teammate MUST use Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_type, browser_take_screenshot, browser_console_messages, browser_network_requests) to test in a real browser. Take screenshots of every issue found. Check console for errors on every page.

Spawn 5 teammates:

--- TEAMMATE 1: Auth & Onboarding Flow ---
Test these flows in the browser:
1. Landing page (/) — loads correctly, all links work, responsive on mobile (resize to 390x844)
2. Login page (/login) — form renders, validation works, error states shown
3. Sign up → onboarding (/onboarding) — BirthChat component loads, messages flow works, profile extraction completes
4. Post-onboarding redirect to /dashboard works
5. Session persistence — refresh doesn't lose auth
6. Logout flow — clears session, redirects to /login

For each issue: screenshot it, describe expected vs actual, check console errors. Fix auth/redirect bugs in middleware.ts, login/page.tsx, onboarding/page.tsx.

--- TEAMMATE 2: Dashboard Home & Canvas Widgets ---
Navigate to /dashboard after login and test:
1. CanvasGrid loads — all default widgets render (voice_hero, health, tasks, optimization, conversations, emotional, quick_actions, activity_feed, calendar)
2. Each widget: does it show real data or errors? Screenshot any widget showing "Error", "undefined", empty state when data exists
3. Widget drag & drop — grab a widget handle, drag to new position, verify it saves
4. Widget picker (+ button) — opens, lists all 16 widget types, adding a widget works
5. VoiceHeroWidget — microphone button renders, click doesn't crash
6. Responsive: resize browser to 768px width, then 390px — widgets should stack vertically
7. Dark/light mode toggle — all widgets readable in both themes

Fix any broken widgets in components/widgets/. Fix layout issues in components/canvas/CanvasGrid.tsx. Improve skeleton loading states.

--- TEAMMATE 3: Dashboard Pages (All 13 Routes) ---
Navigate to each dashboard page and verify it renders correctly:
1. /dashboard/chat — ConversationPanel loads, message input works, can send a message, response streams back
2. /dashboard/tasks — task list renders, can create/complete/delete tasks
3. /dashboard/goals — goals render, progress bars work, can create goals
4. /dashboard/knowledge — upload area renders, document list shows, search works
5. /dashboard/memory — memory entries show, timeline works
6. /dashboard/conversations — conversation history list renders, can click into conversation
7. /dashboard/mods — mod registry shows available mods, install button works
8. /dashboard/mods/[slug] — mod detail page renders for installed mods
9. /dashboard/skills — skills list renders, can view skill details
10. /dashboard/skills/[id] — skill detail shows code, approve/rollback buttons work
11. /dashboard/projects — project list renders
12. /dashboard/settings — settings form renders, can toggle preferences, save works
13. /dashboard/settings/integrations — integration list shows, connect buttons render

For EACH page: take screenshot, check console errors, check network failures, verify mobile responsiveness (390px). Fix broken pages in app/dashboard/*/page.tsx. Improve empty states and loading states.

--- TEAMMATE 4: Chat & Voice Flows (Core UX) ---
Focus on the primary user interaction paths:
1. Web chat (/dashboard/chat):
   - Send a text message → AI responds within reasonable time
   - Response renders as markdown (code blocks, lists, bold)
   - Conversation history scrolls correctly
   - Long messages don't overflow container
   - Thread context is maintained (AI remembers previous messages)
2. Voice widget (VoiceHeroWidget on /dashboard):
   - Click microphone → browser asks for mic permission
   - Speech-to-text works (if browser supports it)
   - AI response plays back via TTS or shows as text
   - Stop button works mid-response
3. Sidebar navigation:
   - All 10 nav items clickable, navigate to correct page
   - Active page highlighted in sidebar
   - Sidebar collapse/expand works
   - Mobile: bottom tab bar shows 4 items, all navigate correctly
4. General UX issues:
   - Page transitions smooth (no full reload flash)
   - Toast notifications appear and dismiss
   - Error boundaries catch crashes gracefully
   - No orphaned loading spinners

Fix chat/voice bugs in components/chat/ConversationPanel.tsx, components/voice/. Fix sidebar in components/dashboard/CollapsibleSidebar.tsx. Improve message rendering, scroll behavior, loading indicators.

--- TEAMMATE 5: Admin Panel & Cross-Cutting UX ---
Navigate to /admin and test all admin pages:
1. /admin — command center overview loads with real data
2. /admin/cron — CRON health table renders, trigger buttons work
3. /admin/ai — AI usage stats render, model breakdown shows
4. /admin/users — user list loads, pagination works, click into user detail
5. /admin/users/[id] — user detail page renders profile + activity
6. /admin/business — KPI charts render (MRR, churn, engagement)
7. /admin/autonomy — intervention list loads
8. /admin/data-pipeline — ETL status shows bronze/silver/gold
9. /admin/insights — optimization metrics render
10. /admin/logs — API and error logs load

Then cross-cutting UX checks across ALL pages:
- Consistent spacing, typography, color scheme
- All buttons have hover states
- Form inputs have focus rings, validation errors
- Tables are responsive (horizontal scroll on mobile, not overflow)
- Charts/graphs render without errors
- No console warnings about missing keys, deprecated APIs
- Image alt tags present
- Color contrast meets WCAG AA (text readable in both themes)

Fix admin pages in app/admin/*/page.tsx, components/admin/. Fix any global UX issues in globals.css, tailwind.config. Propose UX improvements with before/after screenshots.

---

COORDINATION RULES:
- Each teammate works in parallel on their assigned area — NO file conflicts since areas are different
- Take a screenshot of EVERY page visited (browser_take_screenshot) — save as evidence
- Check browser_console_messages(level: "error") on EVERY page
- Check browser_network_requests(includeStatic: false) for failed API calls on every page
- When fixing: commit each fix separately with descriptive message
- Priority: P0 = crashes/blank pages, P1 = broken functionality, P2 = UX improvements
- After all teammates finish: synthesize into a master report with screenshots, fixes applied, and remaining UX recommendations
```

---

## Tips

- **Shift+Up/Down** — navigate between teammates in in-process mode
- **Ctrl+T** — toggle shared task list
- **Shift+Tab** — enable delegate mode (lead doesn't write code)
- **Enter on teammate** — view their full session; **Escape** to interrupt their turn
- Each teammate loads CLAUDE.md automatically — project rules apply to all
- Pre-approve common permissions before spawning to reduce interruptions
- Agent teams use significantly more tokens — use for complex tasks, not simple ones
- One team per session — clean up before starting a new team
