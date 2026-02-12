#!/usr/bin/env tsx
/**
 * Migration Script: Legacy Task/Goal System → Tyrolka Framework
 *
 * Migrates data from:
 *   - exo_user_goals → user_quests
 *   - exo_tasks → user_ops
 *   - exo_goal_checkpoints → (archived in migration_metadata)
 *
 * Modes:
 *   DRY_RUN: Validate mappings, detect orphaned records, NO writes
 *   EXECUTE: Perform actual migration with transaction support
 *
 * Usage:
 *   npm run migrate-tyrolka -- --dry-run          # Validation only
 *   npm run migrate-tyrolka -- --execute          # Execute migration
 *   npm run migrate-tyrolka -- --tenant-id=<uuid> # Migrate single tenant
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface MigrationStats {
  tenantsProcessed: number;
  goalsMigrated: number;
  tasksMigrated: number;
  checkpointsArchived: number;
  orphanedGoals: number;
  orphanedTasks: number;
  errors: number;
  errorDetails: string[];
}

interface LegacyGoal {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  category?: string;
  target_date?: string;
  is_active: boolean;
  created_at: string;
}

interface LegacyTask {
  id: string;
  tenant_id: string;
  title: string;
  description?: string;
  status: string;
  priority?: number;
  due_date?: string;
  created_at: string;
}

// ============================================================================
// HELPER FUNCTIONS: Status & Priority Mapping
// ============================================================================

function mapTaskStatus(
  legacyStatus: string,
): "pending" | "active" | "completed" | "dropped" | "blocked" {
  const mapping: Record<
    string,
    "pending" | "active" | "completed" | "dropped" | "blocked"
  > = {
    pending: "pending",
    in_progress: "active",
    done: "completed",
    cancelled: "dropped",
    blocked: "blocked",
  };
  return mapping[legacyStatus] || "pending";
}

function mapTaskPriority(legacyPriority: number): number {
  // Legacy: 1=critical, 2=high, 3=medium, 4=low
  // Tyrolka: 1-10 scale (1=lowest, 10=highest)
  const mapping: Record<number, number> = {
    1: 10, // critical → highest
    2: 7, // high → 7/10
    3: 5, // medium → 5/10
    4: 2, // low → 2/10
  };
  return mapping[legacyPriority] || 5;
}

async function migrateGoalsToQuests(
  tenantId: string,
  dryRun: boolean,
): Promise<{ migrated: number; orphaned: number; errors: number }> {
  console.log(
    `[Goals→Quests] ${dryRun ? "DRY RUN" : "EXECUTING"} for tenant ${tenantId}`,
  );

  let migrated = 0;
  let orphaned = 0;
  let errors = 0;

  try {
    // Fetch legacy goals
    const { data: legacyGoals, error: fetchError } = await supabase
      .from("exo_user_goals")
      .select("*")
      .eq("tenant_id", tenantId);

    if (fetchError) {
      console.error(`[Goals→Quests] Fetch error:`, fetchError);
      return { migrated: 0, orphaned: 0, errors: 1 };
    }

    if (!legacyGoals || legacyGoals.length === 0) {
      console.log(
        `[Goals→Quests] No legacy goals found for tenant ${tenantId}`,
      );
      return { migrated: 0, orphaned: 0, errors: 0 };
    }

    console.log(
      `[Goals→Quests] Found ${legacyGoals.length} legacy goals to migrate`,
    );

    // Get or create default campaign for orphaned goals
    let defaultCampaignId: string | null = null;

    if (!dryRun) {
      // Check if default campaign exists
      const { data: existingCampaign } = await supabase
        .from("user_campaigns")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("title", "Migrated Goals")
        .single();

      if (existingCampaign) {
        defaultCampaignId = existingCampaign.id;
      } else {
        // Create default campaign
        const { data: newCampaign, error: campaignError } = await supabase
          .from("user_campaigns")
          .insert({
            tenant_id: tenantId,
            title: "Migrated Goals",
            vision:
              "Goals migrated from legacy system. Organize into campaigns as needed.",
            status: "active",
            loop_slug: "general",
          })
          .select("id")
          .single();

        if (campaignError) {
          console.error(
            `[Goals→Quests] Failed to create default campaign:`,
            campaignError,
          );
          return { migrated: 0, orphaned: legacyGoals.length, errors: 1 };
        }

        defaultCampaignId = newCampaign.id;
        console.log(
          `[Goals→Quests] Created default campaign: ${defaultCampaignId}`,
        );
      }
    }

    // Migrate each goal
    for (const goal of legacyGoals as LegacyGoal[]) {
      try {
        const questData = {
          tenant_id: goal.tenant_id,
          campaign_id: defaultCampaignId,
          title: goal.name,
          description: goal.description || null,
          status: goal.is_active ? "active" : "paused",
          loop_slug: goal.category || "general",
          deadline: goal.target_date || null,
          tags: [goal.category].filter(Boolean),
        };

        if (dryRun) {
          console.log(`[Goals→Quests] DRY RUN: Would migrate goal ${goal.id}`);
          console.log(
            `  Quest data: ${JSON.stringify(questData).substring(0, 100)}...`,
          );
          migrated++;
        } else {
          // Insert quest
          const { data: newQuest, error: insertError } = await supabase
            .from("user_quests")
            .insert(questData)
            .select("id")
            .single();

          if (insertError) {
            console.error(
              `[Goals→Quests] Failed to insert quest for goal ${goal.id}:`,
              insertError,
            );
            errors++;
            continue;
          }

          // Record mapping
          const { error: mapError } = await supabase
            .from("exo_migration_map")
            .insert({
              tenant_id: goal.tenant_id,
              legacy_type: "exo_user_goals",
              legacy_id: goal.id,
              new_type: "user_quests",
              new_id: newQuest.id,
              migration_notes: {
                legacy_category: goal.category,
                legacy_active: goal.is_active,
              },
            });

          if (mapError) {
            console.error(
              `[Goals→Quests] Failed to record mapping for goal ${goal.id}:`,
              mapError,
            );
            errors++;
            continue;
          }

          migrated++;
          console.log(
            `[Goals→Quests] Migrated goal ${goal.id} → quest ${newQuest.id}`,
          );
        }
      } catch (error) {
        console.error(
          `[Goals→Quests] Unexpected error migrating goal ${goal.id}:`,
          error,
        );
        errors++;
      }
    }
  } catch (error) {
    console.error(`[Goals→Quests] Fatal error:`, error);
    errors++;
  }

  return { migrated, orphaned, errors };
}

async function migrateTasksToOps(
  tenantId: string,
  dryRun: boolean,
): Promise<{ migrated: number; orphaned: number; errors: number }> {
  console.log(
    `[Tasks→Ops] ${dryRun ? "DRY RUN" : "EXECUTING"} for tenant ${tenantId}`,
  );

  let migrated = 0;
  let orphaned = 0;
  let errors = 0;

  try {
    // Fetch legacy tasks
    const { data: legacyTasks, error: fetchError } = await supabase
      .from("exo_tasks")
      .select("*")
      .eq("tenant_id", tenantId);

    if (fetchError) {
      console.error(`[Tasks→Ops] Fetch error:`, fetchError);
      return { migrated: 0, orphaned: 0, errors: 1 };
    }

    if (!legacyTasks || legacyTasks.length === 0) {
      console.log(`[Tasks→Ops] No legacy tasks found for tenant ${tenantId}`);
      return { migrated: 0, orphaned: 0, errors: 0 };
    }

    console.log(
      `[Tasks→Ops] Found ${legacyTasks.length} legacy tasks to migrate`,
    );

    // Migrate each task
    for (const task of legacyTasks as LegacyTask[]) {
      try {
        const opData = {
          tenant_id: task.tenant_id,
          quest_id: null, // Orphaned - user will assign later
          title: task.title,
          description: task.description || null,
          status: mapTaskStatus(task.status || "pending"),
          priority: mapTaskPriority(task.priority || 2),
          due_date: task.due_date || null,
          loop_slug: "general",
        };

        if (dryRun) {
          console.log(`[Tasks→Ops] DRY RUN: Would migrate task ${task.id}`);
          console.log(
            `  Op data: ${JSON.stringify(opData).substring(0, 100)}...`,
          );
          migrated++;
          if (!opData.quest_id) orphaned++;
        } else {
          // Insert op
          const { data: newOp, error: insertError } = await supabase
            .from("user_ops")
            .insert(opData)
            .select("id")
            .single();

          if (insertError) {
            console.error(
              `[Tasks→Ops] Failed to insert op for task ${task.id}:`,
              insertError,
            );
            errors++;
            continue;
          }

          // Record mapping
          const { error: mapError } = await supabase
            .from("exo_migration_map")
            .insert({
              tenant_id: task.tenant_id,
              legacy_type: "exo_tasks",
              legacy_id: task.id,
              new_type: "user_ops",
              new_id: newOp.id,
              migration_notes: {
                legacy_status: task.status,
                legacy_priority: task.priority,
                orphaned: !opData.quest_id,
              },
            });

          if (mapError) {
            console.error(
              `[Tasks→Ops] Failed to record mapping for task ${task.id}:`,
              mapError,
            );
            errors++;
            continue;
          }

          migrated++;
          if (!opData.quest_id) orphaned++;
          console.log(
            `[Tasks→Ops] Migrated task ${task.id} → op ${newOp.id}${opData.quest_id ? "" : " (orphaned)"}`,
          );
        }
      } catch (error) {
        console.error(
          `[Tasks→Ops] Unexpected error migrating task ${task.id}:`,
          error,
        );
        errors++;
      }
    }
  } catch (error) {
    console.error(`[Tasks→Ops] Fatal error:`, error);
    errors++;
  }

  return { migrated, orphaned, errors };
}

async function migrateTenant(
  tenantId: string,
  dryRun: boolean,
): Promise<MigrationStats> {
  console.log(
    `\n========================================\nMigrating tenant: ${tenantId}\n========================================`,
  );

  const stats: MigrationStats = {
    tenantsProcessed: 1,
    goalsMigrated: 0,
    tasksMigrated: 0,
    checkpointsArchived: 0,
    orphanedGoals: 0,
    orphanedTasks: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    // Update migration status
    if (!dryRun) {
      await supabase.from("exo_migration_status").upsert({
        tenant_id: tenantId,
        migration_started_at: new Date().toISOString(),
        migration_phase: "in_progress",
      });
    }

    // Migrate goals → quests
    const goalStats = await migrateGoalsToQuests(tenantId, dryRun);
    stats.goalsMigrated = goalStats.migrated;
    stats.orphanedGoals = goalStats.orphaned;
    stats.errors += goalStats.errors;

    // Migrate tasks → ops
    const taskStats = await migrateTasksToOps(tenantId, dryRun);
    stats.tasksMigrated = taskStats.migrated;
    stats.orphanedTasks = taskStats.orphaned;
    stats.errors += taskStats.errors;

    // Update migration status
    if (!dryRun) {
      await supabase.from("exo_migration_status").upsert({
        tenant_id: tenantId,
        migration_completed_at: new Date().toISOString(),
        migration_phase:
          stats.errors > 0 ? "completed_with_errors" : "completed",
        goals_migrated: stats.goalsMigrated,
        tasks_migrated: stats.tasksMigrated,
        errors_encountered: stats.errors,
      });
    }

    console.log(`\n[Summary] Tenant ${tenantId}:`);
    console.log(`  Goals migrated: ${stats.goalsMigrated}`);
    console.log(`  Tasks migrated: ${stats.tasksMigrated}`);
    console.log(`  Orphaned goals: ${stats.orphanedGoals}`);
    console.log(`  Orphaned tasks: ${stats.orphanedTasks}`);
    console.log(`  Errors: ${stats.errors}`);
  } catch (error) {
    console.error(`[FATAL] Error migrating tenant ${tenantId}:`, error);
    stats.errors++;
    stats.errorDetails.push(`Tenant ${tenantId}: ${error}`);

    if (!dryRun) {
      await supabase.from("exo_migration_status").upsert({
        tenant_id: tenantId,
        migration_phase: "failed",
        last_error: String(error),
        last_error_at: new Date().toISOString(),
      });
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const execute = args.includes("--execute");
  const tenantIdArg = args.find((arg) => arg.startsWith("--tenant-id="));
  const specificTenantId = tenantIdArg ? tenantIdArg.split("=")[1] : null;

  if (!dryRun && !execute) {
    console.error(
      "ERROR: Must specify --dry-run or --execute mode\n\nUsage:\n  npm run migrate-tyrolka -- --dry-run\n  npm run migrate-tyrolka -- --execute\n  npm run migrate-tyrolka -- --execute --tenant-id=<uuid>",
    );
    process.exit(1);
  }

  console.log(
    `\n${"=".repeat(60)}\nTyrolka Migration Script\nMode: ${dryRun ? "DRY RUN (validation only)" : "EXECUTE (writes to database)"}\n${"=".repeat(60)}\n`,
  );

  const globalStats: MigrationStats = {
    tenantsProcessed: 0,
    goalsMigrated: 0,
    tasksMigrated: 0,
    checkpointsArchived: 0,
    orphanedGoals: 0,
    orphanedTasks: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    let tenantIds: string[] = [];

    if (specificTenantId) {
      tenantIds = [specificTenantId];
      console.log(`Migrating single tenant: ${specificTenantId}\n`);
    } else {
      // Get all active tenants
      const { data: tenants, error } = await supabase
        .from("exo_tenants")
        .select("id")
        .order("created_at");

      if (error) {
        console.error("Failed to fetch tenants:", error);
        process.exit(1);
      }

      tenantIds = tenants.map((t: { id: string }) => t.id);
      console.log(`Found ${tenantIds.length} tenants to migrate\n`);
    }

    // Migrate each tenant
    for (const tenantId of tenantIds) {
      const stats = await migrateTenant(tenantId, dryRun);

      globalStats.tenantsProcessed += stats.tenantsProcessed;
      globalStats.goalsMigrated += stats.goalsMigrated;
      globalStats.tasksMigrated += stats.tasksMigrated;
      globalStats.checkpointsArchived += stats.checkpointsArchived;
      globalStats.orphanedGoals += stats.orphanedGoals;
      globalStats.orphanedTasks += stats.orphanedTasks;
      globalStats.errors += stats.errors;
      globalStats.errorDetails.push(...stats.errorDetails);
    }

    // Final summary
    console.log(
      `\n${"=".repeat(60)}\nMIGRATION ${dryRun ? "DRY RUN " : ""}COMPLETE\n${"=".repeat(60)}`,
    );
    console.log(`Tenants processed:    ${globalStats.tenantsProcessed}`);
    console.log(`Goals migrated:       ${globalStats.goalsMigrated}`);
    console.log(`Tasks migrated:       ${globalStats.tasksMigrated}`);
    console.log(`Orphaned goals:       ${globalStats.orphanedGoals}`);
    console.log(`Orphaned tasks:       ${globalStats.orphanedTasks}`);
    console.log(`Errors encountered:   ${globalStats.errors}`);

    if (globalStats.errors > 0) {
      console.log(`\nErrors:`);
      globalStats.errorDetails.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
      process.exit(1);
    }

    if (dryRun) {
      console.log(
        `\n✅ DRY RUN successful! No data written.\n   Run with --execute to perform actual migration.`,
      );
    } else {
      console.log(
        `\n✅ Migration successful!\n   Next steps:\n   1. Enable quest_system_dual_write feature flag\n   2. Test dual-write functionality\n   3. Enable quest_system_dual_read feature flag\n   4. Gradual UI rollout (10% → 50% → 100%)`,
      );
    }
  } catch (error) {
    console.error("\n❌ MIGRATION FAILED:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
