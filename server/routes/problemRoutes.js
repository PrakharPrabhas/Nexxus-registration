const express = require("express");
const router = express.Router();
const service = require("../services/supabaseService");
const { requireAdminAuth } = require("../middleware/auth");
router.get("/", async (req, res, next) => {
  try {
    res.json({ success: true, problems: await service.getProblems(false) });
  } catch (e) {
    next(e);
  }
});
router.post("/", requireAdminAuth, async (req, res, next) => {
  try {
    const p = await service.createProblem(req.body);
    res.status(201).json({ success: true, problem: p });
  } catch (e) {
    next(e);
  }
});
router.patch("/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const p = await service.updateProblem(req.params.id, req.body);
    res.json({ success: true, problem: p });
  } catch (e) {
    next(e);
  }
});
router.delete("/:id", requireAdminAuth, async (req, res, next) => {
  try {
    await service.deleteProblem(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
