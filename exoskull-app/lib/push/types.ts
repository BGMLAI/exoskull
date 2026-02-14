/**
 * Push Notification Types
 */

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export interface PushResult {
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}

export interface DeviceToken {
  id: string;
  tenant_id: string;
  token: string;
  platform: string;
  device_name: string | null;
  created_at: string;
  updated_at: string;
}
