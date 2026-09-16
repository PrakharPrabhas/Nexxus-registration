const crypto = require("crypto");

/**
 * Generate cryptographically secure unique team verification code
 * e.g., NEXX-26-K9X2B4
 */
function generateTeamCode(prefix = "NEXX-26") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `${prefix}-${code}`;
}

/**
 * Generate UUID v4
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Generate unique public IDs
 */
function generatePublicId(prefix = "USER-26") {
  return `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

module.exports = {
  generateTeamCode,
  generateUUID,
  generatePublicId,
};
