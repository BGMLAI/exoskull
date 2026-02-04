/**
 * Environment Variable Validation
 *
 * Validates required environment variables at startup.
 * Logs warnings for optional but recommended vars.
 */

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const RECOMMENDED_VARS = [
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of REQUIRED_VARS) {
    if (!process.env[v]) {
      missing.push(v);
    }
  }

  for (const v of RECOMMENDED_VARS) {
    if (!process.env[v]) {
      warnings.push(v);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[EnvCheck] CRITICAL: Missing required env vars: ${missing.join(", ")}`,
    );
  }

  if (warnings.length > 0) {
    console.warn(
      `[EnvCheck] Missing recommended env vars: ${warnings.join(", ")}`,
    );
  }

  if (missing.length === 0) {
    console.log("[EnvCheck] All required environment variables present");
  }
}
