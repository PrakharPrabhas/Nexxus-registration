const jwt = require("jsonwebtoken");
const config = require("../config/env");

/**
 * Sign JWT token for verified admin session
 */
function signAdminToken(user = "ops_commander") {
  return jwt.sign(
    {
      role: "ADMIN",
      user: user,
      issuedAt: Date.now(),
    },
    config.jwtSecret,
    { expiresIn: "24h" },
  );
}

/**
 * Middleware: Verify Bearer JWT on protected admin endpoints
 */
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: "AUTHENTICATION_REQUIRED: No authorization header provided.",
    });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return res.status(401).json({
      success: false,
      error: "AUTHENTICATION_MALFORMED: Format must be Bearer <token>.",
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: "ACCESS_FORBIDDEN: Admin privileges required.",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "SESSION_EXPIRED_OR_INVALID: Please re-authenticate.",
      details: err.message,
    });
  }
}

module.exports = {
  signAdminToken,
  requireAdminAuth,
};
