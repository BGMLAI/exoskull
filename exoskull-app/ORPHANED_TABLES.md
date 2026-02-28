# Orphaned Tables

Tables that exist in Supabase migrations but are NOT referenced in application code.
Do NOT delete these — they may be needed for future phases or contain historical data.

**Generated:** 2026-02-28
**Method:** Cross-referenced `supabase/migrations/*.sql` CREATE TABLE statements against all `.from("table")` calls in `lib/`, `app/`, `components/`.

## Likely Legacy (pre-refactor schema)

These appear to be from an older schema before the `exo_` prefix convention:

| Table           | Notes                                                 |
| --------------- | ----------------------------------------------------- |
| `agents`        | Replaced by `exo_agents`                              |
| `agent_memory`  | Replaced by `exo_vector_embeddings` + knowledge graph |
| `conversations` | Replaced by `exo_conversations`                       |
| `health_logs`   | Replaced by `exo_health_metrics`                      |
| `notifications` | Replaced by `exo_notifications`                       |
| `patterns`      | Replaced by `user_patterns`                           |
| `projects`      | Replaced by `exo_projects`                            |
| `tasks`         | Replaced by `exo_tasks`                               |
| `tenants`       | Replaced by `exo_tenants`                             |
| `tenant_agents` | Replaced by `exo_agents`                              |

## GoHighLevel Integration (unused)

GHL integration was built but never activated:

| Table                  | Notes                  |
| ---------------------- | ---------------------- |
| `exo_ghl_appointments` | GHL appointments sync  |
| `exo_ghl_connections`  | GHL OAuth connections  |
| `exo_ghl_contacts`     | GHL contacts sync      |
| `exo_ghl_messages`     | GHL messages           |
| `exo_ghl_oauth_states` | GHL OAuth state        |
| `exo_ghl_social_posts` | GHL social media posts |
| `exo_ghl_webhook_log`  | GHL webhook events     |

## Silver Layer (ETL views)

Silver schema tables — may be materialized views or ETL targets:

| Table                        | Notes                     |
| ---------------------------- | ------------------------- |
| `silver.conversations_clean` | ETL cleaned conversations |
| `silver.messages_clean`      | ETL cleaned messages      |
| `silver.sms_logs_clean`      | ETL cleaned SMS logs      |
| `silver.sync_log`            | Silver ETL sync tracking  |
| `silver.voice_calls_clean`   | ETL cleaned voice calls   |

## Other Unused

| Table                     | Notes                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| `admin_cron_dependencies` | CRON job dependency tracking                                        |
| `exo_campaigns`           | Marketing campaigns (drip engine uses `exo_campaign_sends`)         |
| `exo_challenges`          | Gamification challenges                                             |
| `exo_commands`            | Command registry                                                    |
| `exo_event_triggers`      | Event-driven automation triggers                                    |
| `exo_integration_tokens`  | Integration token storage (code uses `exo_rig_connections` instead) |
| `exo_mcp_servers`         | MCP server registry                                                 |
| `exo_memory_digests`      | Memory digest summaries                                             |
| `exo_migration_status`    | Schema migration tracking                                           |
| `exo_plugins`             | Plugin registry                                                     |
| `exo_user_job_consents`   | User job consent tracking                                           |
| `exo_widget_interactions` | Widget interaction analytics                                        |

## Action Items

- [ ] Verify silver.\* tables are used by ETL Edge Functions (not in Next.js code)
- [ ] Consider dropping legacy tables (agents, tasks, etc.) after confirming no data loss
- [ ] GHL tables can be dropped if GHL integration is permanently abandoned
- [ ] `exo_integration_tokens` may be needed for Phase 1 AI Superintegrator → review before dropping
