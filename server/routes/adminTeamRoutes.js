const express = require("express");
const router = express.Router();
const service = require("../services/supabaseService");
const { requireAdminAuth } = require("../middleware/auth");
const { decrypt } = require("../utils/crypto");

/**
 * GET /api/admin/teams
 * Fetch all teams for admin panel
 */
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
            name:
              users.find((u) => u.id === m.user_id)?.name || "—",
          })),
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH /api/admin/teams/:id
 */
router.patch("/teams/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const t = await service.updateTeam(req.params.id, req.body);
    res.json({ success: true, team: t });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/admin/teams/:id
 */
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

/**
 * GET /api/admin/teams/export-csv
 *
 * Fetches existing team + leader + member data
 * and creates a management CSV.
 *
 * This is READ ONLY.
 * It does not modify Supabase or any existing process.
 */
router.get(
  "/teams/export-csv",
  requireAdminAuth,
  async (req, res, next) => {
    try {
      const [teams, users, members, problems] = await Promise.all([
        service.getTeams(),
        service.getUsers(),
        service.getTeamMembers(),
        service.getProblems(true),
      ]);

      // CSV-safe value
      const csvValue = (value) =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;

      // Extract leader registration details from existing metadata
      const getLeaderDetails = (leader) => {
        if (!leader) {
          return {
            phone: "",
            rollNo: "",
            course: "",
            branch: "",
            section: "",
          };
        }

        const raw = leader.password_hash || leader.username || "";

        if (!raw.includes("|")) {
          return {
            phone: "",
            rollNo: "",
            course: "",
            branch: "",
            section: "",
          };
        }

        const parts = raw.split("|");

        let rollNo = "";
        let phone = "";

        try {
          rollNo = parts[0] ? decrypt(parts[0]) : "";
        } catch (_) {
          rollNo = "";
        }

        try {
          phone = parts[2] ? decrypt(parts[2]) : "";
        } catch (_) {
          phone = "";
        }

        return {
          rollNo,
          phone,
          course: parts[3] || "",
          branch: parts[4] || "",
          section: parts[5] || "",
        };
      };

      // Extract actual NEXX team verification code
      const getTeamCode = (team) => {
        const abstract = String(team.abstract || "");

        const match = abstract.match(/\[CODE:\s*([^\]]+)\]/i);

        return match ? match[1].trim() : "";
      };

      const headers = [
        "Team Code",
        "Team Name",
        "Leader Name",
        "Leader Email",
        "Leader Phone",
        "Leader Roll Number",
        "Leader Year",
        "Leader Course",
        "Leader Specialization / Branch",
        "Leader Section",
        "Members",
        "Track",
        "Problem Code",
        "Problem Statement",
      ];

      const rows = teams.map((team) => {
        const teamMembers = members.filter(
          (member) => member.team_id === team.id,
        );

        const leader = users.find(
          (user) => String(user.id) === String(team.leader_id),
        );

        const leaderDetails = getLeaderDetails(leader);

        const problem = problems.find(
          (p) =>
            String(p.id) ===
            String(team.problem_statement_id),
        );

        return [
          csvValue(getTeamCode(team)),
          csvValue(team.name || ""),
          csvValue(leader?.name || ""),
          csvValue(leader?.email || ""),
          csvValue(leaderDetails.phone),
          csvValue(leaderDetails.rollNo),
          csvValue(leader?.year || ""),
          csvValue(leaderDetails.course),
          csvValue(leaderDetails.branch),
          csvValue(leaderDetails.section),
          csvValue(`${teamMembers.length}/4`),
          csvValue(team.track || ""),
          csvValue(problem?.code || ""),
          csvValue(problem?.title || ""),
        ].join(",");
      });

      const csv = [headers.join(","), ...rows].join("\r\n");

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8",
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="nexxathon-teams.csv"',
      );

      // UTF-8 BOM for Excel
      res.send("\uFEFF" + csv);
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;