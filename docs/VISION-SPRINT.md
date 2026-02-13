# ExoSkull Vision Sprint (2026-02-13)

Briefing for parallel Claude Code sessions. Read this + ARCHITECTURE.md + CLAUDE.md before starting.

## Core Problem

System parts don't talk to each other. Not autonomous. Not self-aware.
Components work in isolation but not as a whole. Not producing real value yet.

---

## WORKSTREAM A: Fix Integrations (CRITICAL — user is blocked)

Google Fit fetch fails repeatedly. Emails need 2-3 attempts, no full email view,
can't read attachments. Word docs can't be opened to extract images. Google Drive
no access. GHL not connected. ALL must work reliably on first attempt.

**Files:** `lib/rigs/`, `lib/email/`, `app/api/integrations/`, `lib/gateway/adapters/`

**Tasks:**

- Debug Google Fit OAuth + data fetch — find why it fails, fix, add retry + logging
- Add full email view (read entire email with attachments, not just summary)
- Add Word/DOCX image extraction (mammoth already imported, extend)
- Fix email search reliability (works on 2nd-3rd attempt = race condition or cache)
- Add integration health panel visible to user (not just admin)
- Test ALL integrations end-to-end, fix each one

---

## WORKSTREAM B: Unified Thread = Claude Code for Everyone

Chat Rzeka must show AI reasoning process like Claude Code / Deep Research.
Media rich. Multimodal. Thread branching. Color-coded notifications.

**Files:** `components/stream/`, `lib/stream/`, `lib/hooks/`, `app/dashboard/chat/`

**Tasks:**

- Implement thinking process display (ThinkingProcess.tsx exists as scaffold)
- SSE already streams thinking_step/tool_start/tool_end — wire to UI
- Add media previews inline (images, PDFs, code blocks with syntax highlighting)
- Add thread branching (reply to specific messages like WhatsApp)
- Color-code notification types (task=blue, insight=purple, alert=red, system=gray)
- Add slash commands in chat input (parse /command, show autocomplete)
- Auto-stop dictation: 5s silence detection via Web Audio API, auto-send
- Floating call button (fixed position, persists across all pages)
- System can initiate call to user (not just user calling system)
- Metaphors for non-tech: river, dam, house, guard dog visual language

---

## WORKSTREAM C: Value Hierarchy + Onboarding

Replace flat task system with deep hierarchy. User defines their own areas.

```
Values (user-defined)
  > Areas (user chooses)
    > Quests (Objectives)
      > Side Quests = Campaigns
        > Missions (Projects)
          > Challenges (Tasks)
            > Notes (Burza/brainstorm)
```

**Existing Tyrolka tables:** user_loops, user_campaigns, user_quests, user_ops, user_notes

**Tasks:**

- Map Value Hierarchy to existing Tyrolka tables (extend if needed)
- Add "values" and "areas" tables/columns
- Redesign onboarding: "I'm a genie, you just rubbed the lamp"
- Build 3D/tree visualization of entire hierarchy (react-force-graph or three.js)
- Neural network visual motif across entire UI
- Dashboard widget showing hierarchy as interactive mindmap

---

## WORKSTREAM D: System Self-Awareness + Swarm Communication

System must know ALL its components. Self-healing cycle.

**Tasks:**

- Create system manifest (all CRONs, integrations, tools, apps, with health status)
- Extend MAPEK loop to monitor ALL subsystems (not just user tasks)
- Build health dashboard showing real-time status of everything
- Inter-component messaging (swarm protocol — hierarchical + parallel)
- When something breaks: auto-detect, log, attempt fix, notify user
- Built apps must report their own health back to system
- Ralph Loop must use GOTCHA + ATLAS internally

---

## WORKSTREAM E: Real Content + App Generation

Not trackers. Real full-stack apps, documents, marketing materials.

**Requires VPS** (Docker per user). Infrastructure scaffolds exist in `infrastructure/docker/`.

**Tasks:**

- Implement code generation adapters (currently mocks): claude-code.ts, gpt-o1-code.ts
- Skills must be .md files like Claude Code / OpenClaw format
- Content generation: Word docs, presentations, posts, reels, tweets, YouTube scripts
- Image generation: integrate DALL-E or Nano Banana Pro or Kimi (compare costs first)
- Video generation: research cheap + good options
- Marketing automation: multi-channel, mood-aware, influence frameworks
- n8n/Make popular workflows converted to ExoSkull skills
- System should build itself using same skills (self-improving)

---

## WORKSTREAM F: AI Personality + Agent Intelligence

**Tasks:**

- Rewrite system prompt: Mentor + Strategist + Executor persona
- Use Opus 4.5 more (currently underused — check tier routing)
- Find and configure Kimi API keys (user says they provided them)
- Agent debates: spawn team where agents argue for best solution
- One "crazy" agent with lateral/non-linear thinking
- Controlled errors as creativity method in Ralph Loop
- Voice panel: change voice by pasting ElevenLabs voice ID in settings
- Clean up dashboard menu (remove unnecessary items)
- Android widget for calls (minimal — just floating call button)

---

## Which sessions can run in parallel (NO conflicts)

| Session | Workstream | Independent? |
|---------|------------|-------------|
| Current | Tyrolka migration (agents running) | Baseline |
| Chat 2 | A: Fix Integrations | YES — different files |
| Chat 3 | B: Unified Thread upgrade | YES — different files |
| Chat 4 | C+D: Value Hierarchy + Self-Awareness | YES — new tables + MAPEK |
| Chat 5 | E: Content/App Generation | YES — code-gen + VPS |
| Chat 6 | F: AI Personality | YES — system-prompt + settings |
