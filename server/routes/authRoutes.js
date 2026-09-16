const express = require("express");
const router = express.Router();
const { verifyAdminPassword } = require("../utils/crypto");
const { signAdminToken, requireAdminAuth } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/security");

/**
 * POST /api/admin/login
 * Validates the configured admin password
 */
router.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      error: "Password is required",
    });
  }

  const isValid = verifyAdminPassword(password);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: "ACCESS DENIED: Invalid Operations Command Password",
    });
  }

  const token = signAdminToken("ops_commander");
  return res.json({
    success: true,
    message: "ACCESS GRANTED: Welcome Operations Commander",
    token: token,
    role: "ADMIN",
    expiresIn: "24h",
  });
});

/**
 * GET /api/admin/verify
 * Validates current JWT session
 */
router.get("/verify", requireAdminAuth, (req, res) => {
  return res.json({
    success: true,
    valid: true,
    user: req.user,
  });
});

/**
 * POST /api/admin/logout
 */
router.post("/logout", (req, res) => {
  return res.json({
    success: true,
    message: "Session closed successfully",
  });
});

module.exports = router;
