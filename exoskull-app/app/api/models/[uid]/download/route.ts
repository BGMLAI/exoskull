/**
 * Sketchfab Model Download Proxy
 *
 * GET /api/models/[uid]/download — fetches the actual GLB download URL
 * from Sketchfab's API (requires API token) and returns it to the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const SKETCHFAB_API = "https://api.sketchfab.com/v3";

export const GET = withApiLog(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  try {
    const { uid } = await params;

    if (!uid || uid.length < 10) {
      return NextResponse.json({ error: "Invalid model UID" }, { status: 400 });
    }

    const apiKey = process.env.SKETCHFAB_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Sketchfab API key not configured" },
        { status: 503 },
      );
    }

    // Step 1: Request download info from Sketchfab
    const dlRes = await fetch(`${SKETCHFAB_API}/models/${uid}/download`, {
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!dlRes.ok) {
      const errText = await dlRes.text();
      logger.error(
        `[SketchfabDownload] API error for ${uid}:`,
        dlRes.status,
        errText,
      );

      if (dlRes.status === 403) {
        return NextResponse.json(
          { error: "Model not downloadable or API key lacks permissions" },
          { status: 403 },
        );
      }
      if (dlRes.status === 404) {
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      }

      return NextResponse.json(
        { error: "Sketchfab download API error" },
        { status: 502 },
      );
    }

    const dlData = await dlRes.json();

    // Sketchfab returns format variants: gltf, usdz, etc.
    // Prefer glTF (includes .glb binary)
    const gltf = dlData.gltf || dlData.glb;
    if (!gltf?.url) {
      // Fallback: try any available format
      const formats = Object.keys(dlData);
      const fallback = formats.length > 0 ? dlData[formats[0]] : null;
      if (!fallback?.url) {
        return NextResponse.json(
          { error: "No downloadable format available" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        url: fallback.url,
        format: formats[0],
        size: fallback.size || 0,
        expires: fallback.expires || 300,
      });
    }

    return NextResponse.json({
      url: gltf.url,
      format: "gltf",
      size: gltf.size || 0,
      expires: gltf.expires || 300,
    });
  } catch (error) {
    logger.error("[SketchfabDownload] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 },
    );
  }
});
