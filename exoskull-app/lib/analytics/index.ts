/**
 * Analytics Module
 *
 * Unified exports for ExoSkull analytics functionality.
 *
 * Architecture:
 * - Bronze: Raw Parquet files on R2 (queryable via DuckDB)
 * - Silver: Cleaned data in Postgres (exo_silver_* tables)
 * - Gold: Pre-aggregated materialized views (exo_gold_* views)
 *
 * Query Priority:
 * 1. Gold layer (<100ms) - Use for dashboards
 * 2. Silver layer (<500ms) - Use for real-time needs
 * 3. Bronze layer (seconds-minutes) - Use for ad-hoc analysis
 */

// DuckDB Client for Bronze layer analytics
export {
  getBronzeFiles,
  getBronzeSize,
  aggregateBronzeData,
  generateDuckDBSQL,
  getDuckDBConfig,
  ANALYTICS_QUERIES,
  type QueryResult as DuckDBQueryResult,
  type BronzeQueryParams,
  type AggregationResult,
  type AnalyticsQuery,
} from './duckdb-client'

// Pre-built queries for dashboards
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
} from './queries'

/**
 * Recommended usage patterns:
 *
 * 1. Dashboard widgets:
 *    ```ts
 *    import { getDailySummary } from '@/lib/analytics'
 *    const { data } = await getDailySummary(tenantId, 30)
 *    ```
 *
 * 2. Real-time stats:
 *    ```ts
 *    import { getRealTimeStats } from '@/lib/analytics'
 *    const { data } = await getRealTimeStats(tenantId)
 *    ```
 *
 * 3. Period comparisons:
 *    ```ts
 *    import { getPeriodComparison } from '@/lib/analytics'
 *    const { data } = await getPeriodComparison(tenantId, 7)
 *    ```
 *
 * 4. Ad-hoc Bronze queries (generate SQL for DuckDB):
 *    ```ts
 *    import { generateDuckDBSQL, ANALYTICS_QUERIES } from '@/lib/analytics'
 *    const sql = generateDuckDBSQL(ANALYTICS_QUERIES.dailyConversations(tenantId))
 *    ```
 */
