/**
 * GET /api/apps/[slug]/download — Download generated app
 *
 * Formats:
 *   ?format=html (default) — Standalone HTML with embedded data
 *   ?format=zip — ZIP bundle (app.html, schema.sql, data.json, README.md)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;
  const { slug } = await params;

  if (!slug || slug.length > 100) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get("format") || "html";
  const supabase = getServiceSupabase();

  // Fetch app config
  const { data: app } = await supabase
    .from("exo_generated_apps")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  // Fetch HTML from organism_knowledge
  const { data: htmlRecord } = await supabase
    .from("exo_organism_knowledge")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("category", "generated_app")
    .eq("source", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const html = htmlRecord?.content || null;

  // Fetch current data
  let entries: Record<string, unknown>[] = [];
  try {
    const { data } = await supabase
      .from(app.table_name)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1000);
    entries = data || [];
  } catch (e) {
    logger.warn("[Download] Failed to fetch entries:", e);
  }

  const appName = app.name || slug;
  const columns = (app.columns || []) as Array<{
    name: string;
    type: string;
    description?: string;
  }>;

  if (format === "zip") {
    return handleZipDownload(appName, slug, html, app, columns, entries);
  }

  // Default: HTML download
  return handleHtmlDownload(appName, slug, html, entries);
}

function handleHtmlDownload(
  appName: string,
  slug: string,
  html: string | null,
  entries: Record<string, unknown>[],
) {
  if (!html) {
    return NextResponse.json(
      { error: "No HTML frontend found for this app" },
      { status: 404 },
    );
  }

  // Inject embedded data into HTML — replace API fetch with local data
  const dataScript = `<script>
// Embedded data — this app works offline without API
const EMBEDDED_DATA = ${JSON.stringify(entries, null, 2)};
const EMBEDDED_MODE = true;
</script>`;

  // Inject before </head> or at start of <body>
  let standalone = html;
  if (html.includes("</head>")) {
    standalone = html.replace("</head>", `${dataScript}\n</head>`);
  } else if (html.includes("<body")) {
    standalone = html.replace("<body", `${dataScript}\n<body`);
  } else {
    standalone = dataScript + "\n" + html;
  }

  // Add comment about offline mode
  standalone = standalone.replace(
    "<!DOCTYPE html>",
    `<!DOCTYPE html>\n<!-- ${appName} — exported from ExoSkull (${new Date().toISOString()}) -->`,
  );

  const safeFilename = slug.replace(/[^a-z0-9-]/g, "-");
  return new Response(standalone, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename}.html"`,
    },
  });
}

async function handleZipDownload(
  appName: string,
  slug: string,
  html: string | null,
  app: Record<string, unknown>,
  columns: Array<{ name: string; type: string; description?: string }>,
  entries: Record<string, unknown>[],
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // 1. app.html
  if (html) {
    zip.file("app.html", html);
  }

  // 2. schema.sql
  const schemaSql = app.schema_sql as string | undefined;
  if (schemaSql) {
    zip.file("schema.sql", schemaSql);
  } else {
    // Generate schema from columns
    const colDefs = columns.map((c) => `  ${c.name} ${c.type}`).join(",\n");
    const generatedSchema = `-- Auto-generated schema for ${appName}\nCREATE TABLE ${app.table_name} (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  tenant_id UUID NOT NULL,\n${colDefs},\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n`;
    zip.file("schema.sql", generatedSchema);
  }

  // 3. data.json
  zip.file("data.json", JSON.stringify(entries, null, 2));

  // 4. README.md
  const readme = `# ${appName}

Exported from ExoSkull on ${new Date().toISOString()}.

## Files
- \`app.html\` — Standalone frontend (open in browser)
- \`schema.sql\` — Database schema (PostgreSQL)
- \`data.json\` — Current data (${entries.length} entries)

## Columns
${columns.map((c) => `- **${c.name}** (${c.type})${c.description ? ` — ${c.description}` : ""}`).join("\n")}

## Usage
1. Open \`app.html\` in any browser to view the app
2. Use \`schema.sql\` to recreate the database table
3. Import \`data.json\` into your database
`;
  zip.file("README.md", readme);

  const buffer = await zip.generateAsync({ type: "uint8array" });
  const safeFilename = slug.replace(/[^a-z0-9-]/g, "-");

  return new Response(buffer as unknown as Blob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename}.zip"`,
    },
  });
}
