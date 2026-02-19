import type { Metadata } from "next";
import { AppGallery } from "@/components/apps/AppGallery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aplikacje" };

export default function AppsPage() {
  return <AppGallery />;
}
