---
name: write-document
description: Generate professional documents (reports, proposals, letters)
tools_used:
  - search_knowledge
  - search_memory
  - search_web
trigger: User needs a document written, drafted, or formatted
cost: ~$0.03-0.10 per document (Sonnet 4.5)
requires_vps: false
---

# Write Document Skill

## When to Use

- User asks to write/draft/create a document
- User needs a report, proposal, letter, or memo
- User provides notes and wants them organized into a document

## Process

1. **Gather Context**
   - What type of document? (report, letter, proposal, memo, article)
   - Who is the audience?
   - What tone? (formal, casual, academic, business)
   - Any specific requirements? (length, format, sections)
   - Search knowledge base for relevant context: `search_knowledge`
   - Search memory for user preferences on writing style

2. **Create Outline**
   - Structure based on document type
   - Report: Executive Summary → Background → Analysis → Recommendations
   - Letter: Header → Greeting → Body → Closing
   - Proposal: Problem → Solution → Timeline → Budget → Next Steps
   - Article: Hook → Context → Main Points → Conclusion

3. **Write the Document**
   - Use markdown formatting
   - Polish language by default (unless specified)
   - Include data from knowledge base where relevant
   - Keep professional but not stiff

4. **Present to User**
   - Show the full document in chat (markdown rendered)
   - Offer to adjust: "Chcesz cos zmienic? Ton, dlugosc, struktura?"
   - Offer to save to knowledge base: `import_url` (if needed)

## Document Templates

### Business Proposal

```markdown
# [Tytul Propozycji]

## Streszczenie

[2-3 zdania — co proponujesz i dlaczego]

## Problem

[Co nie dziala / co mozna ulepszyc]

## Proponowane Rozwiazanie

[Szczegoly rozwiazania]

## Harmonogram

| Faza | Opis | Termin |
| ---- | ---- | ------ |
| 1    | ...  | ...    |

## Budzet

[Szacowane koszty]

## Nastepne Kroki

1. ...
2. ...
```

### Professional Email

```markdown
Temat: [jasny, konkretny temat]

Szanowny/a [imie],

[1 zdanie kontekstu]

[2-3 zdania glowna tresc]

[1 zdanie call to action]

Z powazaniem,
[imie usera]
```

## Edge Cases

- Very long documents (>5000 words) → break into sections, generate iteratively
- Technical documents → use search_web for current data/standards
- Legal/medical content → add disclaimer "To nie jest porada prawna/medyczna"
