/**
 * Claude Agent SDK integration for ExoSkull
 *
 * Provides:
 * - IORS MCP Server: wraps 60+ tools for SDK consumption
 * - ExoSkull Agent: orchestrator that replaces processUserMessage
 *
 * Usage:
 *   import { runExoSkullAgent } from "@/lib/agent-sdk";
 *
 *   const result = await runExoSkullAgent({
 *     tenantId: "...",
 *     sessionId: "...",
 *     userMessage: "Dodaj zadanie: napisać raport",
 *     channel: "web_chat",
 *     onTextDelta: (delta) => stream.write(delta),
 *     onToolStart: (name) => stream.write(JSON.stringify({ type: "tool_start", name })),
 *   });
 */

export { runExoSkullAgent, type AgentChannel } from "./exoskull-agent";
