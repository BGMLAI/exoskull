---
name: post-social
description: Create and schedule multi-channel social media posts
tools_used:
  - search_web
  - search_knowledge
  - composio_action
trigger: User wants to post on social media or create content for channels
cost: ~$0.02-0.05 per post (Sonnet 4.5)
---

# Post Social Skill

## When to Use

- User asks to post on social media
- User asks to create social content (LinkedIn, Twitter/X, Instagram, Facebook)
- Marketing campaign requires multi-channel posts
- User has a blog post or idea to share

## Process

1. **Determine Channels**
   - Ask or infer which platforms: LinkedIn, Twitter/X, Instagram, Facebook
   - Check user's connected integrations (composio_list_apps)

2. **Research (if needed)**
   - search_web for trending topics, hashtags, best practices
   - search_knowledge for user's brand voice, past posts

3. **Create Content Per Channel**
   - Twitter/X: 280 chars, punchy, hashtags (max 3)
   - LinkedIn: Professional, 1-3 paragraphs, storytelling
   - Instagram: Visual-first, caption with hashtags (15-30)
   - Facebook: Casual, engaging, question or CTA

4. **Apply Influence Frameworks** (choose one)
   - AIDA: Attention → Interest → Desire → Action
   - PAS: Problem → Agitation → Solution
   - StoryBrand: Hero (audience) → Problem → Guide (you) → Plan → Call to Action

5. **Present Draft**
   - Show all channel versions side by side
   - Suggest posting times (based on platform best practices)
   - Offer to adjust tone, length, hashtags

6. **Post via Composio** (if connected)
   ```
   composio_action({
     action: "LINKEDIN_CREATE_POST",
     params: { content: "..." }
   })
   ```

## Tone Adaptation

- Match user's mood from emotion engine
- Professional → LinkedIn voice
- Casual → Twitter/Instagram
- Excited → use energy, exclamation (sparingly)
- Reflective → deeper insights, questions

## Edge Cases

- No social accounts connected → guide through composio_connect
- User wants to schedule → note for future (no native scheduler yet)
- Controversial topics → add disclaimer, tone down
