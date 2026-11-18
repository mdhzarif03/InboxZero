import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, generateEncryptionKey } from "@/lib/crypto";

describe("token encryption", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = generateEncryptionKey();
  });

  it("round-trips a refresh token", () => {
    const token = "1//refresh-token-example";
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const envelope = encryptSecret("secret");
    const [iv, tag, ct] = envelope.split(".") as [string, string, string];
    const flipped = Buffer.from(ct, "base64");
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptSecret([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });

  it("rejects malformed envelopes", () => {
    expect(() => decryptSecret("not-an-envelope")).toThrow(/Malformed/);
  });

  it("refuses a key that is not 32 bytes", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    process.env.TOKEN_ENCRYPTION_KEY = generateEncryptionKey();
  });
});
