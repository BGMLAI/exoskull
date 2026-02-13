---
name: analyze-market
description: Competitive intelligence and market analysis
tools_used:
  - search_web
  - fetch_webpage
  - search_knowledge
  - start_debate
trigger: User needs market research, competitive analysis, or strategic insight
cost: ~$0.10-0.50 per analysis (web search + Opus debate)
---

# Analyze Market Skill

## When to Use

- User asks about competitors, market trends, or business strategy
- User is evaluating a new business idea or product
- User needs competitive intelligence for a pitch/proposal
- User asks "who does X?" or "what's the best way to..."

## Process

1. **Define Scope**
   - What market/industry?
   - What specifically? (competitors, trends, pricing, features)
   - Geographic focus? (Poland, Europe, global)
   - Timeframe? (current state, 1-year forecast, 5-year)

2. **Research**

   ```
   search_web({ query: "[industry] competitors [year]" })
   search_web({ query: "[product type] market trends" })
   fetch_webpage({ url: "[competitor site]" })
   ```

3. **Analyze with Multi-Agent Debate** (for strategic questions)

   ```
   start_debate({
     question: "Should [user] enter the [market] with [product]?",
     context: "[gathered research data]",
     rounds: 2
   })
   ```

4. **Synthesize Report**
   - Market overview (size, growth, key players)
   - Competitive landscape (strengths/weaknesses matrix)
   - Opportunities and threats
   - Recommended strategy
   - Data sources cited

## Output Format

```markdown
# Analiza Rynku: [Temat]

## Rynek

- Wielkosc: [dane]
- Wzrost: [%/rok]
- Kluczowi gracze: [lista]

## Konkurencja

| Firma | Mocne strony | Slabe strony | Cena |
| ----- | ------------ | ------------ | ---- |
| A     | ...          | ...          | ...  |
| B     | ...          | ...          | ...  |

## Szanse

1. [szansa z uzasadnieniem]
2. ...

## Zagrozenia

1. [zagrozenie]
2. ...

## Rekomendacja

[Konkretna strategia z krokami]

## Zrodla

- [url1]
- [url2]
```

## Edge Cases

- No data available → clearly state limitations
- Highly specialized niche → use broader industry data + analogies
- User's own business → be constructive, not discouraging
