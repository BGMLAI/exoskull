import type { Metadata } from "next";
import { ChatView } from "@/components/stream/ChatView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Integracje" };

/**
 * K224: Integrations page — chat-driven.
 * AI discovers and connects services via SuperIntegrator.
 */
export default function IntegrationsPage() {
  return (
    <ChatView initialMessage="Jakie integracje mam aktywne? Co mogę podłączyć?" />
  );
}
