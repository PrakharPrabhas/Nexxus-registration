const express = require("express");
const router = express.Router();
const supabaseService = require("../services/supabaseService");
const { requireAdminAuth } = require("../middleware/auth");

/**
 * GET /api/announcements
 * Public feed for student awareness announcements
 */
router.get("/", async (req, res, next) => {
  try {
    const announcements = await supabaseService.getAnnouncements();
    return res.json({
      success: true,
      announcements: announcements,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/announcements
 * Operations Command broadcasts new announcement to students (Admin Only)
 */
router.post("/", requireAdminAuth, async (req, res, next) => {
  try {
    const { title, category, priority, track, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: "Title and content are required",
      });
    }

    const created = await supabaseService.createAnnouncement({
      title,
      category: category || "Schedule",
      priority: priority || "High",
      track: track || "All Tracks",
      content,
    });

    return res.status(201).json({
      success: true,
      message: "Announcement broadcast published successfully",
      announcement: created,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/announcements/:id
 * Update existing broadcast announcement (Admin Only)
 */
router.patch("/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, category, priority, track, content } = req.body;

    const updated = await supabaseService.updateAnnouncement(id, {
      title,
      category,
      priority,
      track,
      content,
    });

    return res.json({
      success: true,
      message: "Announcement updated successfully",
      announcement: updated,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/announcements/:id
 * Alias for update
 */
router.put("/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, category, priority, track, content } = req.body;

    const updated = await supabaseService.updateAnnouncement(id, {
      title,
      category,
      priority,
      track,
      content,
    });

    return res.json({
      success: true,
      message: "Announcement updated successfully",
      announcement: updated,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/announcements/:id
 * Remove announcement (Admin Only)
 */
router.delete("/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await supabaseService.deleteAnnouncement(id);
    return res.json({
      success: true,
      message: "Announcement deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
