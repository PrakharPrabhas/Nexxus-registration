const express = require("express");
const router = express.Router();
const supabaseService = require("../services/supabaseService");
const { encrypt, decrypt, maskValue } = require("../utils/crypto");
const { generatePublicId } = require("../utils/codeGenerator");
const { requireAdminAuth } = require("../middleware/auth");

/**
 * Helper to parse user metadata and decrypt sensitive parts
 */
function parseUserMetadata(userOrStr, shouldDecrypt = true) {
  let rollNo = "";
  let college = "";
  let phone = "";
  let course = "B.Tech";
  let branch = "CSE";
  let section = "A";
  let approvalStatus = "APPROVED";

  let raw = "";
  if (typeof userOrStr === "string") {
    raw = userOrStr;
  } else if (userOrStr && typeof userOrStr === "object") {
    if (userOrStr.password_hash && userOrStr.password_hash.includes("|")) {
      raw = userOrStr.password_hash;
    } else if (userOrStr.username && userOrStr.username.includes("|")) {
      raw = userOrStr.username;
    }
  }

  if (raw && raw.includes("|")) {
    const parts = raw.split("|");
    const rawRoll = parts[0] || "";
    college = parts[1] || "";
    const rawPhone = parts[2] || "";
    course = parts[3] || "B.Tech";
    branch = parts[4] || "CSE";
    section = parts[5] || "A";
    approvalStatus = parts[6] || "APPROVED";

    rollNo = shouldDecrypt ? decrypt(rawRoll) : rawRoll;
    phone = shouldDecrypt ? decrypt(rawPhone) : rawPhone;
  }

  return { rollNo, college, phone, course, branch, section, approvalStatus };
}

/**
 * GET /api/students/status/:query
 * Public lookup for Candidate / Team Status check
 */
router.get("/status/:query", async (req, res, next) => {
  try {
    const query = req.params.query.trim();
    if (!query) {
      return res
        .status(400)
        .json({ success: false, error: "Query parameter required" });
    }

    const [users, teams, members] = await Promise.all([
      supabaseService.getUsers(),
      supabaseService.getTeams(),
      supabaseService.getTeamMembers(),
    ]);

    const teamMap = new Map();
    teams.forEach((t) => teamMap.set(t.id, t));

    const cleanQuery = query.toUpperCase();

    // 1. Check if matching team code
    const matchingTeam = teams.find(
      (t) =>
        (t.team_id && t.team_id.toUpperCase() === cleanQuery) ||
        (t.abstract && t.abstract.toUpperCase().includes(cleanQuery)),
    );

    if (matchingTeam) {
      const teamMembers = members.filter((m) => m.team_id === matchingTeam.id);
      const memberDetails = teamMembers.map((m) => {
        const u = users.find((user) => user.id === m.user_id);
        const meta = u ? parseUserMetadata(u, true) : {};
        return {
          name: u ? u.name : "Unknown",
          role: m.role,
          status: m.status,
          college: meta.college || "",
          // Mask sensitive details on public status page
          rollNo: maskValue(meta.rollNo, 3),
          course: meta.course || "B.Tech",
          branch: meta.branch || "CSE",
          section: meta.section || "A",
        };
      });

      return res.json({
        success: true,
        type: "TEAM",
        team: {
          id: matchingTeam.id,
          team_id: matchingTeam.team_id,
          name: matchingTeam.name,
          track: matchingTeam.track,
          memberCount: teamMembers.length,
          maxMembers: 4,
          members: memberDetails,
        },
      });
    }

    // 2. Check if matching user by email or decrypted roll number
    const matchingUser = users.find((u) => {
      if (u.email && u.email.toLowerCase() === query.toLowerCase()) return true;
      const meta = parseUserMetadata(u, true);
      return meta.rollNo && meta.rollNo.toUpperCase() === cleanQuery;
    });

    if (matchingUser) {
      const meta = parseUserMetadata(matchingUser, true);
      const membership = members.find((m) => m.user_id === matchingUser.id);
      const team = membership ? teamMap.get(membership.team_id) : null;

      return res.json({
        success: true,
        type: "STUDENT",
        student: {
          name: matchingUser.name,
          email: matchingUser.email,
          role: membership ? membership.role : "SOLO",
          status: membership ? membership.status : "VERIFIED",
          college: meta.college,
          rollNo: maskValue(meta.rollNo, 3),
          course: meta.course,
          branch: meta.branch,
          section: meta.section,
          year: matchingUser.year || "",
          team: team
            ? {
                name: team.name,
                team_id: team.team_id,
                track: team.track,
              }
            : null,
        },
      });
    }

    return res.status(404).json({
      success: false,
      error:
        "No team or student found matching this verification code, email, or roll number.",
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   PROTECTED ADMIN CANDIDATE ROUTES (Signed JWT Required)
   ========================================================= */

/**
 * GET /api/admin/candidates
 * Operations Command retrieves all candidates with decrypted roll/phone telemetry
 */
router.get("/candidates", requireAdminAuth, async (req, res, next) => {
  try {
    const [users, teams, members] = await Promise.all([
      supabaseService.getUsers(),
      supabaseService.getTeams(),
      supabaseService.getTeamMembers(),
    ]);

    const teamMap = new Map();
    teams.forEach((t) => teamMap.set(t.id, t));

    const memberMap = new Map();
    members.forEach((m) => {
      if (!memberMap.has(m.user_id)) memberMap.set(m.user_id, []);
      memberMap.get(m.user_id).push(m);
    });

    const candidates = users.map((user) => {
      const userMemberships = memberMap.get(user.id) || [];
      const primaryMembership = userMemberships[0] || null;
      const team = primaryMembership
        ? teamMap.get(primaryMembership.team_id)
        : null;
      const meta = parseUserMetadata(user, true);

      // Extract verification code from team abstract if present
      let teamCode = team ? team.team_id || "NONE" : "NONE";
      if (team && team.abstract && team.abstract.includes("[CODE: ")) {
        const match = team.abstract.match(/\[CODE:\s*([^\]]+)\]/);
        if (match) teamCode = match[1];
      }

      return {
        id: user.id,
        public_user_id: user.public_user_id,
        name: user.name,
        email: user.email,
        college: meta.college,
        rollNo: meta.rollNo, // Decrypted for admin
        phone: meta.phone, // Decrypted for admin
        course: meta.course,
        branch: meta.branch,
        section: meta.section,
        year: user.year || "",
        team_id: team ? team.id : null,
        team_name: team ? team.name : "UNASSIGNED",
        team_code: teamCode,
        track: team ? team.track : "General Track",
        role: primaryMembership ? primaryMembership.role : "SOLO",
        status: meta.approvalStatus || "APPROVED", // 'APPROVED' or 'PENDING'
        created_at: user.created_at,
      };
    });

    return res.json({
      success: true,
      count: candidates.length,
      candidates: candidates,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/candidates/:id/approve
 * Admin approves a teammate directly in Supabase
 */
router.patch(
  "/candidates/:id/approve",
  requireAdminAuth,
  async (req, res, next) => {
    try {
      const userId = req.params.id;
      const users = await supabaseService.getUsers();
      const user = users.find((u) => u.id === userId);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "Candidate record not found" });
      }

      const meta = parseUserMetadata(user, false);
      const updatedMeta = `${meta.rollNo}|${meta.college}|${meta.phone}|${meta.course}|${meta.branch}|${meta.section}|APPROVED`;

      const updated = await supabaseService.updateUser(userId, {
        password_hash: updatedMeta,
      });
      return res.json({
        success: true,
        message: `Teammate "${user.name}" officially APPROVED in Supabase!`,
        candidate: updated,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/admin/candidates/approve-all
 * Admin approves all pending teammates in one click
 */
router.post(
  "/candidates/approve-all",
  requireAdminAuth,
  async (req, res, next) => {
    try {
      const users = await supabaseService.getUsers();
      let approvedCount = 0;

      for (const user of users) {
        const meta = parseUserMetadata(user, false);
        if (meta.approvalStatus === "PENDING") {
          const updatedMeta = `${meta.rollNo}|${meta.college}|${meta.phone}|${meta.course}|${meta.branch}|${meta.section}|APPROVED`;
          await supabaseService.updateUser(user.id, {
            password_hash: updatedMeta,
          });
          approvedCount++;
        }
      }

      return res.json({
        success: true,
        message: `Successfully approved ${approvedCount} pending teammate(s) in Supabase!`,
        approvedCount,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/admin/candidates
 * Admin manually provisions a candidate with full academic, team, and phone data
 */
router.post("/candidates", requireAdminAuth, async (req, res, next) => {
  try {
    const {
      name,
      email,
      rollNo,
      phone,
      college,
      course,
      branch,
      section,
      year,
      teamName,
      track,
      role,
      status,
    } = req.body;
    if (!name || !email) {
      return res
        .status(400)
        .json({ success: false, error: "Name and email are required" });
    }

    const encRoll = encrypt(rollNo || "");
    const encPhone = encrypt(phone || "");
    const candidateStatus = status || "APPROVED";
    const meta = `${encRoll}|${college || ""}|${encPhone}|${course || "B.Tech"}|${branch || "CSE"}|${section || "A"}|${candidateStatus}`;

    const user = await supabaseService.createUser({
      public_user_id: generatePublicId("USER-26"),
      name,
      email,
      username: meta,
      password_hash: meta,
      year: year || null,
    });

    // If team name is provided, assign to team
    if (teamName) {
      const teams = await supabaseService.getTeams();
      let team = teams.find(
        (t) => t.name.toLowerCase() === teamName.trim().toLowerCase(),
      );

      if (team) {
        const members = await supabaseService.getMembersByTeamId(team.id);
        if (members.length >= 4) {
          return res.status(400).json({
            success: false,
            error: `Team "${team.name}" is already at full capacity (4/4 members).`,
          });
        }
      } else {
        const { generateTeamCode } = require("../utils/codeGenerator");
        const code = generateTeamCode("NEXX-26");
        team = await supabaseService.createTeam({
          name: teamName.trim(),
          track: track || "All Tracks",
          abstract: `[CODE: ${code}] Admin Provisioned Squad`,
          leader_id: user.id,
        });
      }

      await supabaseService.addTeamMember({
        team_id: team.id,
        user_id: user.id,
        role: role || (team.leader_id === user.id ? "LEADER" : "MEMBER"),
        status: candidateStatus === "APPROVED" ? "ACTIVE" : "PENDING",
      });
    }

    return res.status(201).json({ success: true, candidate: user });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/candidates/:id
 * Admin updates candidate metadata, phone, course/branch/section, or membership
 */
router.patch("/candidates/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const userId = req.params.id;
    const {
      name,
      email,
      rollNo,
      phone,
      college,
      course,
      branch,
      section,
      year,
      status,
      role,
    } = req.body;

    const users = await supabaseService.getUsers();
    const existingUser = users.find((u) => u.id === userId);
    if (!existingUser) {
      return res
        .status(404)
        .json({ success: false, error: "Candidate record not found" });
    }

    const existingMeta = parseUserMetadata(existingUser, false);

    const targetRoll =
      rollNo !== undefined ? encrypt(rollNo || "") : existingMeta.rollNo || "";
    const targetPhone =
      phone !== undefined ? encrypt(phone || "") : existingMeta.phone || "";
    const targetCollege =
      college !== undefined ? college : existingMeta.college || "";
    const targetCourse =
      course !== undefined ? course : existingMeta.course || "B.Tech";
    const targetBranch =
      branch !== undefined ? branch : existingMeta.branch || "CSE";
    const targetSection =
      section !== undefined ? section : existingMeta.section || "A";
    const targetStatus =
      status !== undefined ? status : existingMeta.approvalStatus || "APPROVED";

    const serializedMeta = `${targetRoll}|${targetCollege}|${targetPhone}|${targetCourse}|${targetBranch}|${targetSection}|${targetStatus}`;

    const updates = {
      password_hash: serializedMeta,
    };
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase().trim();
    if (year !== undefined) updates.year = year || null;

    const updatedUser = await supabaseService.updateUser(userId, updates);

    // If status or role is updated, persist to team_members
    if (status || role) {
      const memberUpdates = {};
      if (status)
        memberUpdates.status =
          status === "APPROVED" || status === "ACTIVE" ? "ACTIVE" : "PENDING";
      if (role) memberUpdates.role = role;
      await supabaseService.updateTeamMemberByUserId(userId, memberUpdates);
    }

    return res.json({
      success: true,
      message: "Candidate record updated successfully in Supabase",
      candidate: {
        ...updatedUser,
        rollNo: rollNo !== undefined ? rollNo : decrypt(targetRoll),
        phone: phone !== undefined ? phone : decrypt(targetPhone),
        college: targetCollege,
        course: targetCourse,
        branch: targetBranch,
        section: targetSection,
        status: targetStatus,
        role: role || "MEMBER",
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/candidates/:id
 * Admin removes candidate
 */
router.delete("/candidates/:id", requireAdminAuth, async (req, res, next) => {
  try {
    const userId = req.params.id;
    await supabaseService.deleteUser(userId);
    return res.json({
      success: true,
      message: "Candidate deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/export-csv
 * Streams decrypted candidate CSV formatted with Course, Branch, Section, Role, Team, Status
 */
router.get("/export-csv", requireAdminAuth, async (req, res, next) => {
  try {
    const [users, teams, members] = await Promise.all([
      supabaseService.getUsers(),
      supabaseService.getTeams(),
      supabaseService.getTeamMembers(),
    ]);

    const teamMap = new Map();
    teams.forEach((t) => teamMap.set(t.id, t));

    const memberMap = new Map();
    members.forEach((m) => {
      if (!memberMap.has(m.user_id)) memberMap.set(m.user_id, []);
      memberMap.get(m.user_id).push(m);
    });

    const headers = [
      "Candidate ID",
      "Name",
      "Email",
      "College",
      "Roll Number",
      "Phone",
      "Course",
      "Year",
      "Branch",
      "Section",
      "Team Name",
      "Team Code",
      "Track",
      "Role",
      "Status",
      "Registered At",
    ];

    const rows = users.map((user) => {
      const userMemberships = memberMap.get(user.id) || [];
      const primaryMembership = userMemberships[0] || null;
      const team = primaryMembership
        ? teamMap.get(primaryMembership.team_id)
        : null;
      const meta = parseUserMetadata(user, true);

      let teamCode = team ? team.team_id || "NONE" : "NONE";
      if (team && team.abstract && team.abstract.includes("[CODE: ")) {
        const match = team.abstract.match(/\[CODE:\s*([^\]]+)\]/);
        if (match) teamCode = match[1];
      }

      return [
        `"${user.public_user_id || user.id}"`,
        `"${(user.name || "").replace(/"/g, '""')}"`,
        `"${user.email || ""}"`,
        `"${(meta.college || "").replace(/"/g, '""')}"`,
        `"${meta.rollNo || ""}"`,
        `"${meta.phone || ""}"`,
        `"${meta.course || "B.Tech"}"`,
        `"${user.year || ""}"`,
        `"${meta.branch || "CSE"}"`,
        `"${meta.section || "A"}"`,
        `"${team ? team.name.replace(/"/g, '""') : "UNASSIGNED"}"`,
        `"${teamCode}"`,
        `"${team ? team.track.replace(/"/g, '""') : "General Track"}"`,
        `"${primaryMembership ? primaryMembership.role : "SOLO"}"`,
        `"${primaryMembership ? primaryMembership.status : "PENDING"}"`,
        `"${user.created_at || ""}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=nexxathon_candidates_${Date.now()}.csv`,
    );
    return res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
