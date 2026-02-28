/**
 * Federation API — Enables cross-tenant IORS cooperation.
 *
 * POST /api/iors/federation
 *   Actions: register, discover, handshake, accept, delegate, ping
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  registerAsPeer,
  discoverPeers,
  initiateHandshake,
  acceptHandshake,
  delegateTask,
} from "@/lib/iors/federation";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case "register": {
        const result = await registerAsPeer(user.id, {
          displayName: body.display_name || "ExoSkull User",
          capabilities: body.capabilities || [],
          sharedSkills: body.shared_skills || [],
          location: body.location,
        });
        return NextResponse.json(result);
      }

      case "discover": {
        const peers = await discoverPeers(user.id, {
          capabilities: body.capabilities,
          limit: body.limit,
        });
        return NextResponse.json({ peers });
      }

      case "handshake": {
        const result = await initiateHandshake(user.id, body.peer_id);
        return NextResponse.json(result);
      }

      case "accept": {
        const result = await acceptHandshake(body.connection_id, user.id);
        return NextResponse.json(result);
      }

      case "delegate": {
        const result = await delegateTask(user.id, body.peer_id, {
          id: crypto.randomUUID(),
          description: body.description,
          requiredCapabilities: body.capabilities || [],
          context: body.context || {},
          maxTimeMs: body.max_time_ms || 60_000,
          reward: body.reward,
        });
        return NextResponse.json(result);
      }

      case "ping": {
        return NextResponse.json({
          status: "ok",
          timestamp: new Date().toISOString(),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
