---
name: lead-generation
description: Automated lead generation — find prospects, enrich data, draft outreach
tools_used:
  - search_web
  - fetch_webpage
  - search_knowledge
  - composio_action
  - send_email
trigger: "user asks to find leads, prospects, or generate business contacts"
cost: "$0.05-0.20 per batch (AI + web search)"
requires_vps: false
---

# Lead Generation Skill

## When to activate

- User says: "znajdź klientów", "lead generation", "prospects", "outreach"
- User needs: new business contacts, sales pipeline

## Steps

1. **Define ICP (Ideal Customer Profile):**
   - Industry
   - Company size
   - Role/title of decision maker
   - Geographic focus
   - Budget range

2. **Research prospects:**
   - Use `search_web` to find companies matching ICP
   - Use `fetch_webpage` for company details
   - Extract: company name, website, contact info, recent news

3. **Enrich data:**
   - Find LinkedIn profiles (search_web)
   - Identify pain points from recent news/blog posts
   - Score prospects by fit (1-10)

4. **Draft outreach:**
   - Personalized message per prospect
   - Reference specific pain points
   - Clear value proposition
   - Soft CTA (not aggressive)

5. **Deliver:**
   - Present prospect list with scores
   - Ready-to-send email drafts
   - Suggest follow-up sequence (day 3, day 7, day 14)

## Quality standards

- Personalization is key — no mass templates
- Research before reach (know the prospect)
- Professional but warm tone
- GDPR compliant (opt-out option)
