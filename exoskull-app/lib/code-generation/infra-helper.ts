/**
 * Infrastructure Helper — Guides user through setting up external services.
 *
 * Used by IORS `configure_infra` tool to walk users through:
 * - Supabase project setup
 * - Vercel deployment
 * - Railway deployment
 * - Stripe payments
 * - Custom domain
 *
 * Returns step-by-step instructions tailored to the service.
 * The AI Superintegrator (Phase 1.2) handles the actual API connections;
 * this module provides the human-readable guide.
 */

import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type InfraService =
  | "supabase"
  | "vercel"
  | "railway"
  | "stripe"
  | "domain"
  | "vps";

export interface InfraStep {
  step: number;
  title: string;
  instruction: string;
  /** URL the user needs to visit */
  url?: string;
  /** Env var to set after this step */
  envVar?: string;
  /** Whether this step can be automated */
  automatable: boolean;
}

export interface InfraGuide {
  service: InfraService;
  title: string;
  steps: InfraStep[];
  currentStatus: "not_configured" | "partial" | "configured";
  missingEnvVars: string[];
}

// ============================================================================
// STATUS CHECK
// ============================================================================

/**
 * Check which infra services are configured by inspecting env vars.
 */
export function checkInfraStatus(): Record<
  InfraService,
  "not_configured" | "partial" | "configured"
> {
  return {
    supabase: checkSupabaseStatus(),
    vercel: checkVercelStatus(),
    railway: checkRailwayStatus(),
    stripe: checkStripeStatus(),
    domain: "not_configured", // Always needs manual setup
    vps: checkVPSStatus(),
  };
}

function checkSupabaseStatus(): "not_configured" | "partial" | "configured" {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && anon && service) return "configured";
  if (url || anon) return "partial";
  return "not_configured";
}

function checkVercelStatus(): "not_configured" | "partial" | "configured" {
  return process.env.VERCEL_TOKEN ? "configured" : "not_configured";
}

function checkRailwayStatus(): "not_configured" | "partial" | "configured" {
  return process.env.RAILWAY_TOKEN ? "configured" : "not_configured";
}

function checkStripeStatus(): "not_configured" | "partial" | "configured" {
  const sk = process.env.STRIPE_SECRET_KEY;
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (sk && pk) return "configured";
  if (sk || pk) return "partial";
  return "not_configured";
}

function checkVPSStatus(): "not_configured" | "partial" | "configured" {
  const url = process.env.VPS_EXECUTOR_URL;
  const secret = process.env.VPS_EXECUTOR_SECRET;
  if (url && secret) return "configured";
  if (url) return "partial";
  return "not_configured";
}

// ============================================================================
// GUIDES
// ============================================================================

/**
 * Get step-by-step setup guide for a service.
 */
export function getInfraGuide(service: InfraService): InfraGuide {
  const status = checkInfraStatus();

  switch (service) {
    case "supabase":
      return getSupabaseGuide(status.supabase);
    case "vercel":
      return getVercelGuide(status.vercel);
    case "railway":
      return getRailwayGuide(status.railway);
    case "stripe":
      return getStripeGuide(status.stripe);
    case "domain":
      return getDomainGuide();
    case "vps":
      return getVPSGuide(status.vps);
  }
}

function getSupabaseGuide(
  currentStatus: "not_configured" | "partial" | "configured",
): InfraGuide {
  const missingEnvVars: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    missingEnvVars.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    missingEnvVars.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    missingEnvVars.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    service: "supabase",
    title: "Supabase — Baza danych + Auth",
    currentStatus,
    missingEnvVars,
    steps: [
      {
        step: 1,
        title: "Utwórz konto Supabase",
        instruction: "Wejdź na supabase.com i załóż konto (darmowe).",
        url: "https://supabase.com/dashboard",
        automatable: false,
      },
      {
        step: 2,
        title: "Utwórz nowy projekt",
        instruction:
          'Kliknij "New Project", wybierz region (eu-central-1 dla PL), ustaw hasło do bazy.',
        url: "https://supabase.com/dashboard/new/project",
        automatable: false,
      },
      {
        step: 3,
        title: "Skopiuj klucze API",
        instruction:
          "Wejdź w Settings → API. Skopiuj Project URL, anon key, i service_role key.",
        url: "https://supabase.com/dashboard/project/_/settings/api",
        envVar:
          "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
        automatable: true,
      },
      {
        step: 4,
        title: "Wklej klucze do .env.local",
        instruction: "Dodaj skopiowane klucze do pliku .env.local w projekcie.",
        automatable: true,
      },
      {
        step: 5,
        title: "Uruchom migracje",
        instruction:
          "Wykonaj: npx supabase db push — to utworzy wszystkie tabele.",
        automatable: true,
      },
    ],
  };
}

function getVercelGuide(
  currentStatus: "not_configured" | "partial" | "configured",
): InfraGuide {
  const missingEnvVars: string[] = [];
  if (!process.env.VERCEL_TOKEN) missingEnvVars.push("VERCEL_TOKEN");

  return {
    service: "vercel",
    title: "Vercel — Deployment",
    currentStatus,
    missingEnvVars,
    steps: [
      {
        step: 1,
        title: "Utwórz konto Vercel",
        instruction: "Wejdź na vercel.com i załóż konto (darmowe, Hobby plan).",
        url: "https://vercel.com/signup",
        automatable: false,
      },
      {
        step: 2,
        title: "Wygeneruj token API",
        instruction:
          "Wejdź w Settings → Tokens → Create Token. Nazwa: ExoSkull, Scope: Full Account.",
        url: "https://vercel.com/account/tokens",
        envVar: "VERCEL_TOKEN",
        automatable: false,
      },
      {
        step: 3,
        title: "Wklej token do .env.local",
        instruction: 'Dodaj VERCEL_TOKEN="twoj_token" do .env.local.',
        automatable: true,
      },
    ],
  };
}

function getRailwayGuide(
  currentStatus: "not_configured" | "partial" | "configured",
): InfraGuide {
  const missingEnvVars: string[] = [];
  if (!process.env.RAILWAY_TOKEN) missingEnvVars.push("RAILWAY_TOKEN");

  return {
    service: "railway",
    title: "Railway — Backend Deployment",
    currentStatus,
    missingEnvVars,
    steps: [
      {
        step: 1,
        title: "Utwórz konto Railway",
        instruction: "Wejdź na railway.com i załóż konto (darmowe $5/mies.).",
        url: "https://railway.com",
        automatable: false,
      },
      {
        step: 2,
        title: "Wygeneruj token API",
        instruction: "Wejdź w Account Settings → Tokens → Create Token.",
        url: "https://railway.com/account/tokens",
        envVar: "RAILWAY_TOKEN",
        automatable: false,
      },
      {
        step: 3,
        title: "Wklej token do .env.local",
        instruction: 'Dodaj RAILWAY_TOKEN="twoj_token" do .env.local.',
        automatable: true,
      },
    ],
  };
}

function getStripeGuide(
  currentStatus: "not_configured" | "partial" | "configured",
): InfraGuide {
  const missingEnvVars: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) missingEnvVars.push("STRIPE_SECRET_KEY");
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    missingEnvVars.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");

  return {
    service: "stripe",
    title: "Stripe — Płatności",
    currentStatus,
    missingEnvVars,
    steps: [
      {
        step: 1,
        title: "Utwórz konto Stripe",
        instruction: "Wejdź na stripe.com i załóż konto.",
        url: "https://dashboard.stripe.com/register",
        automatable: false,
      },
      {
        step: 2,
        title: "Skopiuj klucze API",
        instruction:
          "Wejdź w Developers → API Keys. Skopiuj Publishable key i Secret key.",
        url: "https://dashboard.stripe.com/test/apikeys",
        envVar: "STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        automatable: false,
      },
      {
        step: 3,
        title: "Wklej klucze do .env.local",
        instruction:
          "Dodaj oba klucze do .env.local. Użyj test keys na początku.",
        automatable: true,
      },
      {
        step: 4,
        title: "Skonfiguruj webhook",
        instruction:
          "W Stripe Dashboard → Webhooks → Add endpoint. URL: https://twoja-domena.com/api/webhooks/stripe",
        url: "https://dashboard.stripe.com/test/webhooks",
        envVar: "STRIPE_WEBHOOK_SECRET",
        automatable: false,
      },
    ],
  };
}

function getDomainGuide(): InfraGuide {
  return {
    service: "domain",
    title: "Domena — Custom Domain",
    currentStatus: "not_configured",
    missingEnvVars: [],
    steps: [
      {
        step: 1,
        title: "Kup domenę",
        instruction:
          "Kup domenę na Cloudflare, Namecheap, lub innym rejestrze.",
        url: "https://www.cloudflare.com/products/registrar/",
        automatable: false,
      },
      {
        step: 2,
        title: "Skonfiguruj DNS",
        instruction:
          "Dodaj CNAME record wskazujący na Vercel/Railway deployment URL.",
        automatable: false,
      },
      {
        step: 3,
        title: "Dodaj domenę w Vercel/Railway",
        instruction:
          "W dashboardzie Vercel/Railway → Domains → Add Domain. Wpisz swoją domenę.",
        automatable: false,
      },
    ],
  };
}

function getVPSGuide(
  currentStatus: "not_configured" | "partial" | "configured",
): InfraGuide {
  const missingEnvVars: string[] = [];
  if (!process.env.VPS_EXECUTOR_URL) missingEnvVars.push("VPS_EXECUTOR_URL");
  if (!process.env.VPS_EXECUTOR_SECRET)
    missingEnvVars.push("VPS_EXECUTOR_SECRET");

  return {
    service: "vps",
    title: "VPS Executor — Docker Sandbox",
    currentStatus,
    missingEnvVars,
    steps: [
      {
        step: 1,
        title: "Utwórz VPS",
        instruction:
          "Utwórz VPS na DigitalOcean/Hetzner (min. 2GB RAM). Zainstaluj Docker.",
        automatable: false,
      },
      {
        step: 2,
        title: "Deploy executor",
        instruction:
          "Skopiuj vps-executor/ na VPS i uruchom: docker compose up -d",
        automatable: false,
      },
      {
        step: 3,
        title: "Skonfiguruj env",
        instruction:
          "Dodaj VPS_EXECUTOR_URL i VPS_EXECUTOR_SECRET do .env.local.",
        envVar: "VPS_EXECUTOR_URL, VPS_EXECUTOR_SECRET",
        automatable: true,
      },
    ],
  };
}

// ============================================================================
// FORMATTER
// ============================================================================

/**
 * Format an infra guide as a human-readable response for the chat.
 */
export function formatInfraGuide(guide: InfraGuide): string {
  let result = `## ${guide.title}\n\n`;
  result += `Status: **${guide.currentStatus === "configured" ? "Skonfigurowane" : guide.currentStatus === "partial" ? "Częściowo skonfigurowane" : "Nie skonfigurowane"}**\n\n`;

  if (guide.missingEnvVars.length > 0) {
    result += `Brakujące zmienne: ${guide.missingEnvVars.map((v) => `\`${v}\``).join(", ")}\n\n`;
  }

  for (const step of guide.steps) {
    result += `### Krok ${step.step}: ${step.title}\n`;
    result += `${step.instruction}\n`;
    if (step.url) {
      result += `Link: ${step.url}\n`;
    }
    if (step.envVar) {
      result += `Zmienna: \`${step.envVar}\`\n`;
    }
    result += "\n";
  }

  return result;
}

/**
 * Format all infra statuses as a summary.
 */
export function formatInfraOverview(): string {
  const statuses = checkInfraStatus();
  const statusIcon = (s: string) =>
    s === "configured" ? "OK" : s === "partial" ? "PARTIAL" : "---";

  let result = "## Infrastruktura — Status\n\n";
  result += "| Usługa | Status |\n";
  result += "|--------|--------|\n";

  const labels: Record<InfraService, string> = {
    supabase: "Supabase (DB + Auth)",
    vercel: "Vercel (Deploy)",
    railway: "Railway (Deploy)",
    stripe: "Stripe (Płatności)",
    domain: "Custom Domain",
    vps: "VPS Executor (Docker)",
  };

  for (const [service, status] of Object.entries(statuses)) {
    result += `| ${labels[service as InfraService]} | ${statusIcon(status)} |\n`;
  }

  return result;
}
