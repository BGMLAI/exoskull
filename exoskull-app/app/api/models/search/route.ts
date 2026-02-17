/**
 * Sketchfab Search Proxy — hides API key server-side.
 *
 * GET /api/models/search?q=robot&maxVertices=50000
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SKETCHFAB_API = "https://api.sketchfab.com/v3";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const maxVertices = searchParams.get("maxVertices") || "50000";

    if (!query) {
      return NextResponse.json(
        { error: "Missing query parameter 'q'" },
        { status: 400 },
      );
    }

    const apiKey = process.env.SKETCHFAB_API_KEY;

    // Build Sketchfab search URL
    const sfParams = new URLSearchParams({
      type: "models",
      q: query,
      downloadable: "true",
      max_vertex_count: maxVertices,
      sort_by: "-relevance",
      count: "20",
    });

    const headers: HeadersInit = {
      Accept: "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Token ${apiKey}`;
    }

    const res = await fetch(`${SKETCHFAB_API}/search?${sfParams}`, { headers });

    if (!res.ok) {
      console.error(
        "[SketchfabProxy] API error:",
        res.status,
        await res.text(),
      );
      return NextResponse.json(
        { error: "Sketchfab API error", status: res.status },
        { status: 502 },
      );
    }

    const data = await res.json();

    // Transform to our format
    const models = (data.results || []).map((m: Record<string, unknown>) => {
      const thumbnails = m.thumbnails as {
        images?: Array<{ url: string; width: number }>;
      };
      const thumb =
        thumbnails?.images?.find((i) => i.width >= 200)?.url ||
        thumbnails?.images?.[0]?.url ||
        "";
      const user = m.user as { displayName?: string; profileUrl?: string };

      return {
        uid: m.uid,
        name: m.name,
        thumbnailUrl: thumb,
        viewerUrl: m.viewerUrl,
        vertexCount: m.vertexCount || 0,
        faceCount: m.faceCount || 0,
        isDownloadable: m.isDownloadable,
        license: (m.license as { label?: string })?.label,
        user: {
          displayName: user?.displayName || "Unknown",
          profileUrl: user?.profileUrl || "",
        },
      };
    });

    return NextResponse.json({
      models,
      totalCount: data.totalCount || models.length,
      next: data.next || null,
    });
  } catch (error) {
    console.error("[SketchfabProxy] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
