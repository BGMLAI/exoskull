---
name: generate-document
description: Generate professional documents — Word, PDF, presentations, reports
tools_used:
  - generate_document
  - search_knowledge
  - search_memory
trigger: "user asks to write, create, or generate a document, report, presentation, letter"
cost: "$0.02-0.10 per document (AI generation)"
requires_vps: false
---

# Generate Document Skill

## When to activate

- User says: "napisz raport", "przygotuj prezentację", "stwórz dokument", "napisz list"
- User needs: professional documents, reports, proposals, letters, presentations

## Steps

1. **Clarify requirements:**
   - Document type (docx, pdf, pptx, md, html)
   - Topic and purpose
   - Target audience
   - Tone (formal, casual, academic, business)
   - Required sections (if any)
   - Length expectations

2. **Gather context:**
   - Use `search_knowledge` for relevant user data
   - Use `search_memory` for past preferences and style
   - Check if similar documents were created before

3. **Generate:**
   - Use `generate_document` tool with gathered context
   - Choose appropriate model tier (Opus for premium, Sonnet for standard)

4. **Review and deliver:**
   - Present summary of what was generated
   - Provide download link
   - Ask if adjustments needed

## Quality standards

- Professional formatting
- Consistent tone throughout
- Proper Polish language (unless user specifies otherwise)
- Include table of contents for documents >3 pages
- Include executive summary for reports
