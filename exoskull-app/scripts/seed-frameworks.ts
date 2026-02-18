/**
 * Seed 6 BGML Reasoning Frameworks → bgml_frameworks
 *
 * Hard-coded frameworks from the BGML.ai system.
 *
 * Usage: npx tsx scripts/seed-frameworks.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { getSupabase, batchUpsert } from "./seed-helpers";

const FRAMEWORKS = [
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
  console.log(`Done: ${count} frameworks seeded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
