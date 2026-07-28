import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const TOKEN_FORMAT_VERSION = "v1";
const IV_BYTES = 12;

const requireAes256Key = (key: Buffer) => {
  if (key.length !== 32) {
    throw new Error("Token encryption key must be 32 bytes");
  }
};

export const encryptToken = (plaintext: string, key: Buffer) => {
  requireAes256Key(key);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();

  return [
    TOKEN_FORMAT_VERSION,
    iv.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

export const decryptToken = (sealed: string, key: Buffer) => {
  requireAes256Key(key);

  const [version, encodedIv, encodedTag, encodedCiphertext, ...extraParts] =
    sealed.split(".");

  if (
    version !== TOKEN_FORMAT_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extraParts.length > 0
  ) {
    throw new Error("Unsupported encrypted token format");
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const authenticationTag = Buffer.from(encodedTag, "base64url");
  const ciphertext = Buffer.from(encodedCiphertext, "base64url");

  if (iv.length !== IV_BYTES || authenticationTag.length !== 16) {
    throw new Error("Invalid encrypted token");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authenticationTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
};
