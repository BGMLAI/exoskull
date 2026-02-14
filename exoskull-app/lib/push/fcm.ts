/**
 * Firebase Cloud Messaging (FCM) - Push Notification Service
 *
 * Sends push notifications to Android devices via Firebase Admin SDK.
 * Gracefully degrades if firebase-admin is not installed.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { PushNotification, PushResult, DeviceToken } from "./types";

let firebaseApp: any = null;
let messaging: any = null;

/**
 * Initialize Firebase Admin SDK (lazy, singleton)
 */
async function getMessaging() {
  if (messaging) return messaging;

  try {
    const admin = await import("firebase-admin");

    if (!firebaseApp) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!serviceAccount) {
        console.warn(
          "[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not configured, push disabled",
        );
        return null;
      }

      const credential = JSON.parse(serviceAccount);
      firebaseApp = admin.apps.length
        ? admin.app()
        : admin.initializeApp({
            credential: admin.credential.cert(credential),
          });
    }

    messaging = admin.messaging();
    return messaging;
  } catch (error) {
    console.warn("[FCM] firebase-admin not available:", {
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/**
 * Get all device tokens for a tenant
 */
async function getDeviceTokens(tenantId: string): Promise<DeviceToken[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("exo_device_tokens")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[FCM] Failed to fetch device tokens:", error);
    return [];
  }

  return data || [];
}

/**
 * Remove invalid tokens from database
 */
async function removeInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;

  const supabase = getServiceSupabase();
  await supabase.from("exo_device_tokens").delete().in("token", tokens);
}

/**
 * Send push notification to all devices of a tenant
 */
export async function sendPushToTenant(
  tenantId: string,
  notification: PushNotification,
): Promise<PushResult> {
  const fcm = await getMessaging();
  if (!fcm) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["FCM not configured"],
    };
  }

  const devices = await getDeviceTokens(tenantId);
  if (devices.length === 0) {
    return { success: true, sent: 0, failed: 0 };
  }

  const tokens = devices.map((d) => d.token);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const invalidTokens: string[] = [];

  // Send to each token individually for better error handling
  for (const token of tokens) {
    try {
      await fcm.send({
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl ? { imageUrl: notification.imageUrl } : {}),
        },
        data: notification.data || {},
        android: {
          priority: "high" as const,
          notification: {
            channelId: "exoskull_default",
            sound: "default",
          },
        },
      });
      sent++;
    } catch (error: any) {
      failed++;
      const errorCode = error?.code || error?.message || "unknown";
      errors.push(errorCode);

      // Remove invalid tokens
      if (
        errorCode === "messaging/invalid-registration-token" ||
        errorCode === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(token);
      }
    }
  }

  // Clean up invalid tokens
  if (invalidTokens.length > 0) {
    await removeInvalidTokens(invalidTokens);
  }

  return {
    success: sent > 0 || tokens.length === 0,
    sent,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Send push to tenant (fire-and-forget, for use in sendProactiveMessage)
 */
export async function pushNotifyTenant(
  tenantId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    await sendPushToTenant(tenantId, { title, body, data });
  } catch (error) {
    // Fire-and-forget — don't fail the caller
    console.error("[FCM] pushNotifyTenant failed:", {
      error: error instanceof Error ? error.message : error,
      tenantId,
    });
  }
}
