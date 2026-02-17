import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
});
