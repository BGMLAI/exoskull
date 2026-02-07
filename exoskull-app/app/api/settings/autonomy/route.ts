/**
 * Autonomy Permissions Settings API
 *
 * GET:   List all permissions for the authenticated user
 * PATCH: Update a specific permission (grant/revoke/modify)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listPermissions,
  grantPermission,
  revokePermission,
} from "@/lib/iors/autonomy";
import type { AutonomyActionType, AutonomyDomain } from "@/lib/iors/types";

export const dynamic = "force-dynamic";

const VALID_ACTIONS: AutonomyActionType[] = [
  "log",
  "message",
  "schedule",
  "call",
  "create_mod",
  "purchase",
  "cancel",
  "share_data",
];

const VALID_DOMAINS: AutonomyDomain[] = [
  "health",
  "finance",
  "work",
  "social",
  "home",
  "business",
  "*",
];

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permissions = await listPermissions(user.id);
    return NextResponse.json({ permissions });
  } catch (error) {
    console.error("[AutonomyAPI] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      action_type,
      domain,
      granted,
      requires_confirmation,
      threshold_amount,
    } = body;

    if (!action_type || !VALID_ACTIONS.includes(action_type)) {
      return NextResponse.json(
        { error: "Invalid action_type" },
        { status: 400 },
      );
    }

    const permDomain: AutonomyDomain = VALID_DOMAINS.includes(domain)
      ? domain
      : "*";

    if (granted === false) {
      await revokePermission(user.id, action_type, permDomain);
    } else {
      await grantPermission(user.id, action_type, permDomain, {
        requires_confirmation: requires_confirmation ?? false,
        threshold_amount: threshold_amount ?? null,
        granted_via: "settings",
      });
    }

    const permissions = await listPermissions(user.id);
    return NextResponse.json({ permissions });
  } catch (error) {
    console.error("[AutonomyAPI] PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
