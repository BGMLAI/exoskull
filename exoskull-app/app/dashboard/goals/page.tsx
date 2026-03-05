import type { Metadata } from "next";
import { ChatView } from "@/components/stream/ChatView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cele" };

/**
 * K224: Goals page — chat-driven.
 * AI uses get_goals/set_goal/update_goal tools to manage goals.
 */
export default function GoalsPage() {
  return <ChatView initialMessage="Pokaż moje aktywne cele i ich postęp." />;
}
