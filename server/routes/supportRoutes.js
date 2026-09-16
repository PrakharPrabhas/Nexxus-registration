const express = require("express");
const router = express.Router();
const supabaseService = require("../services/supabaseService");
const { encrypt, decrypt } = require("../utils/crypto");
const { requireAdminAuth } = require("../middleware/auth");

/**
 * POST /api/support/tickets
 * Public inquiry submission with message encryption
 */
router.post("/tickets", async (req, res, next) => {
  try {
    const { name, email, category, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and message are required",
      });
    }

    const encryptedMsg = encrypt(message);
    const ticket = await supabaseService.createSupportTicket({
      name,
      email,
      category,
      message: encryptedMsg,
    });

    return res.status(201).json({
      success: true,
      message: "Support inquiry logged with Operations Desk",
      ticket: {
        id: ticket.id,
        ticket_id: ticket.ticket_id,
        status: ticket.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/support/tickets
 * Admin fetches all tickets with decrypted messages
 */
router.get("/tickets", requireAdminAuth, async (req, res, next) => {
  try {
    const tickets = await supabaseService.getSupportTickets();
    const decryptedTickets = tickets.map((t) => ({
      ...t,
      message: decrypt(t.message),
    }));

    return res.json({
      success: true,
      tickets: decryptedTickets,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/support/tickets/:id
 * Admin updates ticket status (e.g., RESOLVED)
 */
router.patch("/tickets/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, error: "Status is required" });
    }

    await supabaseService.updateSupportTicket(id, status);
    return res.json({
      success: true,
      message: `Ticket status updated to ${status}`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
