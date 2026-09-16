const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const config = require("../config/env");

// Derive 32-byte key from hex string or raw string
let keyBuffer;
try {
  if (config.encryptionKey.length === 64) {
    keyBuffer = Buffer.from(config.encryptionKey, "hex");
  } else {
    keyBuffer = crypto
      .createHash("sha256")
      .update(config.encryptionKey)
      .digest();
  }
} catch (e) {
  keyBuffer = crypto
    .createHash("sha256")
    .update(config.encryptionKey || "default_key_seed")
    .digest();
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const PREFIX = "enc:v1:";

/**
 * Encrypt plaintext string using authenticated AES-256-GCM
 * @param {string} text - Plaintext to encrypt
 * @returns {string} Encrypted payload formatted as enc:v1:<iv>:<tag>:<ciphertext>
 */
function encrypt(text) {
  if (text === null || text === undefined) return text;
  const str = String(text);
  if (!str) return str;

  // Already encrypted?
  if (str.startsWith(PREFIX)) return str;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(str, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt ciphertext string using AES-256-GCM with authentication tag check
 * @param {string} payload - Ciphertext to decrypt
 * @returns {string} Original plaintext or fallback
 */
function decrypt(payload) {
  if (payload === null || payload === undefined) return payload;
  const str = String(payload);
  if (!str.startsWith(PREFIX)) {
    // Unencrypted or legacy string pass-through
    return str;
  }

  try {
    const raw = str.slice(PREFIX.length);
    const [ivHex, tagHex, dataHex] = raw.split(":");

    if (!ivHex || !tagHex || !dataHex) {
      return str;
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(dataHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed or auth tag mismatch:", err.message);
    return "[ENCRYPTED_TELEMETRY_PROTECTED]";
  }
}

/**
 * Compare admin password using timing-safe comparison
 */
function verifyAdminPassword(inputPassword) {
  if (!inputPassword) return false;
  const target = config.adminPassword;

  // Constant time comparison to prevent timing attacks
  const a = Buffer.from(String(inputPassword));
  const b = Buffer.from(String(target));

  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Mask sensitive string for public responses
 */
function maskValue(val, keep = 4) {
  if (!val) return "";
  const str = String(val);
  if (str.length <= keep) return "***";
  return "*".repeat(str.length - keep) + str.slice(-keep);
}

module.exports = {
  encrypt,
  decrypt,
  verifyAdminPassword,
  maskValue,
};
