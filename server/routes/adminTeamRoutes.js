const express = require("express");
const router = express.Router();
const service = require("../services/supabaseService");
const { requireAdminAuth } = require("../middleware/auth");
router.get("/teams", requireAdminAuth, async (req, res, next) => {
  try {
    const teams = await service.getTeams();
    const users = await service.getUsers();
    const members = await service.getTeamMembers();
    res.json({
      success: true,
      teams: teams.map((t) => {
        const ms = members.filter((m) => m.team_id === t.id);
        const leader = users.find((u) => u.id === t.leader_id);
        return {
          ...t,
          memberCount: ms.length,
          leaderName: leader?.name || "—",
          members: ms.map((m) => ({
            role: m.role,
            status: m.status,
            name: users.find((u) => u.id === m.user_id)?.name || "—",
          })),
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});
router.patch("/teams/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const t = await service.updateTeam(req.params.id, req.body);
    res.json({ success: true, team: t });
  } catch (e) {
    next(e);
  }
});
router.delete("/teams/:id", requireAdminAuth, async (req, res, next) => {
  try {
    await service.deleteTeam(req.params.id);
    res.json({
      success: true,
      message: "Team deleted successfully from Supabase",
    });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
