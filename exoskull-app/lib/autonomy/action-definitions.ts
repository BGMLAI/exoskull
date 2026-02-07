/**
 * Action Definitions — static registry of available action types.
 */

import { ActionType, ActionDefinition, PermissionCategory } from "./types";

export const ACTION_DEFINITIONS: Record<ActionType, ActionDefinition> = {
  send_sms: {
    type: "send_sms",
    name: "Send SMS",
    description: "Send an SMS message",
    requiredParams: ["to", "message"],
    optionalParams: ["scheduledFor"],
    category: "communication",
    riskLevel: "medium",
  },
  send_email: {
    type: "send_email",
    name: "Send Email",
    description: "Send an email",
    requiredParams: ["to", "subject", "body"],
    optionalParams: ["cc", "bcc", "replyTo"],
    category: "communication",
    riskLevel: "medium",
  },
  create_task: {
    type: "create_task",
    name: "Create Task",
    description: "Create a new task",
    requiredParams: ["title"],
    optionalParams: ["description", "dueDate", "priority", "labels"],
    category: "tasks",
    riskLevel: "low",
  },
  complete_task: {
    type: "complete_task",
    name: "Complete Task",
    description: "Mark a task as complete",
    requiredParams: ["taskId"],
    optionalParams: ["notes"],
    category: "tasks",
    riskLevel: "low",
  },
  create_event: {
    type: "create_event",
    name: "Create Calendar Event",
    description: "Create a new calendar event",
    requiredParams: ["title", "startTime"],
    optionalParams: ["endTime", "description", "location", "attendees"],
    category: "calendar",
    riskLevel: "medium",
  },
  send_notification: {
    type: "send_notification",
    name: "Send Notification",
    description: "Send a push notification",
    requiredParams: ["title", "body"],
    optionalParams: ["data", "imageUrl", "actionUrl"],
    category: "communication",
    riskLevel: "low",
  },
  log_health: {
    type: "log_health",
    name: "Log Health Data",
    description: "Log health metrics",
    requiredParams: ["metricType", "value"],
    optionalParams: ["unit", "notes", "timestamp"],
    category: "health",
    riskLevel: "low",
  },
  trigger_checkin: {
    type: "trigger_checkin",
    name: "Trigger Check-in",
    description: "Trigger a user check-in",
    requiredParams: ["checkinType"],
    optionalParams: ["message", "questions"],
    category: "communication",
    riskLevel: "low",
  },
  run_automation: {
    type: "run_automation",
    name: "Run Automation",
    description: "Run a custom automation",
    requiredParams: ["automationId"],
    optionalParams: ["params"],
    category: "other",
    riskLevel: "high",
  },
  custom: {
    type: "custom",
    name: "Custom Action",
    description: "Execute a custom action",
    requiredParams: ["actionName"],
    optionalParams: ["params"],
    category: "other",
    riskLevel: "high",
  },
};

export function getActionDefinition(
  type: ActionType,
): ActionDefinition | undefined {
  return ACTION_DEFINITIONS[type];
}

export function getAllActionDefinitions(): ActionDefinition[] {
  return Object.values(ACTION_DEFINITIONS);
}

export function getActionsByCategory(
  category: PermissionCategory,
): ActionDefinition[] {
  return Object.values(ACTION_DEFINITIONS).filter(
    (a) => a.category === category,
  );
}
