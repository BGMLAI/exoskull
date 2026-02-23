/**
 * Seed 30 BGML Reasoning Frameworks → bgml_frameworks
 *
 * Full framework library covering all 6 BGML domains:
 *   business (8), engineering (5), personal (5), creative (4),
 *   science (3), general (5)
 *
 * Every ExoSkull agent has access to these frameworks via the BGML pipeline.
 * Framework selection: classifier detects domain → selector picks best framework.
 *
 * Usage: npx tsx scripts/seed-frameworks.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { getSupabase, batchUpsert } from "./seed-helpers";

const FRAMEWORKS = [
  // ============================================================================
  // BUSINESS (8 frameworks)
  // ============================================================================
  {
    name: "Porter's Five Forces",
    slug: "porters-five-forces",
    domain: "business",
    description:
      "Analyze competitive forces: threat of new entrants, bargaining power of suppliers, bargaining power of buyers, threat of substitutes, competitive rivalry.",
    prompt_template: `Analyze this using Porter's Five Forces framework:

1. **Threat of New Entrants** — How easy is it for new competitors to enter? What are the barriers?
2. **Bargaining Power of Suppliers** — How much leverage do suppliers have? Are there alternatives?
3. **Bargaining Power of Buyers** — How much leverage do customers have? How price-sensitive are they?
4. **Threat of Substitutes** — What alternatives exist? How easy is it to switch?
5. **Competitive Rivalry** — How intense is competition? How many competitors? What differentiates them?

Synthesize the five forces into actionable strategic recommendations.`,
    example_questions: [
      "Analyze the competitive landscape for our SaaS product",
      "Should we enter the electric vehicle market?",
    ],
    quality_score: 0.85,
  },
  {
    name: "SWOT Analysis",
    slug: "swot-analysis",
    domain: "business",
    description:
      "Evaluate Strengths, Weaknesses, Opportunities, and Threats for strategic planning.",
    prompt_template: `Perform a comprehensive SWOT Analysis:

**Strengths (Internal, Positive)**
- What do we do well? What unique resources do we have?

**Weaknesses (Internal, Negative)**
- What could we improve? Where do we lack resources?

**Opportunities (External, Positive)**
- What trends can we exploit? What gaps exist in the market?

**Threats (External, Negative)**
- What obstacles do we face? What are competitors doing?

Cross-reference: How can strengths exploit opportunities? How can we address weaknesses before threats materialize?`,
    example_questions: [
      "SWOT analysis of our startup before Series A",
      "Evaluate our product positioning",
    ],
    quality_score: 0.82,
  },
  {
    name: "Blue Ocean Strategy",
    slug: "blue-ocean-strategy",
    domain: "business",
    description:
      "Create uncontested market space by making competition irrelevant. Focus on value innovation — simultaneously pursuing differentiation AND low cost.",
    prompt_template: `Apply Blue Ocean Strategy analysis:

1. **Current Red Ocean** — What does competition look like now? What factors does the industry compete on?
2. **Eliminate** — Which factors that the industry takes for granted should be eliminated?
3. **Reduce** — Which factors should be reduced well below the industry standard?
4. **Raise** — Which factors should be raised well above the industry standard?
5. **Create** — Which factors should be created that the industry has never offered?
6. **Strategy Canvas** — Plot the value curve: your offering vs. competitors on key factors.
7. **New Value Proposition** — What untapped demand can you unlock? Who are the non-customers?

Goal: Find blue ocean space where you compete with NO ONE.`,
    example_questions: [
      "How can we differentiate our product from 20 competitors?",
      "What uncontested market space exists for our service?",
    ],
    quality_score: 0.88,
  },
  {
    name: "Jobs-to-be-Done (JTBD)",
    slug: "jobs-to-be-done",
    domain: "business",
    description:
      "Understand what 'job' customers are hiring your product to do. Focus on desired outcomes, not features or demographics.",
    prompt_template: `Apply the Jobs-to-be-Done framework:

1. **Job Statement** — What is the customer trying to accomplish? ("When I ___, I want to ___, so I can ___.")
2. **Functional Job** — What task needs to get done? (practical, measurable)
3. **Emotional Job** — How does the customer want to feel? (confidence, control, relief)
4. **Social Job** — How does the customer want to be perceived? (competent, innovative, responsible)
5. **Current Solutions** — How is the customer solving this job today? What's the "hiring" and "firing" criteria?
6. **Unmet Needs** — Where are current solutions failing? What pain points persist?
7. **Outcome Statements** — Define desired outcomes: "Minimize the time it takes to ___" / "Minimize the likelihood of ___"

Synthesize into a product/feature recommendation that nails the core job.`,
    example_questions: [
      "What job is our customer hiring our product to do?",
      "Why do customers switch from competitor to us (or vice versa)?",
    ],
    quality_score: 0.89,
  },
  {
    name: "Lean Canvas",
    slug: "lean-canvas",
    domain: "business",
    description:
      "One-page business model for startups. Rapid validation of problem-solution fit before building.",
    prompt_template: `Fill out a Lean Canvas for this business idea:

| Section | Analysis |
|---------|----------|
| **Problem** | Top 3 problems. What's the #1 pain? |
| **Customer Segments** | Who has this problem? Early adopters? |
| **Unique Value Proposition** | Single clear message: why you're different AND worth attention |
| **Solution** | Top 3 features addressing the top 3 problems |
| **Channels** | How do you reach customers? (inbound, outbound, viral, paid) |
| **Revenue Streams** | How do you make money? Pricing model? |
| **Cost Structure** | Fixed costs, variable costs, CAC, burn rate |
| **Key Metrics** | What 1-3 numbers matter most right now? (activation, retention, revenue) |
| **Unfair Advantage** | What can't be easily copied? (network effects, data, brand, community) |

Highlight the riskiest assumption and how to test it in <1 week.`,
    example_questions: [
      "Validate my startup idea for an AI personal finance app",
      "Create a lean canvas for a B2B SaaS in healthcare",
    ],
    quality_score: 0.87,
  },
  {
    name: "Business Model Canvas",
    slug: "business-model-canvas",
    domain: "business",
    description:
      "Full Osterwalder Business Model Canvas for established businesses or later-stage startups.",
    prompt_template: `Build a Business Model Canvas:

1. **Key Partners** — Who are critical allies, suppliers, and partners?
2. **Key Activities** — What must you DO to deliver the value proposition?
3. **Key Resources** — What assets are essential? (IP, talent, infrastructure, capital)
4. **Value Propositions** — What value do you deliver? What problems do you solve?
5. **Customer Relationships** — How do you interact? (self-service, personal, community, co-creation)
6. **Channels** — How do you reach, sell to, and service customers?
7. **Customer Segments** — Who are your most important customers?
8. **Cost Structure** — What are the biggest costs? Fixed vs. variable?
9. **Revenue Streams** — How does each segment pay? What are they willing to pay?

Identify the weakest link in the model and recommend how to strengthen it.`,
    example_questions: [
      "Map our business model to identify gaps",
      "How should we restructure our business model for international expansion?",
    ],
    quality_score: 0.83,
  },
  {
    name: "OKR Framework",
    slug: "okr-framework",
    domain: "business",
    description:
      "Objectives and Key Results — goal-setting system for aligning teams and measuring progress.",
    prompt_template: `Define OKRs using the Objectives & Key Results framework:

**Objective:** [Qualitative, inspiring, ambitious goal]
What do we want to achieve? (Should be motivating, time-bound, achievable in 1 quarter)

**Key Results:** (3-5 measurable outcomes)
- KR1: [Metric] from [current] to [target] by [date]
- KR2: [Metric] from [current] to [target] by [date]
- KR3: [Metric] from [current] to [target] by [date]

**Validation checklist:**
- Is the Objective ambitious but achievable (70% confidence)?
- Are Key Results measurable (number, not activity)?
- Can progress be tracked weekly?
- Does each KR independently contribute to the Objective?

**Initiatives:** What 2-3 actions will move these Key Results?`,
    example_questions: [
      "Set Q2 OKRs for our product team",
      "How should I set personal quarterly goals?",
    ],
    quality_score: 0.84,
  },
  {
    name: "Value Chain Analysis",
    slug: "value-chain-analysis",
    domain: "business",
    description:
      "Michael Porter's value chain — identify where value is created and where costs can be reduced across primary and support activities.",
    prompt_template: `Perform a Value Chain Analysis:

**Primary Activities:**
1. **Inbound Logistics** — How do inputs arrive? Where are inefficiencies?
2. **Operations** — How is the product/service created? What's the bottleneck?
3. **Outbound Logistics** — How does the product reach the customer?
4. **Marketing & Sales** — How do customers discover and buy?
5. **Service** — How is post-purchase support delivered?

**Support Activities:**
6. **Firm Infrastructure** — Management, planning, finance, legal
7. **Human Resource Management** — Hiring, training, retention
8. **Technology Development** — R&D, automation, systems
9. **Procurement** — Sourcing, supplier relationships

For each activity: where is margin created? Where is margin destroyed? What can be optimized?`,
    example_questions: [
      "Where are we losing margin in our operations?",
      "Which part of our value chain should we outsource?",
    ],
    quality_score: 0.81,
  },

  // ============================================================================
  // ENGINEERING (5 frameworks)
  // ============================================================================
  {
    name: "5 Whys",
    slug: "five-whys",
    domain: "engineering",
    description:
      "Root cause analysis by iteratively asking 'why' to drill past symptoms to the underlying cause.",
    prompt_template: `Apply the 5 Whys technique for root cause analysis:

Start with the problem statement, then ask "Why?" at least 5 times:

1. **Why** did this happen? → [First-level cause]
2. **Why** did that happen? → [Second-level cause]
3. **Why** did that happen? → [Third-level cause]
4. **Why** did that happen? → [Fourth-level cause]
5. **Why** did that happen? → [Root cause]

For each level, provide evidence. At the root cause, recommend corrective actions that prevent recurrence.`,
    example_questions: [
      "Why did our deployment fail?",
      "Why are customers churning?",
    ],
    quality_score: 0.88,
  },
  {
    name: "C4 Model",
    slug: "c4-model",
    domain: "engineering",
    description:
      "Visualize software architecture at 4 levels of zoom: Context, Container, Component, Code.",
    prompt_template: `Apply the C4 Model for architecture analysis:

**Level 1: System Context**
- What system are we analyzing? Who are the users? What external systems does it interact with?
- Draw the boundary: what's inside vs. outside the system?

**Level 2: Containers**
- What are the high-level technical building blocks? (web app, API, database, message queue, file storage)
- How do containers communicate? (REST, gRPC, events, shared DB)
- What technology does each container use?

**Level 3: Components**
- For the most critical container: what are the internal components/modules?
- What are their responsibilities? How do they interact?

**Level 4: Code (if needed)**
- For the most critical component: what are the key classes/functions?
- What patterns are used? (Repository, Service, Factory, etc.)

Identify architectural risks, single points of failure, and scaling bottlenecks.`,
    example_questions: [
      "Design the architecture for our new microservice",
      "Document our system architecture for the team",
    ],
    quality_score: 0.86,
  },
  {
    name: "DORA Metrics",
    slug: "dora-metrics",
    domain: "engineering",
    description:
      "DevOps Research & Assessment — 4 key metrics for software delivery performance: deployment frequency, lead time, change failure rate, time to restore.",
    prompt_template: `Evaluate using DORA Metrics:

1. **Deployment Frequency** — How often do you deploy to production?
   - Elite: on-demand (multiple times/day) | Low: <once/month
   - Current state? Target? Blockers?

2. **Lead Time for Changes** — From commit to production?
   - Elite: <1 hour | Low: >6 months
   - Where is time spent? (code review, testing, approval, deploy)

3. **Change Failure Rate** — % of deployments causing incidents?
   - Elite: 0-15% | Low: 46-60%
   - What types of failures? (config, code, dependency, infra)

4. **Time to Restore Service** — From incident to recovery?
   - Elite: <1 hour | Low: >6 months
   - Do you have runbooks? Automated rollback? On-call?

**Overall Assessment:** Elite / High / Medium / Low performer?
**Top 3 improvements** to move up one level, ranked by effort/impact.`,
    example_questions: [
      "Assess our engineering team's delivery performance",
      "How can we improve our deployment pipeline?",
    ],
    quality_score: 0.85,
  },
  {
    name: "Failure Mode & Effects Analysis (FMEA)",
    slug: "fmea",
    domain: "engineering",
    description:
      "Systematic risk assessment — identify potential failure modes, assess severity/probability/detection, prioritize mitigation.",
    prompt_template: `Perform FMEA (Failure Mode & Effects Analysis):

For each potential failure mode, score 1-10:

| Failure Mode | Effect | Severity (1-10) | Probability (1-10) | Detection (1-10) | RPN |
|-------------|--------|-----------------|--------------------|--------------------|-----|
| [What can go wrong?] | [What happens if it fails?] | [How bad?] | [How likely?] | [How hard to detect before impact?] | S×P×D |

**Severity:** 1=negligible, 5=moderate, 10=catastrophic
**Probability:** 1=almost impossible, 5=occasional, 10=certain
**Detection:** 1=always detected, 5=sometimes, 10=undetectable

**Risk Priority Number (RPN)** = Severity × Probability × Detection
- RPN > 200: Critical — immediate action required
- RPN 100-200: High — plan mitigation
- RPN < 100: Acceptable — monitor

For each critical/high RPN: recommend specific mitigation actions.`,
    example_questions: [
      "What could go wrong with our payment processing system?",
      "Risk assessment for our database migration plan",
    ],
    quality_score: 0.87,
  },
  {
    name: "Architecture Decision Record (ADR)",
    slug: "adr",
    domain: "engineering",
    description:
      "Document architecture decisions with context, options, consequences. Standard format for engineering decision-making.",
    prompt_template: `Write an Architecture Decision Record:

# ADR-XXX: [Decision Title]

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** [today]
**Decision makers:** [who]

## Context
What is the issue or situation that motivates this decision? What forces are at play? (technical, business, team)

## Decision
What is the change we're proposing/making?

## Options Considered
| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| A: [option] | ... | ... | ... |
| B: [option] | ... | ... | ... |
| C: [option] | ... | ... | ... |

## Consequences
- **Positive:** What becomes easier?
- **Negative:** What becomes harder? What do we give up?
- **Risks:** What could go wrong?

## Follow-up Actions
- [ ] Action 1
- [ ] Action 2`,
    example_questions: [
      "Should we use PostgreSQL or MongoDB for our new service?",
      "Evaluate monolith vs microservices for our growth stage",
    ],
    quality_score: 0.86,
  },

  // ============================================================================
  // PERSONAL (5 frameworks)
  // ============================================================================
  {
    name: "CBT (Cognitive Behavioral Therapy)",
    slug: "cbt-framework",
    domain: "personal",
    description:
      "Identify and challenge negative thought patterns. Separate thoughts from facts. Reframe distortions.",
    prompt_template: `Apply CBT (Cognitive Behavioral) analysis:

1. **Situation** — What happened? (Objective facts only, no interpretation)
2. **Automatic Thought** — What was your first thought? What did you tell yourself?
3. **Emotion** — What did you feel? (Name the emotion, rate intensity 0-100)
4. **Cognitive Distortion** — Which thinking trap applies?
   - All-or-nothing | Catastrophizing | Mind reading | Fortune telling
   - Overgeneralization | Mental filter | Disqualifying positives
   - Should statements | Labeling | Personalization | Emotional reasoning
5. **Evidence FOR the thought** — What supports this thought?
6. **Evidence AGAINST the thought** — What contradicts it?
7. **Balanced Thought** — What's a more realistic, balanced perspective?
8. **Emotion After Reframe** — How do you feel now? (rate 0-100)

The goal is NOT positive thinking — it's ACCURATE thinking.`,
    example_questions: [
      "I feel like I'm failing at everything",
      "I'm anxious about the presentation tomorrow",
    ],
    quality_score: 0.91,
  },
  {
    name: "IFS (Internal Family Systems)",
    slug: "ifs-framework",
    domain: "personal",
    description:
      "Explore inner conflicts by identifying and dialoguing with internal 'parts' — protectors, exiles, and the Self.",
    prompt_template: `Apply Internal Family Systems (IFS) exploration:

1. **Identify the Part** — What part of you is activated right now?
   - What does it feel like in your body? (tension, tightness, heat)
   - What is it saying? What does it want?

2. **Classify the Part:**
   - **Manager** (proactive protector) — controls, plans, criticizes, perfects
   - **Firefighter** (reactive protector) — numbs, distracts, avoids, binge
   - **Exile** (wounded part) — holds pain, shame, fear, grief from the past

3. **Unblend** — Can you notice this part without BEING this part?
   - "I notice a part of me that feels ___" (vs. "I AM ___")

4. **Ask the Part:**
   - What is its job? What is it protecting you from?
   - How old is it? When did it take on this role?
   - What does it fear would happen if it stopped?

5. **What does it need?** — What would help this part relax?

Self-energy qualities: Calm, Curiosity, Compassion, Clarity, Confidence, Courage, Creativity, Connectedness.`,
    example_questions: [
      "I have conflicting feelings about a big life decision",
      "Part of me wants to change but something holds me back",
    ],
    quality_score: 0.89,
  },
  {
    name: "Motivational Interviewing",
    slug: "motivational-interviewing",
    domain: "personal",
    description:
      "Explore and resolve ambivalence about change. Elicit the person's own motivation rather than imposing solutions.",
    prompt_template: `Apply Motivational Interviewing principles:

**OARS technique:**
- **Open questions** — "What would change look like for you?"
- **Affirmations** — Recognize strengths and past successes
- **Reflections** — Mirror back what you hear (simple and complex)
- **Summaries** — Collect and link what's been shared

**Explore ambivalence:**
1. **Sustain talk** — What are the reasons to stay the same?
2. **Change talk** — What are the reasons to change?
   - Desire: "I want to..."
   - Ability: "I could..."
   - Reasons: "Because..."
   - Need: "I need to..."
   - Commitment: "I will..."

**Readiness ruler:** On a scale of 1-10, how ready are you to make this change?
- Follow-up: "Why [X] and not lower?" (elicits change talk)

**Decision balance:** What do you gain/lose from changing vs. not changing?

Never argue FOR change. Elicit the person's own reasons.`,
    example_questions: [
      "I know I should exercise but I can't seem to start",
      "I'm thinking about quitting my job but I'm scared",
    ],
    quality_score: 0.88,
  },
  {
    name: "Eisenhower Matrix",
    slug: "eisenhower-matrix",
    domain: "personal",
    description:
      "Prioritize tasks by urgency and importance. Stop confusing busy with productive.",
    prompt_template: `Apply the Eisenhower Matrix:

Classify each item into one of four quadrants:

| | **Urgent** | **Not Urgent** |
|---|---|---|
| **Important** | **Q1: DO FIRST** — Crises, deadlines, emergencies | **Q2: SCHEDULE** — Strategy, relationships, health, learning |
| **Not Important** | **Q3: DELEGATE** — Interruptions, most emails, some meetings | **Q4: ELIMINATE** — Time wasters, busywork, distractions |

**Analysis:**
- How much time do you spend in each quadrant?
- Q2 is where growth happens — most people under-invest here
- Q3 feels urgent but isn't important — the trap of "busy"
- Q4 is pure waste — identify and eliminate

**Action plan:** Move 2 items from Q1 → Q2 (by preventing instead of firefighting). Eliminate or delegate 3 items from Q3/Q4.`,
    example_questions: [
      "I have 20 things on my plate and don't know where to start",
      "Help me prioritize this week's tasks",
    ],
    quality_score: 0.86,
  },
  {
    name: "Ikigai",
    slug: "ikigai",
    domain: "personal",
    description:
      "Find purpose at the intersection of what you love, what you're good at, what the world needs, and what you can be paid for.",
    prompt_template: `Explore your Ikigai (reason for being):

Draw from four circles:

1. **What you LOVE** (passion)
   - What activities make you lose track of time?
   - What would you do even if no one paid you?

2. **What you're GOOD AT** (profession)
   - What skills do others praise you for?
   - What comes naturally to you that's hard for others?

3. **What the WORLD NEEDS** (mission)
   - What problems do you see that frustrate you?
   - What change do you want to create?

4. **What you can be PAID FOR** (vocation)
   - What will people/companies pay money for?
   - What market demand matches your skills?

**Intersections:**
- Love + Good at = **Passion** (but might not pay)
- Good at + Paid for = **Profession** (but might feel empty)
- Paid for + World needs = **Vocation** (but might burn out)
- World needs + Love = **Mission** (but might not sustain)
- **All four = IKIGAI** — your sweet spot

What's your closest Ikigai? What's missing?`,
    example_questions: [
      "I feel stuck in my career — what should I do with my life?",
      "Help me find work that's meaningful and pays well",
    ],
    quality_score: 0.85,
  },

  // ============================================================================
  // CREATIVE (4 frameworks)
  // ============================================================================
  {
    name: "StoryBrand (SB7)",
    slug: "storybrand",
    domain: "creative",
    description:
      "Donald Miller's 7-part framework for clear messaging. The customer is the hero, your brand is the guide.",
    prompt_template: `Apply the StoryBrand SB7 Framework:

1. **Character** — Who is the hero? (Your customer, NOT your brand)
   - What do they want? (External desire)

2. **Problem** — What's in their way?
   - External problem (practical)
   - Internal problem (frustration/feeling)
   - Philosophical problem ("It's just not right that...")
   - Villain (root cause personified)

3. **Guide** — You (the brand) as the guide
   - Express empathy: "We understand..."
   - Demonstrate authority: credentials, results, experience

4. **Plan** — Give them a simple plan (3 steps max)
   - Step 1: ___
   - Step 2: ___
   - Step 3: ___

5. **Call to Action**
   - Direct CTA: "Buy now" / "Schedule a call"
   - Transitional CTA: "Download the guide" / "Watch the demo"

6. **Failure** — What happens if they DON'T act? (Stakes)

7. **Success** — What does life look like AFTER? (Transformation)

Write a one-liner: [Character] has a [problem]. [Brand] provides a [plan]. [CTA] so they can [success] and avoid [failure].`,
    example_questions: [
      "Write messaging for our new product launch page",
      "Our marketing isn't converting — help us clarify the message",
    ],
    quality_score: 0.9,
  },
  {
    name: "AIDA (Attention, Interest, Desire, Action)",
    slug: "aida",
    domain: "creative",
    description:
      "Classic copywriting/marketing funnel framework: grab attention, build interest, create desire, drive action.",
    prompt_template: `Apply the AIDA framework:

**A — Attention (Hook)**
- What stops the scroll? What's the pattern interrupt?
- Use: shocking stat, bold claim, provocative question, relatable pain
- First 3 seconds matter. Lead with the most compelling element.

**I — Interest (Engage)**
- Why should they care? What's in it for THEM?
- Use: story, data, social proof, "here's what most people get wrong..."
- Bridge from their problem to your solution.

**D — Desire (Want)**
- Make them FEEL the transformation.
- Use: benefits (not features), before/after, testimonials, scarcity
- "Imagine if..." / "What would it mean for you if..."

**A — Action (CTA)**
- What's the ONE thing you want them to do?
- Remove friction: clear, specific, low-risk first step
- Urgency: "Limited time" / "Only X spots" / "Start free today"

Write the full copy following this AIDA structure.`,
    example_questions: [
      "Write an ad for our new course on productivity",
      "Create a landing page copy that converts",
    ],
    quality_score: 0.87,
  },
  {
    name: "Design Thinking (IDEO)",
    slug: "design-thinking",
    domain: "creative",
    description:
      "Human-centered problem solving: Empathize → Define → Ideate → Prototype → Test.",
    prompt_template: `Apply Design Thinking:

1. **Empathize** — Understand the user deeply
   - Who are they? What do they do, think, feel?
   - What's their environment? What tools do they use?
   - Observe: what do they DO (vs. what they SAY)?
   - Pain points and unmet needs?

2. **Define** — Frame the problem as a "How Might We" statement
   - "How might we [verb] [user] so that [outcome]?"
   - Be specific enough to act on, broad enough for creative solutions.

3. **Ideate** — Generate solutions (quantity over quality)
   - Brainstorm: no judgment, build on ideas, go wild
   - Aim for 10+ ideas before evaluating any.
   - Star the 3 most promising.

4. **Prototype** — Build the cheapest, fastest version to test
   - What's the minimum needed to test the core assumption?
   - Paper prototype, mockup, landing page, concierge MVP?

5. **Test** — Put it in front of real users
   - What did you learn? What surprised you?
   - Iterate: back to any step as needed.

What's the riskiest assumption? Test THAT first.`,
    example_questions: [
      "Design a better onboarding experience for our app",
      "We have a user retention problem — how do we solve it?",
    ],
    quality_score: 0.88,
  },
  {
    name: "Hero's Journey",
    slug: "heros-journey",
    domain: "creative",
    description:
      "Joseph Campbell's narrative structure for storytelling. 12 stages of transformation, applicable to brand narratives, content, and personal stories.",
    prompt_template: `Apply the Hero's Journey narrative structure:

**Act I: Departure**
1. **Ordinary World** — Where does the hero start? What's their normal?
2. **Call to Adventure** — What disrupts the normal? What opportunity/challenge appears?
3. **Refusal of the Call** — Why do they hesitate? What fears hold them back?
4. **Meeting the Mentor** — Who/what gives them guidance or tools?
5. **Crossing the Threshold** — The point of no return. They commit.

**Act II: Initiation**
6. **Tests, Allies, Enemies** — What challenges do they face? Who helps/hinders?
7. **Approach to the Inmost Cave** — The biggest challenge looms.
8. **Ordeal** — The darkest moment. Near-death/failure experience.
9. **Reward** — What do they gain from surviving the ordeal?

**Act III: Return**
10. **The Road Back** — Journey home isn't easy. Consequences of the reward.
11. **Resurrection** — Final test. The hero is transformed.
12. **Return with the Elixir** — They bring back something valuable. The world is changed.

Apply this structure to the story you're building.`,
    example_questions: [
      "Structure my brand story as a hero's journey",
      "I want to write a compelling founder narrative",
    ],
    quality_score: 0.83,
  },

  // ============================================================================
  // SCIENCE (3 frameworks)
  // ============================================================================
  {
    name: "Scientific Method",
    slug: "scientific-method",
    domain: "science",
    description:
      "Systematic observation, hypothesis formation, experimentation, and conclusion.",
    prompt_template: `Apply the Scientific Method:

1. **Observation** — What do we observe? What data do we have?
2. **Question** — What specific question does this raise?
3. **Hypothesis** — What is our testable prediction? What outcome would confirm/deny it?
4. **Experiment Design** — How can we test this? What variables do we control?
5. **Analysis** — What do the results show? Do they support the hypothesis?
6. **Conclusion** — What can we conclude? What further questions arise?

Focus on falsifiability — what would prove the hypothesis wrong?`,
    example_questions: [
      "Will changing our onboarding reduce churn?",
      "Is caching the bottleneck in our API?",
    ],
    quality_score: 0.87,
  },
  {
    name: "Bayesian Reasoning",
    slug: "bayesian-reasoning",
    domain: "science",
    description:
      "Update beliefs based on evidence. Start with a prior probability, incorporate new evidence, arrive at a posterior.",
    prompt_template: `Apply Bayesian Reasoning:

1. **Prior Belief** — Before seeing evidence, what's your best estimate of the probability?
   - P(H) = [probability that the hypothesis is true]
   - Base rate: how common is this in general?

2. **New Evidence** — What new information do you have?
   - P(E|H) = How likely is this evidence IF the hypothesis is true?
   - P(E|¬H) = How likely is this evidence IF the hypothesis is FALSE?

3. **Update** — Apply Bayes' Rule:
   - P(H|E) = P(E|H) × P(H) / P(E)
   - Or intuitively: does the evidence make H more or less likely?

4. **Posterior Belief** — What's your updated probability?
   - Is it strong enough to act on?
   - What additional evidence would change your mind?

5. **Pre-mortem** — What would convince you you're WRONG?
   - Avoid confirmation bias: actively seek disconfirming evidence.

Express confidence as a range, not a point: "I'm 60-80% confident that..."`,
    example_questions: [
      "Should I believe this study's conclusion?",
      "What's the real probability this business idea will work?",
    ],
    quality_score: 0.86,
  },
  {
    name: "Systems Thinking",
    slug: "systems-thinking",
    domain: "science",
    description:
      "Analyze interconnected systems — feedback loops, emergent behavior, leverage points. See the whole, not just parts.",
    prompt_template: `Apply Systems Thinking:

1. **Map the System** — What are the key elements? How are they connected?
   - Draw a causal loop diagram: A → B → C → A (reinforcing or balancing?)

2. **Identify Feedback Loops:**
   - **Reinforcing loops** (R): growth spirals, vicious cycles (more A → more B → more A)
   - **Balancing loops** (B): stabilizing forces (more A → less B → less A)

3. **Find Delays** — Where does cause take time to produce effect?
   - Delays create oscillation and overshoot.

4. **Mental Models** — What assumptions are people making? Are they seeing the full system?

5. **Leverage Points** (Donella Meadows):
   - Where can a small change produce a big effect?
   - Hierarchy: paradigms > goals > rules > structure > delays > buffers

6. **Unintended Consequences** — If we change X, what ELSE changes?
   - Second-order effects: "Then what happens?"
   - Third-order effects: "And then?"

Find the highest-leverage intervention point.`,
    example_questions: [
      "Why does our team keep repeating the same problems?",
      "How do we break the cycle of technical debt?",
    ],
    quality_score: 0.89,
  },

  // ============================================================================
  // GENERAL (5 frameworks)
  // ============================================================================
  {
    name: "First Principles",
    slug: "first-principles",
    domain: "general",
    description:
      "Break down complex problems into fundamental truths and reason up from there, bypassing analogies and assumptions.",
    prompt_template: `Apply First Principles thinking:

1. **Identify assumptions** — What are we assuming? What conventions are we following by default?
2. **Break down to fundamentals** — What are the indisputable base truths? What do we know for certain?
3. **Reconstruct from ground up** — Starting only from fundamentals, what solution emerges? Ignore how it's "normally done."
4. **Validate** — Does the reconstructed solution hold? What are the constraints?

The goal: bypass analogies ("X does it this way") and reason from physics/math/logic.`,
    example_questions: [
      "How should we price our product?",
      "What's the most efficient architecture for this system?",
    ],
    quality_score: 0.9,
  },
  {
    name: "Socratic Method",
    slug: "socratic-method",
    domain: "general",
    description:
      "Explore ideas through systematic questioning, challenging assumptions, and examining implications.",
    prompt_template: `Apply the Socratic Method — explore through questions:

1. **Clarification** — What exactly do you mean? Can you give an example?
2. **Probe assumptions** — Why do you believe that? What if the opposite were true?
3. **Probe reasons/evidence** — What evidence supports this? How do you know?
4. **Explore implications** — If this is true, what follows? What are the consequences?
5. **Question the question** — Why is this important? What's the real question behind this?

Synthesize insights discovered through questioning.`,
    example_questions: [
      "Is our business model sustainable?",
      "Should we use microservices or monolith?",
    ],
    quality_score: 0.84,
  },
  {
    name: "Inversion (Charlie Munger)",
    slug: "inversion",
    domain: "general",
    description:
      "Think backwards. Instead of asking how to succeed, ask how to fail — then avoid those things.",
    prompt_template: `Apply Inversion thinking (Charlie Munger):

**Step 1: Invert the question**
- Instead of: "How do I [achieve X]?"
- Ask: "How would I GUARANTEE failure at [X]?"

**Step 2: List all ways to fail**
- What would make this definitely NOT work?
- What mistakes would be fatal?
- What do failed attempts have in common?

**Step 3: Avoid those things**
- For each failure mode: what's the opposite action?
- What guardrails prevent these failures?

**Step 4: Pre-mortem**
- Imagine it's 1 year from now and this FAILED. Why?
- What did you ignore? What surprised you?

"All I want to know is where I'm going to die, so I'll never go there." — Charlie Munger`,
    example_questions: [
      "How should I approach this important negotiation?",
      "What's the best strategy for launching our product?",
    ],
    quality_score: 0.88,
  },
  {
    name: "Second-Order Thinking",
    slug: "second-order-thinking",
    domain: "general",
    description:
      "Think beyond immediate consequences. 'And then what?' First-order effects are obvious. Second and third-order effects create lasting impact.",
    prompt_template: `Apply Second-Order Thinking:

**The Question at Every Level: "And then what?"**

**Action/Decision:** [What's being considered?]

**First-Order Effects** (immediate, obvious):
- What happens right away? (+/-)
- Who is directly affected?

**Second-Order Effects** (weeks/months later):
- How do people adapt to the first-order changes?
- What unintended behaviors emerge?
- What incentives shift?

**Third-Order Effects** (months/years later):
- How does the system evolve?
- What new problems or opportunities appear?
- What's the equilibrium state?

**Temporal Analysis:**
| Time Horizon | Positive Effects | Negative Effects |
|-------------|-----------------|-----------------|
| 1 week | ... | ... |
| 1 month | ... | ... |
| 1 year | ... | ... |
| 5 years | ... | ... |

Most people only see first-order. What second-order effect changes your decision?`,
    example_questions: [
      "Should we lower our prices to gain market share?",
      "What happens if we make our product free?",
    ],
    quality_score: 0.87,
  },
  {
    name: "Decision Matrix (Weighted Scoring)",
    slug: "decision-matrix",
    domain: "general",
    description:
      "Structured decision-making: list options, define criteria, weight them, score each option objectively.",
    prompt_template: `Build a Decision Matrix:

**Step 1: Define Options**
List all viable options (A, B, C, ...)

**Step 2: Define Criteria**
What matters? (cost, speed, quality, risk, scalability, team impact, etc.)

**Step 3: Weight Criteria** (must sum to 100%)
Which criteria matter MOST? Assign percentage weights.

**Step 4: Score Each Option** (1-10 per criterion)

| Criteria | Weight | Option A | Option B | Option C |
|----------|--------|----------|----------|----------|
| [criterion 1] | [%] | [1-10] | [1-10] | [1-10] |
| [criterion 2] | [%] | [1-10] | [1-10] | [1-10] |
| ... | ... | ... | ... | ... |
| **Weighted Total** | 100% | **[sum]** | **[sum]** | **[sum]** |

**Step 5: Sensitivity Check**
- If you change the top weight by ±20%, does the winner change?
- Is there a "gut feeling" mismatch? (If so, a hidden criterion is missing.)

**Recommendation:** [Winner] because [reasoning].`,
    example_questions: [
      "Should we build, buy, or partner for this feature?",
      "Which of these 4 job offers should I take?",
    ],
    quality_score: 0.85,
  },
];

async function main() {
  const supabase = getSupabase();

  console.log(`Upserting ${FRAMEWORKS.length} BGML frameworks...`);
  const count = await batchUpsert(
    supabase,
    "bgml_frameworks",
    FRAMEWORKS,
    "slug",
  );
  console.log(`Done: ${count} frameworks seeded across domains:`);

  // Count by domain
  const domains = new Map<string, number>();
  for (const f of FRAMEWORKS) {
    domains.set(f.domain, (domains.get(f.domain) || 0) + 1);
  }
  for (const [domain, count] of domains) {
    console.log(`  ${domain}: ${count}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
