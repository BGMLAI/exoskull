/**
 * Supabase authentication (email/password → JWT)
 *
 * Supabase URL and anon key are read from config.yaml or env variables.
 * These are PUBLIC keys (safe to embed — RLS enforces security).
 */

import { createClient } from "@supabase/supabase-js";
import { loadCredentials, saveCredentials, clearCredentials, loadConfig, type Credentials } from "./config.js";

function getSupabaseConfig(): { url: string; anonKey: string } {
  const config = loadConfig();

  const url = process.env.SUPABASE_URL
    || (config as any).supabase_url
    || "";

  const anonKey = process.env.SUPABASE_ANON_KEY
    || (config as any).supabase_anon_key
    || "";

  if (!url || !anonKey) {
    throw new Error(
      "Supabase not configured. Add to ~/.exoskull/config.yaml:\n" +
      "  supabase_url: https://YOUR_PROJECT.supabase.co\n" +
      "  supabase_anon_key: YOUR_ANON_KEY\n" +
      "Or set SUPABASE_URL and SUPABASE_ANON_KEY env variables.",
    );
  }

  return { url, anonKey };
}

function getSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey);
}

export async function login(
  email: string,
  password: string,
): Promise<Credentials> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Login failed: ${error.message}`);
  }

  if (!data.session) {
    throw new Error("Login failed: no session returned");
  }

  const creds: Credentials = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at || Math.floor(Date.now() / 1000) + 3600,
    user_id: data.user.id,
    email: data.user.email || email,
  };

  saveCredentials(creds);
  return creds;
}

export async function getValidToken(): Promise<string> {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error("Not logged in. Run: exo-agent login");
  }

  // Check if token expires within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (creds.expires_at - now > 300) {
    return creds.access_token;
  }

  // Refresh token
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: creds.refresh_token,
  });

  if (error || !data.session) {
    clearCredentials();
    throw new Error("Session expired. Run: exo-agent login");
  }

  const refreshed: Credentials = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at || Math.floor(Date.now() / 1000) + 3600,
    user_id: data.user!.id,
    email: data.user!.email || creds.email,
  };

  saveCredentials(refreshed);
  return refreshed.access_token;
}

export function getApiUrl(): string {
  const config = loadConfig();
  return config.api_url;
}

export function logout(): void {
  clearCredentials();
}

export function isLoggedIn(): boolean {
  return loadCredentials() !== null;
}
