/**
 * ExoSkull Engine Test — verifies all components built in the overhaul.
 *
 * Tests:
 * 1. BGML Classifier
 * 2. BGML Framework Selector
 * 3. BGML Voting/Scoring
 * 4. BGML Pipeline orchestration (complexity 1-3, no API calls needed)
 * 5. Planner (intent detection, tool mapping)
 * 6. Byzantine consensus types
 * 7. Discovery tools
 * 8. Reverse prompt builder
 */

// ── 1. BGML Classifier ──
import { classify } from "../lib/bgml/classifier";

console.log("\n=== TEST 1: BGML Classifier ===");

const testCases = [
  { msg: "cześć, co tam?", expectedDomain: "general", maxComplexity: 2 },
  {
    msg: "dodaj zadanie: zadzwonić do dentysty",
    expectedDomain: "personal",
    maxComplexity: 2,
  },
  {
    msg: "jaka strategia cenowa dla mojego SaaS?",
    expectedDomain: "business",
    minComplexity: 3,
  },
  {
    msg: "zaprojektuj 5-letnią strategię wejścia na rynek EU z analizą konkurencji",
    expectedDomain: "business",
    minComplexity: 4,
  },
  {
    msg: "napisz test unitowy w jest dla API endpoint",
    expectedDomain: "engineering",
    minComplexity: 2,
  },
  {
    msg: "jak sobie radzić z prokrastynacją i niską energią rano?",
    expectedDomain: "personal",
    minComplexity: 2,
  },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = classify(tc.msg);
  const domainOk = result.domain === tc.expectedDomain;
  const complexityOk =
    (tc.maxComplexity ? result.complexity <= tc.maxComplexity : true) &&
    (tc.minComplexity ? result.complexity >= tc.minComplexity : true);

  const status = domainOk && complexityOk ? "✓" : "✗";
  if (domainOk && complexityOk) passed++;
  else failed++;

  console.log(
    `  ${status} "${tc.msg.slice(0, 50)}..." → domain=${result.domain} (expect: ${tc.expectedDomain}) complexity=${result.complexity}${tc.minComplexity ? ` (min: ${tc.minComplexity})` : ""}${tc.maxComplexity ? ` (max: ${tc.maxComplexity})` : ""}`,
  );
}
console.log(`  Result: ${passed}/${passed + failed} passed`);

// ── 2. BGML Voting/Scoring ──
import { scoreResponse, selectBest } from "../lib/bgml/voting";

console.log("\n=== TEST 2: BGML Voting ===");

const shortAnswer = scoreResponse("tak");
const longAnswer = scoreResponse(
  `## Strategia cenowa SaaS\n\n1. **Freemium** — darmowy plan z limitami\n2. **Value-based pricing** — cena proporcjonalna do wartości\n3. **Tiered pricing** — 3 plany (Basic, Pro, Enterprise)\n\n### Rekomendacja\nZacznij od tiered pricing z trial 14 dni. Testuj konwersje A/B co kwartał.`,
);

console.log(`  Short answer score: ${shortAnswer.score}/100 (expect: <30)`);
console.log(`  Long answer score: ${longAnswer.score}/100 (expect: >50)`);
console.log(`  Breakdown:`, JSON.stringify(longAnswer.breakdown));

const best = selectBest([shortAnswer.text, longAnswer.text]);
console.log(
  `  Best selected: ${best.best === longAnswer.text ? "✓ long answer" : "✗ short answer"}`,
);

if (
  shortAnswer.score < 30 &&
  longAnswer.score > 50 &&
  best.best === longAnswer.text
) {
  console.log("  Result: PASS");
  passed += 3;
} else {
  console.log("  Result: FAIL");
  failed += 3;
}

// ── 3. Planner (intent/tool mapping — no API needed) ──
console.log("\n=== TEST 3: Planner (classify + intent detection) ===");

// We can test the classifier part, which is synchronous
const planTestCases = [
  {
    msg: "wyślij email do klienta",
    expectKeyword: "klient",
    expectDomain: "business",
  },
  {
    msg: "zaplanuj spotkanie na piątek",
    expectKeyword: "spotkani",
    expectDomain: "personal",
  },
  { msg: "pokaż moje cele", expectKeyword: "cel", expectDomain: "personal" },
  {
    msg: "wyszukaj w internecie jak zrobić landing page",
    expectKeyword: "jak",
    expectDomain: "general",
  },
];

for (const tc of planTestCases) {
  const classification = classify(tc.msg);
  console.log(
    `  "${tc.msg}" → domain=${classification.domain}, complexity=${classification.complexity}, keywords=${classification.keywords.join(",")}`,
  );
  const hasKeyword = classification.keywords.some(
    (k) => k.includes(tc.expectKeyword) || tc.expectKeyword.includes(k),
  );
  const domainOk = tc.expectDomain
    ? classification.domain === tc.expectDomain
    : true;
  if (hasKeyword && domainOk) {
    console.log(
      `    ✓ Found keyword "${tc.expectKeyword}", domain=${classification.domain}`,
    );
    passed++;
  } else {
    console.log(
      `    ✗ keyword="${tc.expectKeyword}" in [${classification.keywords}], domain=${classification.domain} (expect: ${tc.expectDomain})`,
    );
    failed++;
  }
}

// ── 4. Byzantine Types ──
console.log("\n=== TEST 4: Byzantine Consensus Types ===");

import type {
  ByzantineAction,
  ConsensusResult,
  ValidatorVote,
} from "../lib/ai/consensus/types";
import { requiresConsensus } from "../lib/ai/consensus/byzantine";

const criticalActions = [
  "make_call",
  "purchase",
  "grant_autonomy",
  "delete_data",
  "send_money",
  "deploy_app",
  "cancel_service",
  "share_data",
];

const safActions = ["list_tasks", "search_memory", "classify", "add_task"];

let byzantinePassed = true;
for (const action of criticalActions) {
  if (!requiresConsensus(action)) {
    console.log(`  ✗ ${action} should require consensus but doesn't`);
    byzantinePassed = false;
    failed++;
  }
}
for (const action of safActions) {
  if (requiresConsensus(action)) {
    console.log(`  ✗ ${action} should NOT require consensus but does`);
    byzantinePassed = false;
    failed++;
  }
}

if (byzantinePassed) {
  console.log(
    `  ✓ All ${criticalActions.length} critical actions require consensus`,
  );
  console.log(`  ✓ All ${safActions.length} safe actions skip consensus`);
  passed += 2;
} else {
  console.log("  Result: FAIL");
}

// ── 5. Discovery Tools — tested inside async function below ──

// ── 6. Pipeline (dry run — complexity 1-2, no API) ──
console.log("\n=== TEST 6: BGML Pipeline (direct tier, no API) ===");

import { runBGMLPipeline, shouldEscalate } from "../lib/bgml/pipeline";

async function testPipeline() {
  // ── 5. Discovery Tools ──
  console.log("\n=== TEST 5: Discovery Tools ===");
  const { discoveryTools } = await import("../lib/iors/tools/discovery-tools");
  const discoverTool = discoveryTools[0];
  console.log(`  Tool name: ${discoverTool.definition.name}`);
  console.log(
    `  Has execute: ${typeof discoverTool.execute === "function" ? "✓" : "✗"}`,
  );
  if (
    discoverTool.definition.name === "discover_tools" &&
    typeof discoverTool.execute === "function"
  ) {
    console.log("  Result: PASS");
    passed += 2;
  } else {
    console.log("  Result: FAIL");
    failed += 2;
  }

  // ── 6. Pipeline ──
  const simpleResult = await runBGMLPipeline("cześć, jak się masz?", {
    forceComplexity: 1,
  });
  console.log(`  Tier: ${simpleResult.tier} (expect: direct)`);
  console.log(
    `  Context injection: "${simpleResult.contextInjection}" (expect: empty)`,
  );
  console.log(`  Duration: ${simpleResult.durationMs}ms`);

  if (simpleResult.tier === "direct" && simpleResult.contextInjection === "") {
    console.log("  Result: PASS");
    passed += 2;
  } else {
    console.log("  Result: FAIL");
    failed += 2;
  }

  // Test shouldEscalate
  console.log("\n=== TEST 7: Quality Escalation Logic ===");
  const goodResponse = shouldEscalate(longAnswer.text);
  const badResponse = shouldEscalate("tak");
  console.log(
    `  Good response: score=${goodResponse.score}, escalate=${goodResponse.shouldEscalate}`,
  );
  console.log(
    `  Bad response: score=${badResponse.score}, escalate=${badResponse.shouldEscalate}`,
  );

  if (!goodResponse.shouldEscalate && badResponse.shouldEscalate) {
    console.log("  Result: PASS");
    passed += 2;
  } else if (!goodResponse.shouldEscalate) {
    console.log(
      "  Result: PARTIAL (good response ok, bad response not escalated — threshold may need tuning)",
    );
    passed += 1;
    failed += 1;
  } else {
    console.log("  Result: FAIL");
    failed += 2;
  }

  // ── Summary ──
  console.log("\n" + "=".repeat(50));
  console.log(`TOTAL: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

testPipeline().catch((err) => {
  console.error("Pipeline test failed:", err);
  process.exit(1);
});
