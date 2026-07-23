import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "./token-crypto";

const key = Buffer.alloc(32, 9);

describe("YouTube token encryption", () => {
  it("encrypts and decrypts a token without storing plaintext", () => {
    const sealed = encryptToken("refresh-secret", key);

    expect(sealed).toMatch(/^v1\.[^.]+\.[^.]+\.[^.]+$/);
    expect(sealed).not.toContain("refresh-secret");
    expect(decryptToken(sealed, key)).toBe("refresh-secret");
  });

  it("rejects tampered ciphertext", () => {
    const sealed = encryptToken("refresh-secret", key);

    expect(() => decryptToken(`${sealed}x`, key)).toThrow();
  });

  it("requires an AES-256 key", () => {
    expect(() => encryptToken("secret", Buffer.alloc(16))).toThrow(
      "Token encryption key must be 32 bytes",
    );
  });
});
