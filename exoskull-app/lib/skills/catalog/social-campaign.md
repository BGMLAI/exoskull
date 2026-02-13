---
name: social-campaign
description: Cross-channel social media campaign — consistent content across LinkedIn, X, Instagram, YouTube
tools_used:
  - generate_social_content
  - generate_image
  - search_web
  - search_knowledge
  - composio_action
trigger: "user asks to create social media post, campaign, or content strategy"
cost: "$0.05-0.50 per campaign (AI + image generation)"
requires_vps: false
---

# Social Media Campaign Skill

## When to activate

- User says: "napisz post", "stwórz kampanię", "marketing", "social media"
- User needs: content across multiple platforms

## Steps

1. **Define campaign:**
   - Topic/message
   - Target channels (LinkedIn, X, Instagram, YouTube, Facebook, TikTok)
   - Tone and audience
   - Call-to-action
   - Brand voice (check user preferences)

2. **Research:**
   - Use `search_web` for current trends in user's industry
   - Use `search_knowledge` for brand guidelines and past successful content
   - Check industry_tracker for trend alignment

3. **Generate content:**
   - Use social media engine for multi-channel content
   - Each platform gets UNIQUE content (not copy-paste!)
   - Adapt format: LinkedIn (long-form), X (thread), Instagram (visual caption), YouTube (description + SEO)

4. **Generate visuals:**
   - Use `generate_image` (Flux for bulk, DALL-E 3 for premium)
   - Create platform-appropriate sizes (square for IG, landscape for LinkedIn/YT)

5. **Schedule suggestions:**
   - Optimal posting times per platform
   - Content calendar for the week
   - A/B test variants

6. **Post (if authorized):**
   - Use `composio_action` to post to connected platforms
   - Or provide ready-to-publish content for manual posting

## Quality standards

- Hooks that stop scrolling (first line = gold)
- Consistent brand voice across channels
- Relevant, trending hashtags
- Platform-specific formatting (emojis ok for IG, professional for LinkedIn)
- Minimum effort, maximum engagement (Pareto content)
