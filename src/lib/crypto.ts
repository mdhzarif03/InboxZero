import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for sensitive values at rest (Gmail refresh tokens).
 *
 * Format: base64(iv) "." base64(authTag) "." base64(ciphertext)
 * - AES-256-GCM, 96-bit random IV per encryption.
 * - Any tampering causes decryption to throw.
 * - Key is 32 bytes, supplied base64-encoded in TOKEN_ENCRYPTION_KEY.
 *
 * Key rotation note: store a key version prefix before rotating (not yet implemented).
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(envelope: string): string {
  const key = loadKey();
  const parts = envelope.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value.");
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Generates a fresh 32-byte key, base64-encoded. Used by setup scripts and docs. */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}
