# Knowledge Capture Workflow

> Automatyczne wychwytywanie i przechowywanie wiedzy o uzytkowniku.
> ExoSkull pamięta wszystko - ale inteligentnie.

---

## Cel

Budowac "Total Recall" - pelna pamiec o uzytkowniku.
Nie raw data dump, ale strukturyzowana, przeszukiwalna wiedza.

---

## Triggery

| Trigger | Source | Action |
|---------|--------|--------|
| Conversation ends | Voice/chat | Extract highlights |
| User says "zapamietaj" | Explicit command | Store as fact |
| Pattern detected | Analysis | Store as pattern/insight |
| Profile update | Onboarding/settings | Update user profile |
| External data sync | Rigs | Integrate new data |

---

## Narzedzia

| Tool | Path | Usage |
|------|------|-------|
| Highlight Extractor | `lib/agents/specialized/highlight-extractor.ts` | Extract from conversations |
| Highlight Integrator | `lib/learning/highlight-integrator.ts` | Merge into profile |
| Memory/Highlights | `lib/memory/highlights.ts` | Storage and retrieval |
| Pattern Learner | `lib/agents/specialized/pattern-learner.ts` | Detect patterns |
| Bronze ETL | `lib/datalake/bronze-etl.ts` | Raw data storage |
| Silver ETL | `lib/datalake/silver-etl.ts` | Cleaned data |
| Gold ETL | `lib/datalake/gold-etl.ts` | Aggregated insights |

---

## Knowledge Types

### 1. Preferences (Jak uzytkownik lubi)

```
Examples:
- "Woli kawę rano"
- "Nie lubi gdy system jest nachalny"
- "Preferuje krótkie odpowiedzi"
- "Nie chce być budzona przed 8"

Source: Explicit statements, inferred from behavior
Storage: exo_highlights (type: preference)
Usage: Personalization, tone adaptation
```

### 2. Patterns (Co robi regularnie)

```
Examples:
- "Zawsze zmeczony w poniedzialki"
- "Pracuje do pozna w czwartki"
- "Pomija sniadanie gdy sie spieszy"
- "Lepszy nastroj po sporcie"

Source: Data analysis, conversation patterns
Storage: exo_highlights (type: pattern)
Usage: Gap detection, proactive suggestions
```

### 3. Goals (Do czego dazy)

```
Examples:
- "Chce schudnac 5kg"
- "Planuje zmiane pracy"
- "Chce lepiej spac"
- "Chce wiecej czasu z rodzina"

Source: Discovery conversation, explicit statements
Storage: exo_highlights (type: goal) + exo_objectives (MITs)
Usage: Prioritization, intervention design
```

### 4. Insights (Co zauwazylem)

```
Examples:
- "Unika tematu finansów"
- "Reaguje defensywnie na krytykę"
- "Nie docenia swoich osiągnięć"
- "Ma tendencję do overcommitment"

Source: AI analysis, pattern detection
Storage: exo_highlights (type: insight)
Usage: Gap detection, intervention design
```

### 5. Facts (Obiektywne dane)

```
Examples:
- "Ma zona i dwoje dzieci"
- "Pracuje w IT"
- "Ma Oura Ring"
- "Mieszka w Warszawie"

Source: Explicit statements, verified
Storage: exo_highlights (type: fact) + exo_tenants profile
Usage: Context, personalization
```

---

## Highlight Extraction Process

### During Conversation

```
1. Buffer conversation exchanges
2. At conversation end:
   a. Send transcript to Highlight Extractor
   b. Extract: preferences, patterns, goals, insights, facts
   c. Assign confidence scores
   d. Check for contradictions with existing highlights
   e. Store new highlights
   f. Update profile if high-confidence facts
```

### Extraction Prompt

```
Przeanalizuj rozmowę i wyekstrahuj:

1. PREFERENCES - Co użytkownik lubi/nie lubi
2. PATTERNS - Powtarzające się zachowania
3. GOALS - Cele i aspiracje
4. INSIGHTS - Obserwacje o użytkowniku
5. FACTS - Obiektywne informacje

Format:
{
  "highlights": [
    {
      "type": "preference|pattern|goal|insight|fact",
      "content": "Treść",
      "confidence": 0.0-1.0,
      "source_quote": "Dokładny cytat z rozmowy",
      "category": "health|productivity|relationships|finance|general"
    }
  ],
  "profile_updates": {
    "field": "value"  // Tylko wysokie confidence facts
  }
}
```

---

## Data Flow

### Bronze Layer (Raw)

```
All data as-is:
- Full conversation transcripts
- Raw device data (Oura, Fitbit)
- API responses
- Timestamps, metadata

Path: r2://exoskull/{tenant_id}/bronze/
Format: Parquet (columnar, compressed)
Retention: Forever
```

### Silver Layer (Cleaned)

```
Cleaned and structured:
- Deduplicated highlights
- Validated facts
- Normalized timestamps
- Enriched with context

Storage: Supabase (exo_highlights)
Update: Hourly ETL
```

### Gold Layer (Aggregated)

```
Insights and summaries:
- Daily/weekly/monthly summaries
- Pattern aggregations
- Trend analysis
- User health scores

Storage: Supabase materialized views
Update: Daily at 02:00 UTC
```

---

## Explicit Knowledge Capture

### "Zapamietaj" Command

```
User: "Zapamietaj ze nie lubie gdy dzwonisz przed 9"

Action:
1. Parse: type=preference, content="nie dzwonic przed 9"
2. Store with confidence=1.0 (explicit)
3. Update schedule constraints
4. Confirm: "Zapamietane. Nie bede dzwonil przed 9."
```

### Correction Handling

```
User: "Nie, to nie tak. Mam syna, nie corke."

Action:
1. Find contradicting fact
2. Mark old as superseded
3. Store new with source="user_correction"
4. Confirm: "Poprawione. Zapamietam ze masz syna."
```

---

## Retrieval

### For Conversation Context

```typescript
// Load highlights for system prompt
const highlights = await getHighlights(tenantId, {
  types: ['preference', 'pattern', 'goal'],
  limit: 20,
  minConfidence: 0.6
})

// Format for prompt
const highlightSummary = {
  preferences: highlights.filter(h => h.type === 'preference').map(h => h.content),
  patterns: highlights.filter(h => h.type === 'pattern').map(h => h.content),
  goals: highlights.filter(h => h.type === 'goal').map(h => h.content)
}
```

### For Gap Detection

```typescript
// Search for specific domain
const healthHighlights = await searchHighlights(tenantId, {
  category: 'health',
  query: 'sleep'
})

// Check what's missing
const domains = await getHighlightCategories(tenantId)
const missingDomains = ALL_DOMAINS.filter(d => !domains.includes(d))
```

---

## Edge Cases

### Contradictory Information

```
Existing: "Ma partnera"
New: "Mieszkam sam"

Resolution:
1. Check recency (newer wins)
2. Check confidence
3. If unclear, flag for clarification
4. Store both with relationship: "contradicts"
```

### Sensitive Information

```
If detected: medical, financial, relationship sensitive data

Action:
1. Store with privacy_level: 'sensitive'
2. Encrypt at rest
3. Require explicit consent for sharing
4. Allow user to delete
```

### Low Confidence Extraction

```
If confidence < 0.5:
1. Store but don't use in prompts
2. Flag for validation
3. Confirm if comes up again naturally
```

---

## Guardrails

**NEVER:**
- Store without consent (implied by using system)
- Share between tenants
- Use sensitive data without purpose
- Assume facts without source

**ALWAYS:**
- Track source of every highlight
- Allow user to view/delete their data
- Encrypt sensitive data
- Maintain audit trail

---

## Metrics

| Metric | Track |
|--------|-------|
| Highlights per conversation | Extraction effectiveness |
| Confidence distribution | Quality of extraction |
| Category coverage | Gaps in knowledge |
| Contradiction rate | Data quality |
| User corrections | Extraction accuracy |

---

## User Data Rights

### View

```
User: "Co o mnie wiesz?"

Response: Summary of stored highlights by category
Option: Full export (JSON/PDF)
```

### Delete

```
User: "Zapomnij ze mialem dziewczyne"

Action:
1. Find related highlights
2. Mark as deleted (soft delete)
3. Confirm: "Zapomniałem."
```

### Export

```
User: "Daj mi wszystkie moje dane"

Action:
1. Generate GDPR-compliant export
2. Include: Bronze, Silver, Gold data
3. Provide secure download link
```

---

## Related

- `goals/gap-detection.md` - Using knowledge for gap detection
- `hardprompts/gap-detection.md` - Analysis prompts
- `lib/memory/highlights.ts` - Storage implementation
- `lib/learning/highlight-integrator.ts` - Integration logic
- `lib/datalake/` - ETL pipelines
