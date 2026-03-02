/**
 * Active Conversation Registry
 *
 * In-memory map of running conversations → AbortControllers.
 * Used by the pause API and the agent to register/abort conversations.
 *
 * Note: This is per-serverless-instance — in a multi-instance setup,
 * only the instance running the conversation can abort it.
 */

const activeConversations = new Map<string, AbortController>();

/**
 * Register a conversation's AbortController (called from gateway/agent).
 */
export function registerConversation(
  conversationKey: string,
  controller: AbortController,
): void {
  activeConversations.set(conversationKey, controller);
}

/**
 * Unregister a conversation (called after completion).
 */
export function unregisterConversation(conversationKey: string): void {
  activeConversations.delete(conversationKey);
}

/**
 * Try to abort a conversation. Returns true if found and aborted.
 */
export function abortConversation(conversationKey: string): boolean {
  const controller = activeConversations.get(conversationKey);
  if (controller) {
    controller.abort();
    activeConversations.delete(conversationKey);
    return true;
  }
  return false;
}

/**
 * Get the number of active conversations (for health check).
 */
export function getActiveConversationCount(): number {
  return activeConversations.size;
}
