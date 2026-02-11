/**
 * Email Analysis Pipeline — ALL Tier 1 (Gemini Flash)
 *
 * Two-phase analysis:
 * Phase 1: Fast classification (all emails) — category, priority, sentiment
 * Phase 2: Deep extraction (priority >= 60) — action_items, key_facts, follow_up
 *
 * Both phases use Gemini Flash via ModelRouter (ultra-cheap).
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getModelRouter } from "@/lib/ai/model-router";
import { logActivity } from "@/lib/activity-log";
import type {
  AnalyzedEmail,
  ClassificationResult,
  DeepAnalysisResult,
  AnalysisResult,
} from "./types";
import { extractKnowledge } from "./knowledge-extractor";
import { generateTasksFromEmail } from "./task-generator";

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Analyze pending emails — called by CRON every 5 minutes.
 * Processes max 10 emails per invocation (stays under 50s).
 */
export async function analyzeEmails(
  timeoutMs = 50_000,
): Promise<AnalysisResult> {
  const supabase = getServiceSupabase();
  const startTime = Date.now();
  const result: AnalysisResult = {
    emailsProcessed: 0,
    classified: 0,
    deepAnalyzed: 0,
    insightsGenerated: 0,
    tasksCreated: 0,
    errors: 0,
  };

  // Fetch pending emails
  const { data: pending, error } = await supabase
    .from("exo_analyzed_emails")
    .select("*")
    .eq("analysis_status", "pending")
    .order("date_received", { ascending: false })
    .limit(10);

  if (error || !pending?.length) return result;

  // Phase 1: Classify ALL in parallel
  const classifyPromises = (pending as AnalyzedEmail[]).map((email) =>
    classifyEmail(email).catch((err) => {
      console.error("[EmailAnalyzer] Classification failed:", {
        emailId: email.id,
        error: err instanceof Error ? err.message : err,
      });
      return null;
    }),
  );

  const classifications = await Promise.allSettled(classifyPromises);

  // Apply classification results
  for (let i = 0; i < pending.length; i++) {
    if (Date.now() - startTime > timeoutMs) break;

    const email = pending[i] as AnalyzedEmail;
    const classResult = classifications[i];
    const classification =
      classResult.status === "fulfilled" ? classResult.value : null;

    if (!classification) {
      result.errors++;
      await supabase
        .from("exo_analyzed_emails")
        .update({ analysis_status: "failed" })
        .eq("id", email.id);
      continue;
    }

    // Update with classification
    await supabase
      .from("exo_analyzed_emails")
      .update({
        category: classification.category,
        subcategory: classification.subcategory,
        priority: classification.priority,
        priority_score: classification.priority_score,
        sentiment: classification.sentiment,
        follow_up_needed: classification.follow_up_needed,
        analysis_status:
          classification.priority_score >= 60 ? "processing" : "completed",
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", email.id);

    result.classified++;

    // Phase 2: Deep analysis for high-priority emails
    if (classification.priority_score >= 60 && email.body_text) {
      try {
        const deepResult = await deepAnalyzeEmail(email);

        // Update with deep analysis
        const followUpBy = deepResult.follow_up_by
          ? new Date(deepResult.follow_up_by).toISOString()
          : classification.follow_up_needed
            ? new Date(
                Date.now() + (classification.follow_up_days || 3) * 86400_000,
              ).toISOString()
            : null;

        await supabase
          .from("exo_analyzed_emails")
          .update({
            action_items: deepResult.action_items,
            key_facts: deepResult.key_facts,
            follow_up_by: followUpBy,
            analysis_status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", email.id);

        result.deepAnalyzed++;

        // Knowledge extraction (if key facts found)
        if (deepResult.key_facts.length > 0) {
          try {
            const chunks = await extractKnowledge(email, deepResult.key_facts);
            result.insightsGenerated += chunks;
          } catch (err) {
            console.error("[EmailAnalyzer] Knowledge extraction failed:", err);
          }
        }

        // Task generation (if action items found)
        if (deepResult.action_items.length > 0) {
          try {
            const tasks = await generateTasksFromEmail(
              email,
              deepResult.action_items,
            );
            result.tasksCreated += tasks;
          } catch (err) {
            console.error("[EmailAnalyzer] Task generation failed:", err);
          }
        }
      } catch (err) {
        console.error("[EmailAnalyzer] Deep analysis failed:", {
          emailId: email.id,
          error: err instanceof Error ? err.message : err,
        });
        // Mark as completed anyway (classification done)
        await supabase
          .from("exo_analyzed_emails")
          .update({ analysis_status: "completed" })
          .eq("id", email.id);
      }
    }

    // Update sender profile
    await updateSenderProfile(email, classification);
    result.emailsProcessed++;
  }

  // Log activity for tenant(s)
  const tenantIds = [...new Set(pending.map((e) => e.tenant_id))];
  for (const tenantId of tenantIds) {
    logActivity({
      tenantId,
      actionType: "cron_action",
      actionName: "email_analyze",
      description: `Przeanalizowano ${result.classified} emaili (${result.deepAnalyzed} glebokich, ${result.tasksCreated} zadan)`,
      source: "email-analyze",
      metadata: { ...result } as Record<string, unknown>,
    });
  }

  return result;
}

// ============================================================================
// PHASE 1: FAST CLASSIFICATION (Tier 1 — Gemini Flash)
// ============================================================================

const CLASSIFICATION_PROMPT = `Jestes systemem klasyfikacji emaili. Analizujesz email i zwracasz JSON.

Zwroc DOKLADNIE ten format JSON (bez markdown, bez komentarzy):
{
  "category": "work|personal|newsletter|notification|finance|health|social|spam",
  "subcategory": "krotki opis np. meeting_request, invoice, promotion, greeting",
  "priority": "urgent|high|normal|low|ignore",
  "priority_score": 0-100,
  "sentiment": "positive|neutral|negative|urgent",
  "follow_up_needed": true/false,
  "follow_up_days": null lub liczba dni
}

Zasady priorytetyzacji:
- urgent (90-100): wymaga natychmiastowej reakcji (deadline dzis, pytanie od szefa)
- high (70-89): wazne ale nie pilne (propozycja biznesowa, faktura)
- normal (40-69): standardowe (aktualizacje, informacje)
- low (20-39): malo istotne (newsletter, social media)
- ignore (0-19): spam, marketing, automatyczne notyfikacje

WAZNE: Odpowiedz TYLKO formatem JSON, nic wiecej.`;

async function classifyEmail(
  email: AnalyzedEmail,
): Promise<ClassificationResult> {
  const router = getModelRouter();

  const emailContext = JSON.stringify({
    subject: email.subject || "(brak)",
    from: `${email.from_name || ""} <${email.from_email}>`,
    snippet: (email.snippet || "").slice(0, 300),
    labels: email.labels || [],
    date: email.date_received,
    direction: email.direction,
    has_attachments: email.has_attachments,
  });

  const response = await router.route({
    messages: [
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: emailContext },
    ],
    taskCategory: "classification",
    maxTokens: 200,
    temperature: 0,
    tenantId: email.tenant_id,
  });

  try {
    const parsed = JSON.parse(response.content.trim());
    return {
      category: parsed.category || "notification",
      subcategory: parsed.subcategory || "",
      priority: parsed.priority || "normal",
      priority_score: Math.max(0, Math.min(100, parsed.priority_score ?? 50)),
      sentiment: parsed.sentiment || "neutral",
      follow_up_needed: Boolean(parsed.follow_up_needed),
      follow_up_days: parsed.follow_up_days ?? undefined,
    };
  } catch {
    // Fallback for unparseable response
    return {
      category: "notification",
      subcategory: "",
      priority: "normal",
      priority_score: 50,
      sentiment: "neutral",
      follow_up_needed: false,
    };
  }
}

// ============================================================================
// PHASE 2: DEEP EXTRACTION (Tier 1 — Gemini Flash)
// ============================================================================

const DEEP_ANALYSIS_PROMPT = `Jestes systemem analizy emaili. Wyciagasz akcje i kluczowe fakty z tresci.

Zwroc DOKLADNIE ten format JSON (bez markdown):
{
  "action_items": [
    {"text": "co trzeba zrobic", "due_date": "YYYY-MM-DD lub null", "assignee": "kto lub null"}
  ],
  "key_facts": [
    {"fact": "wazna informacja do zapamietania", "confidence": 0.0-1.0}
  ],
  "follow_up_by": "YYYY-MM-DD lub null",
  "sentiment_detail": "krotki opis emocji/tonu emaila",
  "summary": "1-2 zdania podsumowania emaila"
}

Zasady:
- action_items: KONKRETNE rzeczy do zrobienia (nie ogolniki)
- key_facts: informacje warte zapamietania (daty, kwoty, ustalenia, obietnice, decyzje)
- follow_up_by: kiedy odpowiedziec/zareagowac
- Jesli email jest informacyjny bez akcji: puste tablice
- Max 5 action_items, max 5 key_facts

WAZNE: Odpowiedz TYLKO formatem JSON.`;

async function deepAnalyzeEmail(
  email: AnalyzedEmail,
): Promise<DeepAnalysisResult> {
  const router = getModelRouter();

  // Truncate body to 4000 chars (Gemini Flash handles this well)
  const bodyText = (email.body_text || "").slice(0, 4000);

  const emailContext = `Temat: ${email.subject || "(brak)"}
Od: ${email.from_name || ""} <${email.from_email}>
Data: ${email.date_received}

Tresc:
${bodyText}`;

  const response = await router.route({
    messages: [
      { role: "system", content: DEEP_ANALYSIS_PROMPT },
      { role: "user", content: emailContext },
    ],
    taskCategory: "extraction",
    maxTokens: 500,
    temperature: 0.1,
    tenantId: email.tenant_id,
  });

  try {
    const parsed = JSON.parse(response.content.trim());
    return {
      action_items: (parsed.action_items || [])
        .slice(0, 5)
        .map(
          (item: { text?: string; due_date?: string; assignee?: string }) => ({
            text: item.text || "",
            due_date: item.due_date || undefined,
            assignee: item.assignee || undefined,
          }),
        ),
      key_facts: (parsed.key_facts || [])
        .slice(0, 5)
        .map((fact: { fact?: string; confidence?: number }) => ({
          fact: fact.fact || "",
          confidence: Math.max(0, Math.min(1, fact.confidence ?? 0.5)),
        })),
      follow_up_by: parsed.follow_up_by || undefined,
      sentiment_detail: parsed.sentiment_detail || "",
      summary: parsed.summary || "",
    };
  } catch {
    return {
      action_items: [],
      key_facts: [],
      sentiment_detail: "",
      summary: "",
    };
  }
}

// ============================================================================
// SENDER PROFILE UPDATE
// ============================================================================

async function updateSenderProfile(
  email: AnalyzedEmail,
  classification: ClassificationResult,
): Promise<void> {
  const supabase = getServiceSupabase();

  const domain = email.from_email.split("@")[1] || null;

  // Determine relationship from category
  let relationship = "unknown";
  if (classification.category === "work") relationship = "colleague";
  else if (classification.category === "personal") relationship = "friend";
  else if (classification.category === "newsletter")
    relationship = "newsletter";
  else if (classification.category === "notification") relationship = "service";
  else if (classification.category === "finance") relationship = "service";

  // Upsert sender profile
  const { error } = await supabase.from("exo_email_sender_profiles").upsert(
    {
      tenant_id: email.tenant_id,
      email_address: email.from_email,
      display_name: email.from_name || null,
      relationship,
      domain,
      importance_score: classification.priority_score,
      last_email_at: email.date_received,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,email_address" },
  );

  if (error) {
    console.error(
      "[EmailAnalyzer] Sender profile update failed:",
      error.message,
    );
  }

  // Increment email count — RPC may not exist, ignore errors
  try {
    await supabase.rpc("increment_sender_email_count", {
      p_tenant_id: email.tenant_id,
      p_email_address: email.from_email,
      p_direction: email.direction,
    });
  } catch {
    // RPC not available — counts updated via upsert above
  }
}
