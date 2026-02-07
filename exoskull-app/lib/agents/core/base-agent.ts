/**
 * Base Agent Implementation
 *
 * Abstract class that provides common functionality for all agents.
 * Implements the Resources -> Environment -> Decision -> Execute framework.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  IAgent,
  AgentTier,
  AgentStatus,
  AgentContext,
  ResourceAnalysis,
  EnvironmentAnalysis,
  Decision,
  ExecutionResult,
  AgentExecutionLog,
} from "../types";

// ============================================================================
// ABSTRACT BASE AGENT
// ============================================================================

export abstract class BaseAgent implements IAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly tier: AgentTier;
  abstract readonly capabilities: string[];

  protected status: AgentStatus = "idle";
  protected context: AgentContext;
  protected supabase: SupabaseClient;
  protected startTime?: number;

  constructor(context: AgentContext) {
    this.context = context;
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  // ============================================================================
  // RESOURCE ANALYSIS (Common implementation)
  // ============================================================================

  async analyzeResources(tenantId: string): Promise<ResourceAnalysis> {
    const [
      conversationsCount,
      highlightsCount,
      tasksCount,
      mitsCount,
      rigs,
      patternsCount,
      activeModules,
      quotas,
    ] = await Promise.all([
      this.countConversations(tenantId),
      this.countHighlights(tenantId),
      this.countTasks(tenantId),
      this.countMits(tenantId),
      this.getConnectedRigs(tenantId),
      this.countPatterns(tenantId),
      this.getActiveModules(tenantId),
      this.getAiQuotas(tenantId),
    ]);

    return {
      availableData: {
        conversations: conversationsCount,
        highlights: highlightsCount,
        tasks: tasksCount,
        patterns: patternsCount,
        mits: mitsCount,
      },
      connectedRigs: rigs,
      activeModules,
      modelAvailability: {
        "gemini-flash": true,
        "claude-haiku": true,
        "kimi-k2": true,
        "claude-opus": true,
      },
      quotas,
    };
  }

  // ============================================================================
  // ENVIRONMENT ANALYSIS (Common implementation)
  // ============================================================================

  async analyzeEnvironment(tenantId: string): Promise<EnvironmentAnalysis> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    const [
      lastConversation,
      taskStats,
      upcomingEventsCount,
      lastHighlightExtraction,
      lastMitDetection,
    ] = await Promise.all([
      this.getLastConversationTime(tenantId),
      this.getTaskStats(tenantId),
      this.getUpcomingEventsCount(tenantId),
      this.getLastProcessingTime(tenantId, "highlight_extraction"),
      this.getLastProcessingTime(tenantId, "mit_detection"),
    ]);

    return {
      timeOfDay: this.getTimeOfDay(hour),
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isQuietHours: hour >= 22 || hour < 7,

      userMood: "unknown",
      lastConversationAgo: lastConversation
        ? Math.floor(
            (now.getTime() - new Date(lastConversation).getTime()) / 60000,
          )
        : -1,
      recentActivityLevel: this.calculateActivityLevel(lastConversation),

      pendingTasks: taskStats.pending,
      urgentItems: taskStats.urgent,
      overdueTasks: taskStats.overdue,

      calendarBusy: upcomingEventsCount > 0,
      upcomingEvents: upcomingEventsCount,

      lastHighlightExtraction,
      lastMitDetection,
    };
  }

  // ============================================================================
  // ABSTRACT METHODS (Subclasses must implement)
  // ============================================================================

  abstract decide(
    resources: ResourceAnalysis,
    environment: EnvironmentAnalysis,
    context?: AgentContext,
  ): Promise<Decision[]>;

  abstract execute(decision: Decision): Promise<ExecutionResult>;

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  canHandle(task: string): boolean {
    return this.capabilities.some((cap) =>
      task.toLowerCase().includes(cap.toLowerCase()),
    );
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  async onSpawn(): Promise<void> {
    this.status = "running";
    this.startTime = Date.now();
    logger.info(`[${this.name}] Spawned for tenant ${this.context.tenantId}`);
  }

  async onRelease(): Promise<void> {
    this.status = "idle";
    const duration = this.startTime ? Date.now() - this.startTime : 0;
    logger.info(`[${this.name}] Released after ${duration}ms`);
  }

  // ============================================================================
  // LOGGING
  // ============================================================================

  protected async logExecution(
    decision: Decision,
    result?: ExecutionResult,
    error?: string,
  ): Promise<void> {
    const log: Partial<AgentExecutionLog> = {
      tenant_id: this.context.tenantId,
      agent_id: this.id,
      agent_name: this.name,
      tier: this.tier,
      decision,
      result,
      status: result?.success ? "completed" : "failed",
      started_at: this.context.startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: this.startTime ? Date.now() - this.startTime : undefined,
      tokens_used: result?.metrics.tokensUsed,
      model_used: result?.metrics.modelUsed,
      error,
    };

    try {
      await this.supabase.from("agent_executions").insert(log);
    } catch (err) {
      console.error(`[${this.name}] Failed to log execution:`, err);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getTimeOfDay(
    hour: number,
  ): "early_morning" | "morning" | "afternoon" | "evening" | "night" {
    if (hour >= 5 && hour < 9) return "early_morning";
    if (hour >= 9 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  private calculateActivityLevel(
    lastConversation: string | null,
  ): "high" | "medium" | "low" | "none" {
    if (!lastConversation) return "none";
    const hoursAgo =
      (Date.now() - new Date(lastConversation).getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 1) return "high";
    if (hoursAgo < 4) return "medium";
    if (hoursAgo < 24) return "low";
    return "none";
  }

  // ============================================================================
  // DATABASE QUERIES
  // ============================================================================

  private async countConversations(tenantId: string): Promise<number> {
    const { count } = await this.supabase
      .from("exo_conversations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    return count || 0;
  }

  private async countHighlights(tenantId: string): Promise<number> {
    const { count } = await this.supabase
      .from("user_memory_highlights")
      .select("*", { count: "exact", head: true })
      .eq("user_id", tenantId);
    return count || 0;
  }

  private async countTasks(tenantId: string): Promise<number> {
    const { count } = await this.supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending");
    return count || 0;
  }

  private async countMits(tenantId: string): Promise<number> {
    const { count } = await this.supabase
      .from("user_mits")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    return count || 0;
  }

  private async getConnectedRigs(tenantId: string): Promise<string[]> {
    const { data } = await this.supabase
      .from("rig_connections")
      .select("rig_slug")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    return data?.map((r) => r.rig_slug) || [];
  }

  private async getLastConversationTime(
    tenantId: string,
  ): Promise<string | null> {
    const { data } = await this.supabase
      .from("exo_conversations")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return data?.created_at || null;
  }

  private async getTaskStats(
    tenantId: string,
  ): Promise<{ pending: number; urgent: number; overdue: number }> {
    const now = new Date().toISOString();

    const [pending, urgent, overdue] = await Promise.all([
      this.supabase
        .from("exo_tasks")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
      this.supabase
        .from("exo_tasks")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .eq("priority", "high"),
      this.supabase
        .from("exo_tasks")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .lt("due_date", now),
    ]);

    return {
      pending: pending.count || 0,
      urgent: urgent.count || 0,
      overdue: overdue.count || 0,
    };
  }

  private async countPatterns(tenantId: string): Promise<number> {
    const { count } = await this.supabase
      .from("user_patterns")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    return count || 0;
  }

  private async getActiveModules(tenantId: string): Promise<string[]> {
    const { data } = await this.supabase
      .from("exo_tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    const settings = data?.settings as Record<string, unknown> | null;
    if (settings?.activeModules && Array.isArray(settings.activeModules)) {
      return settings.activeModules as string[];
    }
    return ["task-manager", "mood-tracker", "habit-tracker"];
  }

  private async getAiQuotas(tenantId: string): Promise<{
    aiCallsRemaining: number;
    storageUsedMb: number;
    apiCallsToday: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count } = await this.supabase
      .from("agent_executions")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("started_at", todayStart.toISOString());

    const apiCallsToday = count || 0;
    const dailyLimit = 1000;
    return {
      aiCallsRemaining: Math.max(0, dailyLimit - apiCallsToday),
      storageUsedMb: 0,
      apiCallsToday,
    };
  }

  private async getUpcomingEventsCount(tenantId: string): Promise<number> {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { count } = await this.supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .gte("due_date", now.toISOString())
      .lte("due_date", tomorrow.toISOString());

    return count || 0;
  }

  private async getLastProcessingTime(
    tenantId: string,
    processType: string,
  ): Promise<string | null> {
    const { data } = await this.supabase
      .from("agent_executions")
      .select("completed_at")
      .eq("tenant_id", tenantId)
      .eq("agent_id", processType)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    return data?.completed_at || null;
  }
}
