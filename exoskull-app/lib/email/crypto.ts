/**
 * Email Credential Encryption
 *
 * AES-256-GCM encryption for IMAP passwords stored in the database.
 * Key from EMAIL_ENCRYPTION_KEY env var (32-byte hex string).
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.EMAIL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "EMAIL_ENCRYPTION_KEY env var is required for IMAP credential encryption",
    );
  }
  // Accept either 32-byte hex (64 chars) or raw 32 bytes
  if (key.length === 64) {
    return Buffer.from(key, "hex");
  }
  if (key.length === 32) {
    return Buffer.from(key, "utf-8");
  }
  throw new Error(
    "EMAIL_ENCRYPTION_KEY must be 32 bytes (64 hex chars or 32 ASCII chars)",
  );
}

/**
 * Encrypt an IMAP password for storage
 */
export function encryptImapPassword(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an IMAP password from storage
 */
export function decryptImapPassword(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted password format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf-8");
  decrypted += decipher.final("utf-8");

  return decrypted;
}
