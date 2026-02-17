/**
 * Autonomy Permissions Settings API
 *
 * GET:   List all permissions for the authenticated user
 * PATCH: Update a specific permission (grant/revoke/modify)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  listPermissions,
  grantPermission,
  revokePermission,
} from "@/lib/iors/autonomy";
import type { AutonomyActionType, AutonomyDomain } from "@/lib/iors/types";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
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

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const permissions = await listPermissions(tenantId);
    return NextResponse.json({ permissions });
  } catch (error) {
    logger.error("[AutonomyAPI] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const PATCH = withApiLog(async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

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
      await revokePermission(tenantId, action_type, permDomain);
    } else {
      await grantPermission(tenantId, action_type, permDomain, {
        requires_confirmation: requires_confirmation ?? false,
        threshold_amount: threshold_amount ?? null,
        granted_via: "settings",
      });
    }

    const permissions = await listPermissions(tenantId);
    return NextResponse.json({ permissions });
  } catch (error) {
    logger.error("[AutonomyAPI] PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
