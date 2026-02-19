import type { Metadata } from "next";
import { IntegrationHub } from "@/components/integrations/IntegrationHub";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Integracje" };

export default function IntegrationsPage() {
  return <IntegrationHub />;
}
