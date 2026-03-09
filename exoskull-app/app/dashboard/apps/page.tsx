import type { Metadata } from "next";
import { ChatView } from "@/components/stream/ChatView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aplikacje" };

/**
 * K224: Apps page — chat-driven.
 * AI uses build_app tool to create and list user apps.
 */
export default function AppsPage() {
  return (
    <ChatView initialMessage="Pokaż moje aplikacje — co zostało zbudowane?" />
  );
}
