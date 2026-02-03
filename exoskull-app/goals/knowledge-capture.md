# Goal: Knowledge Capture

Zapisywanie i organizacja wiedzy wedlug Tyrolka Framework.

---

## Objective

Uchwycic i zorganizowac wszystko co user wie i robi:
- **Loops** - Obszary zycia (Health, Work, Finance...)
- **Campaigns** - Duze inicjatywy
- **Quests** - Projekty
- **Ops** - Zadania/misje
- **Notes** - Uniwersalne notatki (text, image, audio, video, url...)

---

## Tyrolka Framework

```
LOOPS (Life Areas)
    └── CAMPAIGNS (Major Initiatives)
            └── QUESTS (Projects)
                    └── OPS (Tasks/Missions)
                            └── NOTES (Everything else)
```

### Ja vs Nie-Ja

| Ja (Experience) | Nie-Ja (Research) |
|-----------------|-------------------|
| "Czuję się zmęczony" | "Badania mówią że sen < 7h..." |
| Osobiste obserwacje | Zewnętrzna wiedza |
| Subiektywne | Obiektywne |
| is_experience = true | is_research = true |

---

## Trigger

| Trigger | Opis |
|---------|------|
| Voice | "Zapisz notatkę...", "Dodaj do [quest]..." |
| Dashboard | UI w /dashboard/knowledge |
| Auto-extraction | Z rozmów (AI extraction) |
| Integration | Import z Notion, Readwise, etc. |

---

## Inputs

### Note Creation
```json
{
  "content": "Treść notatki lub URL",
  "type": "text|image|audio|video|url|social|message|document|code",
  "source": "voice|dashboard|import|extraction",
  "parent_id": "uuid (loop/campaign/quest/op)",
  "is_research": false,
  "is_experience": true,
  "tags": ["tag1", "tag2"]
}
```

### Hierarchy Navigation
- Loop ID → show Campaigns
- Campaign ID → show Quests
- Quest ID → show Ops + Notes
- Op ID → show Notes

---

## Tools

(No dedicated tool - uses API directly)

---

## Mods

| Mod | Rola |
|-----|------|
| - | Knowledge capture is core, not mod |

---

## Outputs

### Note Object
```json
{
  "id": "uuid",
  "content": "text",
  "type": "text",
  "embedding": [1536 floats],
  "ai_summary": "AI-generated summary",
  "ai_tags": ["auto", "extracted", "tags"],
  "ai_category": "auto-classified category",
  "is_research": false,
  "is_experience": true,
  "parent_type": "quest",
  "parent_id": "uuid"
}
```

### Tyrolka Context (for Voice)
```json
{
  "ja": {
    "loops": [...],
    "highlights": [...],
    "recent_insights": [...]
  },
  "nie_ja": {
    "research": [...],
    "external_knowledge": [...]
  },
  "objectives": {
    "active_campaigns": [...],
    "active_quests": [...]
  },
  "current_ops": [...]
}
```

---

## Flow: Voice Note Capture

```
1. User: "Zapisz notatkę: spotkanie z Anią przesunięte"
2. Extract:
   - content: "spotkanie z Anią przesunięte"
   - type: text
   - source: voice
3. AI classify:
   - is_research: false (personal)
   - is_experience: true
   - ai_tags: ["meeting", "schedule"]
4. Optionally ask: "Do którego projektu dodać?"
5. Create note via /api/knowledge/notes
6. Generate embedding (for semantic search)
7. Response: "Zapisane."
```

---

## Flow: Auto-Extraction from Conversation

```
1. Voice conversation ends
2. Transcript analyzed by AI (Gemini Flash)
3. Extract:
   - Tasks mentioned → create Ops
   - Insights → create Notes
   - Mood indicators → log to mood-tracker
   - Commitments → create Tasks with deadlines
4. Tag as extracted (source: "extraction")
5. User can review in dashboard
```

---

## Flow: Hierarchy Creation

```
1. User creates Loop: "Health"
2. Creates Campaign: "Lose 10kg" under Health
3. Creates Quest: "Start running" under campaign
4. Creates Ops: "Buy running shoes", "Find route"
5. Adds Notes: research about running, personal observations
```

---

## Search & Retrieval

### Semantic Search
```sql
-- Find similar notes
SELECT * FROM user_notes
WHERE tenant_id = $1
ORDER BY embedding <=> $embedding
LIMIT 10;
```

### Keyword Search
```sql
SELECT * FROM user_notes
WHERE tenant_id = $1
AND content ILIKE '%keyword%';
```

### Tyrolka Context Function
```sql
SELECT * FROM get_tyrolka_context(tenant_id);
-- Returns: Ja/Nie-Ja + Objectives + Active Ops/Quests
```

---

## Database Tables

| Table | Opis |
|-------|------|
| user_loops | Life areas (Health, Work, Finance...) |
| user_campaigns | Major initiatives |
| user_quests | Projects |
| user_ops | Tasks/missions |
| user_notes | Universal notes (all types) |

### Note Types
```
text, image, audio, video, url,
social, message, document, code
```

---

## Edge Cases

| Przypadek | Obsluga |
|-----------|---------|
| No parent specified | Ask or default to "Inbox" loop |
| Duplicate content | Warn, suggest link instead |
| Large file (audio/video) | Store in R2, keep metadata in Postgres |
| External URL | Fetch + summarize + embed |
| Empty note | Reject: "Co chcesz zapisać?" |

---

## AI Processing

For each note:
1. **Generate embedding** - 1536-dim vector for semantic search
2. **Generate summary** - AI summary for quick scan
3. **Extract tags** - Auto-tag based on content
4. **Classify category** - Auto-assign to loop if not specified
5. **Detect Ja/Nie-Ja** - Personal experience vs research

---

## Voice Commands

| Command | Action |
|---------|--------|
| "Zapisz notatkę: [X]" | Create note |
| "Dodaj do [quest]: [X]" | Create note under quest |
| "Nowy projekt: [X]" | Create quest |
| "Pokaż moje notatki" | List recent notes |
| "Szukaj: [X]" | Semantic search |
| "Co wiem o [X]?" | Retrieve knowledge about topic |

---

## Files Reference

| Plik | Rola |
|------|------|
| app/api/knowledge/notes/route.ts | Notes CRUD |
| app/api/knowledge/loops/route.ts | Loops CRUD |
| app/api/knowledge/quests/route.ts | Quests CRUD |
| app/api/knowledge/tyrolka/route.ts | Context endpoint |
| app/dashboard/knowledge/page.tsx | Dashboard UI |
| components/knowledge/*.tsx | UI components |

---

VERSION: 1.0
UPDATED: 2026-02-03
