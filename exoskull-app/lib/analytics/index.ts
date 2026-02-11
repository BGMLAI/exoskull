/**
 * Analytics Module
 *
 * Query Priority:
 * 1. Gold layer (<100ms) - Pre-aggregated materialized views
 * 2. Silver layer (<500ms) - Cleaned data for real-time needs
 */

export {
  getDailySummary,
  getWeeklySummary,
  getMonthlySummary,
  getMessagesDailySummary,
  getRealTimeStats,
  getRecentConversations,
  getConversationInsights,
  getPeriodComparison,
  type DailySummary,
  type WeeklySummary,
  type MonthlySummary,
  type MessageDailySummary,
  type ConversationInsight,
  type QueryResult,
} from "./queries";
