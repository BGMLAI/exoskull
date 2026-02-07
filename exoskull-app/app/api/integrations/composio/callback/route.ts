/**
 * Composio OAuth Callback
 *
 * After user completes OAuth on Composio's hosted page,
 * they're redirected here. We show a success page.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ExoSkull — Połączono!</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #0a0a0a; color: #e5e5e5;
    }
    .card {
      text-align: center; padding: 3rem;
      background: #1a1a1a; border-radius: 1rem;
      border: 1px solid #333; max-width: 400px;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
    p { color: #999; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10004;</div>
    <h1>Połączono!</h1>
    <p>Możesz zamknąć tę stronę i wrócić do rozmowy.</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
