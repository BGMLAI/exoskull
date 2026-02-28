import type { Metadata } from "next";
import { SpatialApp } from "@/components/spatial/SpatialApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ExoSkull" };

/**
 * Dashboard Page — Spatial Chat OS is the primary interface.
 */
export default function DashboardPage() {
  return <SpatialApp />;
}
