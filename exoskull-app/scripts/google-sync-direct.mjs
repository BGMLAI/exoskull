#!/usr/bin/env node
/**
 * Direct Google Sync Script
 *
 * Bypasses Next.js API routes — uses Supabase REST + Google APIs directly.
 * Run with: op run --env-file=.env.local -- node scripts/google-sync-direct.mjs
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TENANT_ID = process.env.SYNC_TENANT_ID || "be769cc4-43db-4b26-bcc2-046c6653e3b3";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

// ── Supabase helpers ──────────────────────────────────────────────

async function supabaseSelect(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!res.ok) throw new Error(`SELECT ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseUpdate(table, match, body) {
  const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`UPDATE ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseUpsert(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: `resolution=merge-duplicates,return=representation`,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`UPSERT ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Google OAuth token refresh ──────────────────────────────────

async function refreshGoogleToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Google Fit API ──────────────────────────────────────────────

async function fetchGoogleFitAggregate(accessToken, dataTypeName, startTimeMs, endTimeMs) {
  const res = await fetch(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName }],
        bucketByTime: { durationMillis: 86400000 }, // 1 day
        startTimeMillis: startTimeMs,
        endTimeMillis: endTimeMs,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.warn(`  Fit API ${dataTypeName}: ${res.status} ${err.slice(0, 200)}`);
    return [];
  }
  const data = await res.json();
  return data.bucket || [];
}

function extractFitValue(bucket, type) {
  const point = bucket.dataset?.[0]?.point?.[0];
  if (!point) return 0;
  const val = point.value?.[0];
  if (!val) return 0;
  // Steps/calories use intVal, heart rate uses fpVal
  return val.fpVal ?? val.intVal ?? 0;
}

async function getAllFitData(accessToken, days = 7) {
  const endTime = Date.now();
  const startTime = endTime - days * 86400000;

  console.log(`\nFetching Google Fit data (last ${days} days)...`);

  const [stepsBuckets, hrBuckets, calBuckets, sleepBuckets, distBuckets] = await Promise.all([
    fetchGoogleFitAggregate(accessToken, "com.google.step_count.delta", startTime, endTime),
    fetchGoogleFitAggregate(accessToken, "com.google.heart_rate.bpm", startTime, endTime),
    fetchGoogleFitAggregate(accessToken, "com.google.calories.expended", startTime, endTime),
    fetchGoogleFitAggregate(accessToken, "com.google.sleep.segment", startTime, endTime),
    fetchGoogleFitAggregate(accessToken, "com.google.distance.delta", startTime, endTime),
  ]);

  const toDate = (ms) => new Date(parseInt(ms)).toISOString().split("T")[0];

  const steps = stepsBuckets.map((b) => ({
    date: toDate(b.startTimeMillis),
    steps: extractFitValue(b, "steps"),
  }));

  const heartRate = hrBuckets.map((b) => ({
    date: toDate(b.startTimeMillis),
    bpm: Math.round(extractFitValue(b, "heartRate")),
  }));

  const calories = calBuckets.map((b) => ({
    date: toDate(b.startTimeMillis),
    calories: Math.round(extractFitValue(b, "calories")),
  }));

  const sleep = sleepBuckets.map((b) => ({
    date: toDate(b.startTimeMillis),
    durationMinutes: Math.round(extractFitValue(b, "sleep")),
  }));

  const distance = distBuckets.map((b) => ({
    date: toDate(b.startTimeMillis),
    meters: Math.round(extractFitValue(b, "distance")),
  }));

  return { steps, heartRate, calories, sleep, distance };
}

// ── Google Calendar API ──────────────────────────────────────────

async function getCalendarEvents(accessToken, days = 7) {
  const now = new Date();
  const timeMin = new Date(now.getTime() - days * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + days * 86400000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=50&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`  Calendar API: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return [];
  }
  const data = await res.json();
  return data.items || [];
}

// ── Google Gmail API ─────────────────────────────────────────────

async function getRecentEmails(accessToken, maxResults = 20) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`  Gmail API list: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return [];
  }
  const data = await res.json();
  const messageIds = (data.messages || []).slice(0, 10); // Fetch details for top 10

  const emails = [];
  for (const { id } of messageIds) {
    const mRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!mRes.ok) continue;
    const msg = await mRes.json();
    const headers = msg.payload?.headers || [];
    const getH = (name) => headers.find((h) => h.name === name)?.value || "";
    emails.push({
      id: msg.id,
      from: getH("From"),
      subject: getH("Subject"),
      date: getH("Date"),
      snippet: msg.snippet,
    });
  }
  return emails;
}

// ── Build health metrics for upsert ─────────────────────────────

function buildHealthMetrics(tenantId, fitData, source) {
  const metrics = [];
  const toRecordedAt = (date) => new Date(`${date}T00:00:00.000Z`).toISOString();

  for (const item of fitData.steps) {
    if (item.steps > 0) {
      metrics.push({ tenant_id: tenantId, metric_type: "steps", value: item.steps, unit: "count", recorded_at: toRecordedAt(item.date), source });
    }
  }
  for (const item of fitData.heartRate) {
    if (item.bpm > 0) {
      metrics.push({ tenant_id: tenantId, metric_type: "heart_rate", value: item.bpm, unit: "bpm", recorded_at: toRecordedAt(item.date), source });
    }
  }
  for (const item of fitData.calories) {
    if (item.calories > 0) {
      metrics.push({ tenant_id: tenantId, metric_type: "calories", value: item.calories, unit: "kcal", recorded_at: toRecordedAt(item.date), source });
    }
  }
  for (const item of fitData.sleep) {
    if (item.durationMinutes > 0) {
      metrics.push({ tenant_id: tenantId, metric_type: "sleep", value: item.durationMinutes, unit: "minutes", recorded_at: toRecordedAt(item.date), source });
    }
  }
  for (const item of fitData.distance) {
    if (item.meters > 0) {
      metrics.push({ tenant_id: tenantId, metric_type: "distance", value: item.meters, unit: "meters", recorded_at: toRecordedAt(item.date), source });
    }
  }
  return metrics;
}

// ── MAIN ─────────────────────────────────────────────────────────

async function main() {
  console.log("=== ExoSkull Google Sync (Direct) ===");
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Supabase: ${SUPABASE_URL}`);

  // 1. Get connection from DB
  console.log("\n1. Fetching rig connection...");
  const connections = await supabaseSelect(
    "exo_rig_connections",
    `tenant_id=eq.${TENANT_ID}&rig_slug=eq.google&select=*`
  );
  if (!connections.length) {
    console.error("No Google connection found for this tenant!");
    process.exit(1);
  }
  const conn = connections[0];
  console.log(`   Connection ID: ${conn.id}`);
  console.log(`   Last sync: ${conn.last_sync_at || "never"}`);
  console.log(`   Token expires: ${conn.expires_at}`);

  // 2. Refresh token if needed
  let accessToken = conn.access_token;
  const expiresAt = conn.expires_at ? new Date(conn.expires_at) : null;
  const fiveMinFromNow = new Date(Date.now() + 5 * 60000);

  if (!expiresAt || expiresAt < fiveMinFromNow) {
    console.log("\n2. Token expired/expiring — refreshing...");
    if (!conn.refresh_token) {
      console.error("No refresh_token available!");
      process.exit(1);
    }
    const tokens = await refreshGoogleToken(conn.refresh_token);
    accessToken = tokens.access_token;
    const newExpires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabaseUpdate("exo_rig_connections", { id: conn.id }, {
      access_token: accessToken,
      expires_at: newExpires,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    });
    console.log(`   Token refreshed, expires: ${newExpires}`);
  } else {
    console.log("\n2. Token still valid, skipping refresh.");
  }

  // 3. Mark as syncing
  await supabaseUpdate("exo_rig_connections", { id: conn.id }, {
    sync_status: "syncing",
    sync_error: null,
  });

  // 4. Fetch Google Fit data
  const fitData = await getAllFitData(accessToken, 7);

  console.log("\n   Fit Results:");
  for (const s of fitData.steps) console.log(`     ${s.date}: ${s.steps} steps`);
  for (const h of fitData.heartRate) console.log(`     ${h.date}: ${h.bpm} bpm`);
  for (const c of fitData.calories) console.log(`     ${c.date}: ${c.calories} kcal`);
  for (const sl of fitData.sleep) console.log(`     ${sl.date}: ${sl.durationMinutes} min sleep`);
  for (const d of fitData.distance) console.log(`     ${d.date}: ${d.meters} m`);

  // 5. Fetch Calendar events
  console.log("\nFetching Calendar events...");
  const events = await getCalendarEvents(accessToken, 7);
  console.log(`   Found ${events.length} events:`);
  for (const ev of events.slice(0, 10)) {
    const start = ev.start?.dateTime || ev.start?.date || "?";
    console.log(`     ${start} — ${ev.summary || "(no title)"}`);
  }

  // 6. Fetch recent emails
  console.log("\nFetching Gmail...");
  const emails = await getRecentEmails(accessToken, 20);
  console.log(`   Found ${emails.length} recent emails:`);
  for (const e of emails.slice(0, 5)) {
    console.log(`     ${e.from?.slice(0, 40)} — ${e.subject?.slice(0, 50)}`);
  }

  // 7. Upsert health metrics to DB
  const metrics = buildHealthMetrics(TENANT_ID, fitData, "google");
  if (metrics.length > 0) {
    console.log(`\n7. Upserting ${metrics.length} health metrics...`);
    try {
      await supabaseUpsert("exo_health_metrics", metrics, "tenant_id,metric_type,recorded_at,source");
      console.log(`   SUCCESS: ${metrics.length} metrics saved.`);
    } catch (err) {
      console.error(`   FAILED: ${err.message}`);
    }
  } else {
    console.log("\n7. No health metrics to upsert.");
  }

  // 8. Update connection status
  await supabaseUpdate("exo_rig_connections", { id: conn.id }, {
    sync_status: "success",
    sync_error: null,
    last_sync_at: new Date().toISOString(),
  });

  // 9. Log sync result
  const logEntry = {
    connection_id: conn.id,
    tenant_id: TENANT_ID,
    rig_slug: "google",
    success: true,
    records_synced: metrics.length + events.length + emails.length,
    duration_ms: 0,
    metadata: {
      fit_metrics: metrics.length,
      calendar_events: events.length,
      emails_fetched: emails.length,
      steps_today: fitData.steps.find((s) => s.date === new Date().toISOString().split("T")[0])?.steps || 0,
    },
  };

  try {
    await supabaseUpsert("exo_rig_sync_log", [logEntry]);
    console.log("\n8. Sync log recorded.");
  } catch (err) {
    console.warn(`   Sync log failed (non-critical): ${err.message}`);
  }

  console.log("\n=== SYNC COMPLETE ===");
  console.log(`Health metrics: ${metrics.length}`);
  console.log(`Calendar events: ${events.length}`);
  console.log(`Emails: ${emails.length}`);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
