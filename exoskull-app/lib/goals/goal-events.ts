/**
 * Goal Events — Centralized event-driven communication for goal state changes.
 *
 * Instead of fixed morning/evening messages, goals emit events when state changes.
 * Each event evaluates whether the user should be notified.
 */

import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { canSendProactive } from "@/lib/autonomy/outbound-triggers";
import { logger } from "@/lib/logger";
import type { Trajectory } from "./types";

// ============================================================================
// EVENT TYPES
// ============================================================================

export type GoalEventType =
  | "goal_milestone_reached"
  | "goal_trajectory_changed"
  | "goal_deadline_approaching"
  | "goal_strategy_step_completed"
  | "goal_blocked"
  | "goal_completed";

export interface GoalEvent {
  type: GoalEventType;
  tenantId: string;
  goalId: string;
  goalName: string;
  data: Record<string, unknown>;
}

// ============================================================================
// EVENT EMITTERS
// ============================================================================

/**
 * Emit a goal event. Evaluates whether to notify user.
 */
export async function emitGoalEvent(event: GoalEvent): Promise<void> {
  try {
    // Check if user can receive messages
    if (!(await canSendProactive(event.tenantId))) return;

    const message = formatGoalEventMessage(event);
    if (!message) return;

    await sendProactiveMessage(
      event.tenantId,
      message,
      event.type,
      "goal-events",
    );

    logger.info("[GoalEvents] Event emitted:", {
      type: event.type,
      tenantId: event.tenantId,
      goalId: event.goalId,
    });
  } catch (error) {
    logger.error("[GoalEvents] Failed to emit event:", {
      type: event.type,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Emit milestone reached event (25%, 50%, 75%, 100%).
 */
export async function emitMilestoneReached(
  tenantId: string,
  goalId: string,
  goalName: string,
  milestone: number,
): Promise<void> {
  await emitGoalEvent({
    type: "goal_milestone_reached",
    tenantId,
    goalId,
    goalName,
    data: { milestone },
  });
}

/**
 * Emit trajectory change event.
 */
export async function emitTrajectoryChanged(
  tenantId: string,
  goalId: string,
  goalName: string,
  oldTrajectory: Trajectory,
  newTrajectory: Trajectory,
): Promise<void> {
  // Only notify on meaningful changes
  if (oldTrajectory === newTrajectory) return;
  const worsening =
    (oldTrajectory === "on_track" && newTrajectory !== "on_track") ||
    (oldTrajectory === "at_risk" && newTrajectory === "off_track");

  // Always notify on worsening, skip on minor improvements
  if (!worsening && newTrajectory !== "on_track") return;

  await emitGoalEvent({
    type: "goal_trajectory_changed",
    tenantId,
    goalId,
    goalName,
    data: { oldTrajectory, newTrajectory, worsening },
  });
}

/**
 * Emit deadline approaching event (7d, 3d, 1d).
 */
export async function emitDeadlineApproaching(
  tenantId: string,
  goalId: string,
  goalName: string,
  daysRemaining: number,
  progressPercent: number,
): Promise<void> {
  if (![7, 3, 1].includes(daysRemaining)) return;

  await emitGoalEvent({
    type: "goal_deadline_approaching",
    tenantId,
    goalId,
    goalName,
    data: { daysRemaining, progressPercent },
  });
}

/**
 * Emit goal completed event.
 */
export async function emitGoalCompleted(
  tenantId: string,
  goalId: string,
  goalName: string,
): Promise<void> {
  await emitGoalEvent({
    type: "goal_completed",
    tenantId,
    goalId,
    goalName,
    data: {},
  });
}

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

function formatGoalEventMessage(event: GoalEvent): string | null {
  switch (event.type) {
    case "goal_milestone_reached": {
      const m = event.data.milestone as number;
      if (m === 100) {
        return `Cel "${event.goalName}" osiągnięty! Gratulacje!`;
      }
      return `Cel "${event.goalName}": ${m}% ukończone! Tak trzymaj!`;
    }

    case "goal_trajectory_changed": {
      const { newTrajectory, worsening } = event.data;
      if (worsening) {
        return `Cel "${event.goalName}" wymaga uwagi — status zmienił się na ${
          newTrajectory === "off_track" ? "wypadł z toru" : "zagrożony"
        }. Co mogę zrobić, żeby pomóc?`;
      }
      if (newTrajectory === "on_track") {
        return `Cel "${event.goalName}" wrócił na dobrą drogę!`;
      }
      return null;
    }

    case "goal_deadline_approaching": {
      const { daysRemaining, progressPercent } = event.data;
      const days = daysRemaining as number;
      const pct = Math.round(progressPercent as number);
      if (days === 1) {
        return `Jutro mija termin celu "${event.goalName}" (${pct}% ukończone). Czas na sprint?`;
      }
      return `Cel "${event.goalName}": ${days} dni do terminu, ${pct}% ukończone.`;
    }

    case "goal_strategy_step_completed": {
      return null; // Silent — strategy engine handles its own notifications
    }

    case "goal_blocked": {
      return `Cel "${event.goalName}" nie ma postępu od 3+ dni. Chcesz zmienić podejście?`;
    }

    case "goal_completed": {
      return `Cel "${event.goalName}" osiągnięty! Co dalej?`;
    }

    default:
      return null;
  }
}
